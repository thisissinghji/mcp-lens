// add.rs — Add custom MCP servers + marketplace catalog
//
// 3 Tauri commands:
//   1. add_server         → add a new MCP server to ~/.mcp.json
//   2. delete_server      → completely remove a server (different from disable)
//   3. fetch_marketplace  → fetch catalog of popular MCP servers from GitHub

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

// ══════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════

/// Request to add a new server (from frontend)
#[derive(Deserialize, Debug)]
pub struct AddServerRequest {
    pub name: String,
    pub transport: String,                       // "stdio" | "http" | "sse"
    pub command: Option<String>,                 // for stdio
    pub args: Option<Vec<String>>,               // for stdio
    pub env: Option<HashMap<String, String>>,    // for stdio (optional)
    pub url: Option<String>,                     // for http/sse
    pub headers: Option<HashMap<String, String>>, // for http/sse (optional)
}

/// Marketplace catalog entry
#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct MarketplaceEntry {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub transport: String,
    // Templates with ${PLACEHOLDER} for user-provided values
    pub command: Option<String>,
    pub args: Option<Vec<String>>,
    pub env: Option<HashMap<String, String>>,
    pub url: Option<String>,
    pub headers: Option<HashMap<String, String>>,
    // Fields the user must fill in
    pub fields: Vec<MarketplaceField>,
    pub homepage: Option<String>,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct MarketplaceField {
    pub key: String,         // placeholder name (e.g. "GITHUB_TOKEN")
    pub label: String,       // display label
    pub description: Option<String>,
    pub secret: bool,        // true = render as password field
    pub required: bool,
}

#[derive(Serialize, Debug)]
pub struct MarketplaceResponse {
    pub entries: Vec<MarketplaceEntry>,
    pub source: String,  // "github" | "fallback"
}

// ══════════════════════════════════════════════════════════════════
// EMBEDDED FALLBACK CATALOG
// If GitHub fetch fails, use this hardcoded list
// ══════════════════════════════════════════════════════════════════

const FALLBACK_CATALOG: &str = include_str!("../../marketplace.json");

// ══════════════════════════════════════════════════════════════════
// COMMAND: add_server
// ══════════════════════════════════════════════════════════════════

#[tauri::command]
pub fn add_server(server: AddServerRequest) -> Result<String, String> {
    // ── Validation ──────────────────────────────────────────────
    validate_server_name(&server.name)?;
    validate_transport(&server)?;

    let home = home_dir().ok_or("Cannot find home directory")?;
    let config_path = home.join(".mcp.json");

    // ── Check name conflict (in active + disabled) ──────────────
    check_name_conflict(&server.name, &config_path)?;

    // ── Read existing config (or create empty) ──────────────────
    let mut config: serde_json::Value = if config_path.exists() {
        let content = std::fs::read_to_string(&config_path)
            .map_err(|e| format!("Cannot read .mcp.json: {}", e))?;
        // Don't overwrite malformed config
        serde_json::from_str(&content)
            .map_err(|e| format!("Existing .mcp.json is malformed (will not overwrite): {}", e))?
    } else {
        serde_json::json!({ "mcpServers": {} })
    };

    // Backup BEFORE any modification
    if config_path.exists() {
        let original = std::fs::read_to_string(&config_path).unwrap_or_default();
        let backup_path = format!("{}.bak", config_path.display());
        std::fs::write(&backup_path, original)
            .map_err(|e| format!("Failed to create backup: {}", e))?;
    }

    // ── Build server entry ──────────────────────────────────────
    let entry = build_server_entry(&server);

    // ── Insert into mcpServers ──────────────────────────────────
    if config.get("mcpServers").is_none() {
        if let Some(obj) = config.as_object_mut() {
            obj.insert("mcpServers".to_string(), serde_json::json!({}));
        }
    }

    let servers = config.get_mut("mcpServers")
        .and_then(|v| v.as_object_mut())
        .ok_or("mcpServers is not an object")?;

    servers.insert(server.name.clone(), entry);

    // ── Atomic write: write to temp, then rename ────────────────
    write_atomic(&config_path, &config)?;

    Ok(format!("Server '{}' added successfully", server.name))
}

// ══════════════════════════════════════════════════════════════════
// COMMAND: delete_server
// ══════════════════════════════════════════════════════════════════

#[tauri::command]
pub fn delete_server(server_name: String) -> Result<String, String> {
    let home = home_dir().ok_or("Cannot find home directory")?;
    let config_path = home.join(".mcp.json");
    let disabled_path = home.join(".mcp-disabled.json");

    let mut found = false;

    // ── Try removing from active config ────────────────────────
    if config_path.exists() {
        let content = std::fs::read_to_string(&config_path)
            .map_err(|e| format!("Cannot read .mcp.json: {}", e))?;
        let mut config: serde_json::Value = serde_json::from_str(&content)
            .map_err(|e| format!("Malformed .mcp.json: {}", e))?;

        if let Some(servers) = config.get_mut("mcpServers").and_then(|v| v.as_object_mut()) {
            if servers.remove(&server_name).is_some() {
                found = true;
                // Backup + write
                let backup_path = format!("{}.bak", config_path.display());
                std::fs::write(&backup_path, &content)
                    .map_err(|e| format!("Failed to create backup: {}", e))?;
                write_atomic(&config_path, &config)?;
            }
        }
    }

    // ── Try removing from disabled sidecar ─────────────────────
    if disabled_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&disabled_path) {
            if let Ok(mut disabled) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(obj) = disabled.as_object_mut() {
                    if obj.remove(&server_name).is_some() {
                        found = true;
                        let json = serde_json::to_string_pretty(&disabled)
                            .map_err(|e| format!("Cannot serialize: {}", e))?;
                        std::fs::write(&disabled_path, json)
                            .map_err(|e| format!("Cannot write disabled file: {}", e))?;
                    }
                }
            }
        }
    }

    if found {
        Ok(format!("Server '{}' deleted", server_name))
    } else {
        Err(format!("Server '{}' not found", server_name))
    }
}

// ══════════════════════════════════════════════════════════════════
// COMMAND: fetch_marketplace
// ══════════════════════════════════════════════════════════════════

const MARKETPLACE_URL: &str =
    "https://raw.githubusercontent.com/thisissinghji/mcp-lens/main/marketplace.json";

#[tauri::command]
pub fn fetch_marketplace() -> Result<MarketplaceResponse, String> {
    // Try to fetch from GitHub first (with 10s timeout)
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

    let from_github = client.get(MARKETPLACE_URL).send().ok()
        .and_then(|resp| if resp.status().is_success() { resp.text().ok() } else { None });

    // Use GitHub data if available, else fallback to embedded
    let (json_str, source) = match from_github {
        Some(s) => (s, "github"),
        None => (FALLBACK_CATALOG.to_string(), "fallback"),
    };

    // Parse — if even fallback fails, return empty
    let entries: Vec<MarketplaceEntry> = serde_json::from_str(&json_str)
        .unwrap_or_default();

    Ok(MarketplaceResponse {
        entries,
        source: source.to_string(),
    })
}

// ══════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════

fn validate_server_name(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("Server name cannot be empty".to_string());
    }
    if name.len() > 50 {
        return Err("Server name too long (max 50 chars)".to_string());
    }
    // Allow alphanumeric, dash, underscore
    if !name.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_') {
        return Err("Server name can only contain letters, numbers, dashes, and underscores".to_string());
    }
    Ok(())
}

fn validate_transport(server: &AddServerRequest) -> Result<(), String> {
    match server.transport.as_str() {
        "stdio" => {
            let command = server.command.as_ref()
                .ok_or("stdio transport requires a command")?;
            if command.is_empty() {
                return Err("Command cannot be empty".to_string());
            }
            // Allowlist for security
            let allowed = ["npx", "node", "python", "python3", "uvx", "bun", "deno"];
            let cmd_lower = command.to_lowercase();
            let cmd_base = cmd_lower.rsplit(['/', '\\']).next().unwrap_or(&cmd_lower);
            let cmd_name = cmd_base.trim_end_matches(".exe");
            if !allowed.contains(&cmd_name) {
                return Err(format!(
                    "Command '{}' not allowed. Use: {}",
                    command,
                    allowed.join(", ")
                ));
            }
        }
        "http" | "sse" => {
            let url = server.url.as_ref()
                .ok_or("http/sse transport requires a URL")?;
            if !url.starts_with("http://") && !url.starts_with("https://") {
                return Err("URL must start with http:// or https://".to_string());
            }
        }
        other => {
            return Err(format!("Unknown transport: '{}'. Use 'stdio', 'http', or 'sse'", other));
        }
    }
    Ok(())
}

fn check_name_conflict(name: &str, config_path: &PathBuf) -> Result<(), String> {
    // Check active
    if config_path.exists() {
        let content = std::fs::read_to_string(config_path).unwrap_or_default();
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(servers) = value.get("mcpServers").and_then(|v| v.as_object()) {
                if servers.contains_key(name) {
                    return Err(format!("Server '{}' already exists in active config", name));
                }
            }
        }
    }

    // Check disabled
    if let Some(home) = home_dir() {
        let disabled_path = home.join(".mcp-disabled.json");
        if disabled_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&disabled_path) {
                if let Ok(value) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(obj) = value.as_object() {
                        if obj.contains_key(name) {
                            return Err(format!("Server '{}' exists in disabled list. Re-enable it instead.", name));
                        }
                    }
                }
            }
        }
    }

    Ok(())
}

fn build_server_entry(server: &AddServerRequest) -> serde_json::Value {
    let mut entry = serde_json::Map::new();

    if server.transport == "stdio" {
        if let Some(cmd) = &server.command {
            entry.insert("command".to_string(), serde_json::Value::String(cmd.clone()));
        }
        if let Some(args) = &server.args {
            if !args.is_empty() {
                entry.insert("args".to_string(),
                    serde_json::Value::Array(args.iter().map(|s| serde_json::Value::String(s.clone())).collect()));
            }
        }
        if let Some(env) = &server.env {
            if !env.is_empty() {
                entry.insert("env".to_string(), serde_json::to_value(env).unwrap());
            }
        }
    } else {
        // http or sse
        entry.insert("type".to_string(), serde_json::Value::String(server.transport.clone()));
        if let Some(url) = &server.url {
            entry.insert("url".to_string(), serde_json::Value::String(url.clone()));
        }
        if let Some(headers) = &server.headers {
            if !headers.is_empty() {
                entry.insert("headers".to_string(), serde_json::to_value(headers).unwrap());
            }
        }
    }

    serde_json::Value::Object(entry)
}

fn write_atomic(path: &PathBuf, value: &serde_json::Value) -> Result<(), String> {
    let json = serde_json::to_string_pretty(value)
        .map_err(|e| format!("Cannot serialize: {}", e))?;

    let temp_path = path.with_extension("json.tmp");
    std::fs::write(&temp_path, &json)
        .map_err(|e| format!("Failed to write temp file: {}", e))?;

    // Atomic rename — on Windows this replaces existing file
    std::fs::rename(&temp_path, path)
        .map_err(|e| format!("Failed to rename temp file: {}", e))?;

    Ok(())
}

fn home_dir() -> Option<PathBuf> {
    #[allow(deprecated)]
    std::env::home_dir()
}
