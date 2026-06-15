// config.rs — Reads MCP server entries from Claude Code config files
//
// ========== SAMAJHNE WALI BAAT ==========
//
// MCP servers 3 legit jagah se aa sakte hain:
//
//   1. User-level:    ~/.mcp.json           (tune manually add kiye)
//   2. Project-level: <project>/.mcp.json   (project-specific)
//   3. Claude Desktop: %APPDATA%/Claude/claude_desktop_config.json
//
// PLUGIN servers sirf tab count hone chahiye jab wo ENABLED hain!
// ~/.claude/settings.json mein "enabledPlugins" check karna padta hai.
// Cached/downloaded plugins ≠ active plugins.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

// ══════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════

/// Raw MCP server entry from JSON
#[derive(Deserialize, Debug, Clone)]
struct McpServerRaw {
    command: Option<String>,
    args: Option<Vec<serde_json::Value>>,
    env: Option<HashMap<String, String>>,
    url: Option<String>,
    #[serde(rename = "type")]
    server_type: Option<String>,
    headers: Option<HashMap<String, String>>,
}

/// What we send to the frontend — clean, enriched with metadata
#[derive(Serialize, Clone, Debug)]
pub struct McpServerInfo {
    pub name: String,
    pub source: String,
    pub source_path: String,
    pub command: String,
    pub args: Vec<String>,
    pub env_keys: Vec<String>,
    pub estimated_tokens: u32,
    pub real_tokens: Option<u32>,
    pub tool_count: Option<u32>,
    pub server_type: String,           // "stdio" | "http" | "sse"
    pub header_keys: Vec<String>,      // header names only — never leak values!
}

/// Shape of ~/.claude/settings.json — we only care about enabledPlugins
///
/// enabledPlugins looks like:
/// { "frontend-design@claude-plugins-official": true }
///
/// Key format: "plugin-name@marketplace-id"
/// We extract the plugin-name part to match against plugin folder names
#[derive(Deserialize, Debug)]
struct ClaudeSettings {
    #[serde(default, rename = "enabledPlugins")]
    enabled_plugins: HashMap<String, serde_json::Value>,
}

// ══════════════════════════════════════════════════════════════════
// MAIN COMMAND
// ══════════════════════════════════════════════════════════════════

#[tauri::command]
pub fn read_mcp_configs() -> Result<Vec<McpServerInfo>, String> {
    let mut servers: Vec<McpServerInfo> = Vec::new();

    if let Some(home) = home_dir() {
        // ── 1. User-level: ~/.mcp.json ───────────────────────────
        // Ye file TU manually banata hai — ye REAL servers hain
        let user_mcp = home.join(".mcp.json");
        if user_mcp.exists() {
            match read_servers_from_file(&user_mcp, "user") {
                Ok(mut s) => servers.append(&mut s),
                Err(e) => eprintln!("Warning: could not parse ~/.mcp.json: {}", e),
            }
        }

        // ── 2. Plugin-level: SIRF ENABLED plugins ───────────────
        // Pehle settings.json se enabled plugins ki list lo
        // Phir SIRF unhi plugins ke .mcp.json padho
        let enabled = get_enabled_plugin_names(&home);

        if !enabled.is_empty() {
            let plugins_base = home
                .join(".claude")
                .join("plugins")
                .join("marketplaces");

            if plugins_base.exists() {
                // Har enabled plugin ke liye uska .mcp.json dhundho
                for plugin_name in &enabled {
                    // Plugin folders can be in any marketplace subfolder
                    // e.g., .../claude-plugins-official/external_plugins/discord/
                    if let Ok(found) = find_plugin_mcp_json(&plugins_base, plugin_name) {
                        for path in found {
                            match read_servers_from_file(&path, "plugin") {
                                Ok(mut s) => servers.append(&mut s),
                                Err(e) => eprintln!("Warning: {}: {}", path.display(), e),
                            }
                        }
                    }
                }
            }
        }
    }

    // ── 3. Project-level: ./.mcp.json ────────────────────────────
    let project_mcp = PathBuf::from(".mcp.json");
    if project_mcp.exists() {
        match read_servers_from_file(&project_mcp, "project") {
            Ok(mut s) => servers.append(&mut s),
            Err(e) => eprintln!("Warning: project .mcp.json: {}", e),
        }
    }

    // ── 4. Claude Desktop ─────────────────────────────────────────
    if let Some(appdata) = std::env::var_os("APPDATA") {
        let desktop_path = PathBuf::from(appdata)
            .join("Claude")
            .join("claude_desktop_config.json");
        if desktop_path.exists() {
            match read_servers_from_file(&desktop_path, "claude-desktop") {
                Ok(mut s) => servers.append(&mut s),
                Err(e) => eprintln!("Warning: desktop config: {}", e),
            }
        }
    }

    if let Some(home) = home_dir() {
        // ── 5. Cursor ───────────────────────────────────────────────
        let cursor_path = home.join(".cursor").join("mcp.json");
        if cursor_path.exists() {
            match read_servers_from_file(&cursor_path, "cursor") {
                Ok(mut s) => servers.append(&mut s),
                Err(e) => eprintln!("Warning: cursor config: {}", e),
            }
        }

        // ── 6. Windsurf (Codeium) ───────────────────────────────────
        let windsurf_path = home
            .join(".codeium")
            .join("windsurf")
            .join("mcp_config.json");
        if windsurf_path.exists() {
            match read_servers_from_file(&windsurf_path, "windsurf") {
                Ok(mut s) => servers.append(&mut s),
                Err(e) => eprintln!("Warning: windsurf config: {}", e),
            }
        }

        // ── 7. VS Code Copilot (project-level) ─────────────────────
        let vscode_path = PathBuf::from(".vscode").join("mcp.json");
        if vscode_path.exists() {
            match read_servers_from_file(&vscode_path, "vscode-copilot") {
                Ok(mut s) => servers.append(&mut s),
                Err(e) => eprintln!("Warning: vscode config: {}", e),
            }
        }

        // ── 8. Claude Code CLI: ~/.claude.json ─────────────────────
        // Stores MCPs added via `claude mcp add` — both user scope and
        // per-project (local) scope. READ-ONLY in MCP Lens: toggle/profile
        // can't manage these because the file holds Claude Code's own state
        // (47KB+ of settings/history) — writing it from us is too risky.
        let mut cli_servers = scan_claude_json(&home);
        servers.append(&mut cli_servers);
    }

    // Sort: biggest token consumer first
    servers.sort_by(|a, b| b.estimated_tokens.cmp(&a.estimated_tokens));

    Ok(servers)
}

// ══════════════════════════════════════════════════════════════════
// ENABLED PLUGINS CHECK
// ══════════════════════════════════════════════════════════════════

/// Read ~/.claude/settings.json and extract enabled plugin names.
///
/// settings.json has:
///   "enabledPlugins": { "discord@claude-plugins-official": true }
///
/// We extract "discord" (part before @) as the plugin folder name.
fn get_enabled_plugin_names(home: &PathBuf) -> Vec<String> {
    let settings_path = home.join(".claude").join("settings.json");

    if !settings_path.exists() {
        return Vec::new();
    }

    let content = match std::fs::read_to_string(&settings_path) {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };

    let settings: ClaudeSettings = match serde_json::from_str(&content) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };

    settings
        .enabled_plugins
        .keys()
        // "discord@claude-plugins-official" → "discord"
        // split('@') se plugin name nikaalte hain
        .filter_map(|key| {
            let name = key.split('@').next()?;
            // Skip if not truthy (some might be set to false)
            Some(name.to_string())
        })
        .collect()
}

/// Find .mcp.json for a specific plugin by searching marketplace folders.
///
/// Structure: ~/.claude/plugins/marketplaces/<marketplace>/external_plugins/<name>/.mcp.json
fn find_plugin_mcp_json(
    marketplaces_dir: &PathBuf,
    plugin_name: &str,
) -> Result<Vec<PathBuf>, std::io::Error> {
    let mut results = Vec::new();

    // Iterate over marketplace directories
    for marketplace_entry in std::fs::read_dir(marketplaces_dir)? {
        let marketplace_path = marketplace_entry?.path();
        if !marketplace_path.is_dir() {
            continue;
        }

        // Check external_plugins/<plugin_name>/.mcp.json
        let mcp_path = marketplace_path
            .join("external_plugins")
            .join(plugin_name)
            .join(".mcp.json");

        if mcp_path.exists() {
            results.push(mcp_path);
        }

        // Also check directly: <marketplace>/<plugin_name>/.mcp.json
        let direct_path = marketplace_path
            .join(plugin_name)
            .join(".mcp.json");

        if direct_path.exists() {
            results.push(direct_path);
        }
    }

    Ok(results)
}

// ══════════════════════════════════════════════════════════════════
// FILE PARSING
// ══════════════════════════════════════════════════════════════════

/// Build a McpServerInfo from a raw JSON entry + metadata.
/// Shared by read_servers_from_file and scan_claude_json.
fn build_server_info(
    name: String,
    raw: McpServerRaw,
    source: &str,
    source_path: &str,
) -> McpServerInfo {
    // Detect server type: explicit "type" wins, else url => http, else stdio
    let server_type = if let Some(t) = &raw.server_type {
        t.clone()
    } else if raw.url.is_some() {
        "http".to_string()
    } else {
        "stdio".to_string()
    };

    let command = raw.command.clone()
        .or(raw.url.clone())
        .unwrap_or_else(|| "unknown".to_string());
    let args: Vec<String> = raw.args.clone()
        .unwrap_or_default()
        .into_iter()
        .map(|v| match v {
            serde_json::Value::String(s) => s,
            other => other.to_string(),
        })
        .collect();
    let env_keys: Vec<String> = raw.env.clone()
        .map(|e| e.keys().cloned().collect())
        .unwrap_or_default();
    let header_keys: Vec<String> = raw.headers.clone()
        .map(|h| h.keys().cloned().collect())
        .unwrap_or_default();
    let estimated_tokens = estimate_tokens(&name, &command, &args, &env_keys);

    McpServerInfo {
        name,
        source: source.to_string(),
        source_path: source_path.to_string(),
        command,
        args,
        env_keys,
        estimated_tokens,
        real_tokens: None,
        tool_count: None,
        server_type,
        header_keys,
    }
}

/// Parse a .mcp.json file and extract server entries
fn read_servers_from_file(
    path: &PathBuf,
    source: &str,
) -> Result<Vec<McpServerInfo>, String> {
    let content = std::fs::read_to_string(path)
        .map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;

    let raw_servers = parse_mcp_json(&content)
        .map_err(|e| format!("Failed to parse {}: {}", path.display(), e))?;

    let source_path = path.display().to_string();

    Ok(raw_servers
        .into_iter()
        .map(|(name, raw)| build_server_info(name, raw, source, &source_path))
        .collect())
}

/// Read Claude Code CLI's ~/.claude.json and extract MCP servers from both:
///   1. Top-level `mcpServers` map     → user scope (`claude mcp add --scope user`)
///   2. `projects.<path>.mcpServers`   → local scope (default `claude mcp add`)
///
/// These are READ-ONLY from MCP Lens's POV — Claude Code CLI manages them.
fn scan_claude_json(home: &PathBuf) -> Vec<McpServerInfo> {
    let claude_json = home.join(".claude.json");
    if !claude_json.exists() {
        return Vec::new();
    }

    let content = match std::fs::read_to_string(&claude_json) {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };

    let value: serde_json::Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(_) => return Vec::new(),
    };

    let mut results = Vec::new();
    let claude_json_path = claude_json.display().to_string();

    // 1. User scope: top-level mcpServers
    if let Some(mcp) = value.get("mcpServers") {
        if let Ok(parsed) = serde_json::from_value::<HashMap<String, McpServerRaw>>(mcp.clone()) {
            for (name, raw) in parsed {
                results.push(build_server_info(name, raw, "claude-code-user", &claude_json_path));
            }
        }
    }

    // 2. Local scope: projects.<path>.mcpServers
    //    source_path = project directory (not ~/.claude.json) so user sees where it's bound
    if let Some(projects) = value.get("projects").and_then(|v| v.as_object()) {
        for (project_path, project_data) in projects {
            if let Some(mcp) = project_data.get("mcpServers") {
                if let Ok(parsed) = serde_json::from_value::<HashMap<String, McpServerRaw>>(mcp.clone()) {
                    for (name, raw) in parsed {
                        results.push(build_server_info(name, raw, "claude-code-local", project_path));
                    }
                }
            }
        }
    }

    results
}

/// Search by name across both scopes in ~/.claude.json.
/// Used by count_real_tokens so HTTP scans work for Claude Code-managed servers.
fn find_in_claude_json(name: &str) -> Option<McpServerRaw> {
    let home = home_dir()?;
    let claude_json = home.join(".claude.json");
    if !claude_json.exists() {
        return None;
    }
    let content = std::fs::read_to_string(&claude_json).ok()?;
    let value: serde_json::Value = serde_json::from_str(&content).ok()?;

    if let Some(mcp) = value.get("mcpServers") {
        if let Ok(parsed) = serde_json::from_value::<HashMap<String, McpServerRaw>>(mcp.clone()) {
            if let Some(raw) = parsed.get(name) {
                return Some(raw.clone());
            }
        }
    }

    if let Some(projects) = value.get("projects").and_then(|v| v.as_object()) {
        for (_, project_data) in projects {
            if let Some(mcp) = project_data.get("mcpServers") {
                if let Ok(parsed) = serde_json::from_value::<HashMap<String, McpServerRaw>>(mcp.clone()) {
                    if let Some(raw) = parsed.get(name) {
                        return Some(raw.clone());
                    }
                }
            }
        }
    }

    None
}

/// Handle both .mcp.json formats:
///   Format 1: { "mcpServers": { "name": {...} } }
///   Format 2: { "name": { "command": "..." } }
fn parse_mcp_json(content: &str) -> Result<HashMap<String, McpServerRaw>, String> {
    let value: serde_json::Value = serde_json::from_str(content)
        .map_err(|e| format!("Invalid JSON: {}", e))?;

    // Try format 1: mcpServers wrapper
    if let Some(mcp_servers) = value.get("mcpServers") {
        let servers: HashMap<String, McpServerRaw> = serde_json::from_value(mcp_servers.clone())
            .map_err(|e| format!("Failed to parse mcpServers: {}", e))?;
        return Ok(servers);
    }

    // Try format 2: direct keys
    let obj = value.as_object()
        .ok_or_else(|| "Expected JSON object".to_string())?;

    let mut servers = HashMap::new();
    for (key, val) in obj {
        if key == "preferences" || key == "$schema" {
            continue;
        }
        if let Ok(server) = serde_json::from_value::<McpServerRaw>(val.clone()) {
            if server.command.is_some() || server.url.is_some() || server.server_type.is_some() {
                servers.insert(key.clone(), server);
            }
        }
    }

    Ok(servers)
}

// ══════════════════════════════════════════════════════════════════
// TOKEN ESTIMATION
// ══════════════════════════════════════════════════════════════════

fn estimate_tokens(
    name: &str,
    command: &str,
    args: &[String],
    env_keys: &[String],
) -> u32 {
    // Known servers — approximate token costs based on tool count
    let known_cost = match name.to_lowercase().as_str() {
        "github"      => Some(8500),
        "gitlab"      => Some(7000),
        "filesystem"  => Some(3500),
        "postgres" | "mysql" | "sqlite" => Some(2000),
        "brave-search"| "tavily"      => Some(800),
        "slack"       => Some(5000),
        "linear"      => Some(4500),
        "notion"      => Some(5500),
        "atlassian" | "jira"          => Some(9500),
        "discord"     => Some(3000),
        "telegram"    => Some(2500),
        "fakechat"    => Some(1500),
        "imessage"    => Some(2000),
        "firebase"    => Some(4000),
        "context7"    => Some(1200),
        "asana"       => Some(5000),
        "sentry"      => Some(3500),
        "docker"      => Some(3000),
        _ => None,
    };

    if let Some(cost) = known_cost {
        return cost;
    }

    // Unknown: estimate from config size
    let base_tokens: u32 = 150;
    let config_text = format!("{} {} {} {}", name, command, args.join(" "), env_keys.join(" "));
    let text_tokens = (config_text.len() as u32) / 4;
    let estimated_tool_tokens = text_tokens * 10;

    (base_tokens + estimated_tool_tokens).clamp(500, 8000)
}

/// Public wrapper so toggle.rs can also estimate tokens for disabled servers
pub fn estimate_tokens_pub(name: &str, command: &str, args: &[String], env_keys: &[String]) -> u32 {
    estimate_tokens(name, command, args, env_keys)
}

/// Find raw config for a server by name across all known config locations
fn find_server_config(name: &str) -> Result<McpServerRaw, String> {
    let mut candidate_paths: Vec<PathBuf> = Vec::new();

    if let Some(home) = home_dir() {
        candidate_paths.push(home.join(".mcp.json"));
        candidate_paths.push(home.join(".cursor").join("mcp.json"));
        candidate_paths.push(home.join(".codeium").join("windsurf").join("mcp_config.json"));
    }
    candidate_paths.push(PathBuf::from(".mcp.json"));
    if let Some(appdata) = std::env::var_os("APPDATA") {
        candidate_paths.push(PathBuf::from(appdata)
            .join("Claude")
            .join("claude_desktop_config.json"));
    }

    for path in candidate_paths {
        if !path.exists() {
            continue;
        }
        let content = match std::fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,
        };
        if let Ok(servers) = parse_mcp_json(&content) {
            if let Some(raw) = servers.get(name) {
                return Ok(raw.clone());
            }
        }
    }

    // Also check Claude Code CLI's ~/.claude.json (user + local scopes)
    if let Some(raw) = find_in_claude_json(name) {
        return Ok(raw);
    }

    Err(format!("Server '{}' not found in any MCP config", name))
}

// ══════════════════════════════════════════════════════════════════
// REAL TOKEN COUNTING — Python script call karke actual count lo
// ══════════════════════════════════════════════════════════════════

/// Result from count_tokens.py script
#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct RealTokenResult {
    pub tool_count: u32,
    pub token_count: u32,
    pub tools: Vec<ToolDetail>,
    pub error: Option<String>,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct ToolDetail {
    pub name: String,
    pub description: String,
    pub tokens: u32,
}

/// TAURI COMMAND: Count real tokens for a specific server
///
/// Reads the server config FROM .mcp.json (by name) so we have access
/// to type, url, and headers — not just what the frontend tells us.
/// This is more secure (no arbitrary headers from frontend) and ensures
/// we use the actual config Claude Code is using.
#[tauri::command]
pub fn count_real_tokens(server_name: String) -> Result<RealTokenResult, String> {
    // Find the server in the user's actual MCP config
    let raw = find_server_config(&server_name)?;

    // Determine transport
    let server_type = if let Some(t) = &raw.server_type {
        t.clone()
    } else if raw.url.is_some() {
        "http".to_string()
    } else {
        "stdio".to_string()
    };

    let script_path = find_count_script()?;
    let mut cmd_args = vec![script_path.to_string_lossy().to_string()];

    if server_type == "stdio" {
        let command = raw.command.clone()
            .ok_or("stdio server missing command")?;

        // SECURITY: allowlist of known launchers
        let allowed_commands = ["npx", "node", "python", "python3", "uvx", "bun", "deno"];
        let cmd_lower = command.to_lowercase();
        let cmd_base = cmd_lower.rsplit(['/', '\\']).next().unwrap_or(&cmd_lower);
        let cmd_name = cmd_base.trim_end_matches(".exe");

        if !allowed_commands.contains(&cmd_name) {
            return Err(format!(
                "Command '{}' is not allowed. Allowed: {}",
                command,
                allowed_commands.join(", ")
            ));
        }

        cmd_args.push("stdio".to_string());
        cmd_args.push(command);
        let args: Vec<String> = raw.args.clone()
            .unwrap_or_default()
            .into_iter()
            .map(|v| match v {
                serde_json::Value::String(s) => s,
                other => other.to_string(),
            })
            .collect();
        cmd_args.extend(args);
    } else {
        // http or sse
        let url = raw.url.clone()
            .ok_or("http server missing url")?;

        cmd_args.push("http".to_string());
        cmd_args.push(url);

        // Pass headers as "Key:Value" strings
        if let Some(headers) = &raw.headers {
            for (k, v) in headers {
                cmd_args.push(format!("{}:{}", k, v));
            }
        }
    }

    // Python script chalaao aur output padho
    // CREATE_NO_WINDOW flag (0x08000000) prevents terminal window flash on Windows
    #[cfg(target_os = "windows")]
    let output = {
        use std::os::windows::process::CommandExt;
        std::process::Command::new("python")
            .args(&cmd_args)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .output()
            .map_err(|e| format!("Failed to run count_tokens.py: {}", e))?
    };

    #[cfg(not(target_os = "windows"))]
    let output = std::process::Command::new("python")
        .args(&cmd_args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output()
        .map_err(|e| format!("Failed to run count_tokens.py: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);

    // JSON parse karo
    let result: RealTokenResult = serde_json::from_str(stdout.trim())
        .map_err(|e| format!("Failed to parse token count result: {} (output: {})", e, stdout))?;

    Ok(result)
}

/// Find count_tokens.py script — checks multiple locations:
/// 1. Next to the running .exe (for production builds)
/// 2. In src-tauri/src/ (for dev mode)
/// 3. In the app's resource directory
fn find_count_script() -> Result<PathBuf, String> {
    // 1. Next to the running executable (production)
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let beside_exe = exe_dir.join("count_tokens.py");
            if beside_exe.exists() {
                return Ok(beside_exe);
            }
        }
    }

    // 2. Dev mode: src-tauri/src/count_tokens.py
    let dev_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("src")
        .join("count_tokens.py");
    if dev_path.exists() {
        return Ok(dev_path);
    }

    Err("count_tokens.py not found. For real token scanning, ensure count_tokens.py is next to the app executable.".to_string())
}

/// Get user's home directory
fn home_dir() -> Option<PathBuf> {
    #[allow(deprecated)]
    std::env::home_dir()
}
