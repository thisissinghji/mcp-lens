// toggle.rs — Enable/disable MCP servers in config files
//
// ========== SAMAJHNE WALI BAAT ==========
//
// Jab user ek server "OFF" karta hai, hum kya karte hain:
//   1. Original .mcp.json ka BACKUP banate hain (.mcp.json.bak)
//   2. Server entry ko config se HATA dete hain
//   3. Hataye hue server ko ek SIDECAR file mein save karte hain
//      (.mcp-disabled.json) — toh wapas enable kar sakein
//
// Jab user "ON" karta hai:
//   1. Sidecar se server entry wapas laate hain
//   2. Config mein add karte hain
//   3. Backup banate hain
//
// BACKUP NON-NEGOTIABLE HAI — agar kuch galat ho toh user recover kar sake.

use serde::Deserialize;
use std::collections::HashMap;
use std::path::PathBuf;

/// Shape of .mcp.json — preserving all fields, not just mcpServers
/// `serde_json::Value` = "kuch bhi ho sakta hai" — hum structure nahi todte
type McpJsonValue = serde_json::Value;

/// What the frontend sends when toggling a server
#[derive(Deserialize, Debug)]
pub struct ToggleRequest {
    /// Server name to toggle (e.g., "filesystem")
    pub server_name: String,
    /// true = enable, false = disable
    pub enabled: bool,
    /// Which config file to modify (path)
    pub config_path: String,
}

/// ── TAURI COMMAND: toggle a server on/off ────────────────────────
///
/// Frontend calls: invoke("toggle_server", { request: {...} })
///
/// Ye function:
/// 1. Config file padhta hai
/// 2. Backup banata hai (.bak)
/// 3. Server add/remove karta hai
/// 4. Wapas likhta hai
#[tauri::command]
pub fn toggle_server(request: ToggleRequest) -> Result<String, String> {
    let config_path = resolve_config_path(&request.config_path)?;
    let disabled_path = get_disabled_path(&config_path);

    // Step 1: Read the current config
    let content = std::fs::read_to_string(&config_path)
        .map_err(|e| format!("Cannot read config: {}", e))?;

    let mut config: McpJsonValue = serde_json::from_str(&content)
        .map_err(|e| format!("Invalid JSON in config: {}", e))?;

    // Step 2: Create .bak backup BEFORE any changes
    // ========================================
    // YE LINE SABSE IMPORTANT HAI — agar baad mein kuch galat ho,
    // user .bak file se recover kar sakta hai
    let backup_path = format!("{}.bak", config_path.display());
    std::fs::write(&backup_path, &content)
        .map_err(|e| format!("Cannot create backup: {}", e))?;

    // Step 3: Read or create the disabled servers sidecar
    let mut disabled: HashMap<String, serde_json::Value> =
        read_disabled_servers(&disabled_path);

    if request.enabled {
        // ── ENABLE: move server from sidecar back to config ──────
        enable_server(&mut config, &mut disabled, &request.server_name)?;
    } else {
        // ── DISABLE: move server from config to sidecar ──────────
        disable_server(&mut config, &mut disabled, &request.server_name)?;
    }

    // Step 4: Write both files back
    let new_config_str = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Cannot serialize config: {}", e))?;
    std::fs::write(&config_path, &new_config_str)
        .map_err(|e| format!("Cannot write config: {}", e))?;

    let disabled_str = serde_json::to_string_pretty(&disabled)
        .map_err(|e| format!("Cannot serialize disabled list: {}", e))?;
    std::fs::write(&disabled_path, &disabled_str)
        .map_err(|e| format!("Cannot write disabled list: {}", e))?;

    let action = if request.enabled { "enabled" } else { "disabled" };
    Ok(format!("Server '{}' {}", request.server_name, action))
}

/// ── TAURI COMMAND: get disabled servers with full info ───────────
///
/// Returns FULL server data (not just names) so Toggle screen
/// can show disabled servers with their token count, command, etc.
///
/// Uses the same McpServerInfo struct as read_mcp_configs
/// so frontend treats enabled and disabled servers the same way.
#[tauri::command]
pub fn get_disabled_servers() -> Result<Vec<crate::config::McpServerInfo>, String> {
    let home = match home_dir() {
        Some(h) => h,
        None => return Ok(Vec::new()),
    };

    let config_path = home.join(".mcp.json");
    let disabled_path = get_disabled_path(&config_path);
    let disabled = read_disabled_servers(&disabled_path);

    let servers: Vec<crate::config::McpServerInfo> = disabled
        .into_iter()
        .map(|(name, value)| {
            // Parse the saved server entry back into McpServerInfo
            let command = value.get("command")
                .and_then(|v| v.as_str())
                .or_else(|| value.get("url").and_then(|v| v.as_str()))
                .unwrap_or("unknown")
                .to_string();

            let args: Vec<String> = value.get("args")
                .and_then(|v| v.as_array())
                .map(|arr| arr.iter().map(|v| {
                    v.as_str().map(|s| s.to_string()).unwrap_or_else(|| v.to_string())
                }).collect())
                .unwrap_or_default();

            let env_keys: Vec<String> = value.get("env")
                .and_then(|v| v.as_object())
                .map(|obj| obj.keys().cloned().collect())
                .unwrap_or_default();

            let estimated_tokens = crate::config::estimate_tokens_pub(&name, &command, &args, &env_keys);

            crate::config::McpServerInfo {
                name,
                source: "user".to_string(),
                source_path: disabled_path.display().to_string(),
                command,
                args,
                env_keys,
                estimated_tokens,
                real_tokens: None,
                tool_count: None,
            }
        })
        .collect();

    Ok(servers)
}

// ══════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════

/// Move a server from config → disabled sidecar
fn disable_server(
    config: &mut McpJsonValue,
    disabled: &mut HashMap<String, serde_json::Value>,
    server_name: &str,
) -> Result<(), String> {
    // Try to find mcpServers object in config
    // Config can be: { "mcpServers": { "name": {...} } }
    // Or direct:     { "name": { "command": "..." } }
    let servers = get_mcp_servers_mut(config)
        .ok_or_else(|| "No mcpServers found in config".to_string())?;

    let servers_obj = servers.as_object_mut()
        .ok_or_else(|| "mcpServers is not an object".to_string())?;

    // Remove server from active config
    let server_entry = servers_obj.remove(server_name)
        .ok_or_else(|| format!("Server '{}' not found in config", server_name))?;

    // Save it in the disabled sidecar
    disabled.insert(server_name.to_string(), server_entry);

    Ok(())
}

/// Move a server from disabled sidecar → config
fn enable_server(
    config: &mut McpJsonValue,
    disabled: &mut HashMap<String, serde_json::Value>,
    server_name: &str,
) -> Result<(), String> {
    // Get the server from disabled list
    let server_entry = disabled.remove(server_name)
        .ok_or_else(|| format!("Server '{}' not found in disabled list", server_name))?;

    // Add it back to config
    let servers = get_or_create_mcp_servers(config);
    let servers_obj = servers.as_object_mut()
        .ok_or_else(|| "mcpServers is not an object".to_string())?;

    servers_obj.insert(server_name.to_string(), server_entry);

    Ok(())
}

/// Get mutable reference to the mcpServers object in config
fn get_mcp_servers_mut(config: &mut McpJsonValue) -> Option<&mut serde_json::Value> {
    // Try "mcpServers" key first
    if config.get("mcpServers").is_some() {
        return config.get_mut("mcpServers");
    }
    // If no wrapper, the whole object IS the servers map
    // But we only do this if the object has server-like entries
    Some(config)
}

/// Ensure mcpServers key exists, then return mutable reference
fn get_or_create_mcp_servers(config: &mut McpJsonValue) -> &mut serde_json::Value {
    // Pehle check karo ki key hai ya nahi, agar nahi toh banao
    if !config.get("mcpServers").is_some() {
        if let Some(obj) = config.as_object_mut() {
            obj.insert("mcpServers".to_string(), serde_json::json!({}));
        }
    }
    // Ab safely return karo — hum JAANTE hain ki key ab exist karti hai
    if config.get("mcpServers").is_some() {
        config.get_mut("mcpServers").unwrap()
    } else {
        config
    }
}

/// Path for the disabled servers sidecar file
/// .mcp.json → .mcp-disabled.json
fn get_disabled_path(config_path: &PathBuf) -> PathBuf {
    let parent = config_path.parent().unwrap_or_else(|| std::path::Path::new("."));
    parent.join(".mcp-disabled.json")
}

/// Read disabled servers from sidecar file (or empty if doesn't exist)
fn read_disabled_servers(path: &PathBuf) -> HashMap<String, serde_json::Value> {
    if !path.exists() {
        return HashMap::new();
    }
    let content = match std::fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return HashMap::new(),
    };
    serde_json::from_str(&content).unwrap_or_default()
}

/// Resolve config path — ONLY allow known MCP config locations.
/// This prevents path traversal attacks where frontend could send
/// arbitrary paths like "C:\Windows\System32\..." and we'd write to them.
fn resolve_config_path(path_str: &str) -> Result<PathBuf, String> {
    let home = home_dir().ok_or("Cannot find home directory")?;

    // Allowlist of valid MCP config paths
    let allowed_paths = vec![
        home.join(".mcp.json"),                                          // Claude Code
        home.join(".cursor").join("mcp.json"),                           // Cursor
        home.join(".codeium").join("windsurf").join("mcp_config.json"),   // Windsurf
    ];

    // Also allow APPDATA paths (Claude Desktop)
    if let Some(appdata) = std::env::var_os("APPDATA") {
        let desktop_path = PathBuf::from(&appdata)
            .join("Claude")
            .join("claude_desktop_config.json");

        // Resolve the input path
        let resolved = if path_str.starts_with("~") {
            let rest = path_str.trim_start_matches("~/").trim_start_matches("~\\");
            home.join(rest)
        } else {
            PathBuf::from(path_str)
        };

        // Check against allowlist
        for allowed in allowed_paths.iter().chain(std::iter::once(&desktop_path)) {
            if resolved == *allowed {
                return Ok(resolved);
            }
        }

        return Err(format!(
            "Path '{}' is not a recognized MCP config location",
            path_str
        ));
    }

    // Fallback: resolve and check against allowlist (no APPDATA)
    let resolved = if path_str.starts_with("~") {
        let rest = path_str.trim_start_matches("~/").trim_start_matches("~\\");
        home.join(rest)
    } else {
        PathBuf::from(path_str)
    };

    for allowed in &allowed_paths {
        if resolved == *allowed {
            return Ok(resolved);
        }
    }

    Err(format!(
        "Path '{}' is not a recognized MCP config location",
        path_str
    ))
}

fn home_dir() -> Option<PathBuf> {
    #[allow(deprecated)]
    std::env::home_dir()
}
