// profiles.rs — Save/load/apply named MCP profiles
//
// ========== SAMAJHNE WALI BAAT ==========
//
// Profile = ek saved snapshot of which servers are ON/OFF
//
// Example profiles:
//   "Frontend Mode"  → sirf filesystem + context7 ON
//   "Full Power"     → sab ON
//   "Minimal"        → sab OFF
//
// Profiles app-data directory mein save hote hain:
//   Windows: %APPDATA%/com.mcplens.app/profiles/
//   Each profile = one JSON file: "Frontend Mode.json"
//
// Profile file shape:
// {
//   "name": "Frontend Mode",
//   "servers": {
//     "filesystem": { "command": "npx", "args": [...] },
//     "context7": { "command": "npx", "args": [...] }
//   }
// }

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

/// What a saved profile looks like
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Profile {
    pub name: String,
    pub servers: HashMap<String, serde_json::Value>,
}

/// Summary sent to frontend (without full server data)
#[derive(Serialize, Debug)]
pub struct ProfileSummary {
    pub name: String,
    pub server_count: usize,
    pub server_names: Vec<String>,
}

// ══════════════════════════════════════════════════════════════════
// TAURI COMMANDS
// ══════════════════════════════════════════════════════════════════

/// List all saved profiles
#[tauri::command]
pub fn list_profiles() -> Result<Vec<ProfileSummary>, String> {
    let profiles_dir = get_profiles_dir()?;

    if !profiles_dir.exists() {
        return Ok(Vec::new());
    }

    let mut profiles = Vec::new();

    let entries = std::fs::read_dir(&profiles_dir)
        .map_err(|e| format!("Cannot read profiles dir: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Cannot read entry: {}", e))?;
        let path = entry.path();

        // Only .json files
        if path.extension().map(|e| e == "json").unwrap_or(false) {
            if let Ok(content) = std::fs::read_to_string(&path) {
                if let Ok(profile) = serde_json::from_str::<Profile>(&content) {
                    profiles.push(ProfileSummary {
                        name: profile.name.clone(),
                        server_count: profile.servers.len(),
                        server_names: profile.servers.keys().cloned().collect(),
                    });
                }
            }
        }
    }

    Ok(profiles)
}

/// Save a named profile with SELECTED servers
///
/// selected_servers: list of server names to include
/// Hum .mcp.json + .mcp-disabled.json DONO se servers padhte hain
/// toh user disabled servers ko bhi profile mein include kar sake
#[tauri::command]
pub fn save_profile(name: String, selected_servers: Vec<String>) -> Result<String, String> {
    let profiles_dir = get_profiles_dir()?;

    std::fs::create_dir_all(&profiles_dir)
        .map_err(|e| format!("Cannot create profiles dir: {}", e))?;

    let home = home_dir().ok_or("Cannot find home directory")?;

    // Read ALL servers — both enabled (.mcp.json) and disabled (.mcp-disabled.json)
    let mut all_servers: HashMap<String, serde_json::Value> = HashMap::new();

    // 1. Active servers from .mcp.json
    let config_path = home.join(".mcp.json");
    if config_path.exists() {
        let content = std::fs::read_to_string(&config_path)
            .map_err(|e| format!("Cannot read .mcp.json: {}", e))?;
        let value: serde_json::Value = serde_json::from_str(&content)
            .map_err(|e| format!("Invalid JSON: {}", e))?;

        if let Some(mcp) = value.get("mcpServers") {
            if let Some(obj) = mcp.as_object() {
                for (k, v) in obj {
                    all_servers.insert(k.clone(), v.clone());
                }
            }
        }
    }

    // 2. Disabled servers from .mcp-disabled.json
    let disabled_path = home.join(".mcp-disabled.json");
    if disabled_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&disabled_path) {
            if let Ok(disabled) = serde_json::from_str::<HashMap<String, serde_json::Value>>(&content) {
                for (k, v) in disabled {
                    all_servers.insert(k, v);
                }
            }
        }
    }

    // 3. Filter: sirf selected servers rakho
    let selected: HashMap<String, serde_json::Value> = all_servers
        .into_iter()
        .filter(|(k, _)| selected_servers.contains(k))
        .collect();

    let profile = Profile {
        name: name.clone(),
        servers: selected,
    };

    // Save as JSON file
    let file_name = format!("{}.json", sanitize_filename(&name));
    let file_path = profiles_dir.join(&file_name);

    let json = serde_json::to_string_pretty(&profile)
        .map_err(|e| format!("Cannot serialize profile: {}", e))?;

    std::fs::write(&file_path, &json)
        .map_err(|e| format!("Cannot save profile: {}", e))?;

    Ok(format!("Profile '{}' saved with {} servers", name, profile.servers.len()))
}

/// Apply a saved profile — replaces .mcp.json with profile's servers
#[tauri::command]
pub fn apply_profile(name: String) -> Result<String, String> {
    let profiles_dir = get_profiles_dir()?;
    let file_name = format!("{}.json", sanitize_filename(&name));
    let file_path = profiles_dir.join(&file_name);

    if !file_path.exists() {
        return Err(format!("Profile '{}' not found", name));
    }

    // Read profile
    let content = std::fs::read_to_string(&file_path)
        .map_err(|e| format!("Cannot read profile: {}", e))?;
    let profile: Profile = serde_json::from_str(&content)
        .map_err(|e| format!("Invalid profile JSON: {}", e))?;

    // Backup current .mcp.json
    let home = home_dir().ok_or("Cannot find home directory")?;
    let config_path = home.join(".mcp.json");

    if config_path.exists() {
        let current = std::fs::read_to_string(&config_path).unwrap_or_default();
        let backup_path = home.join(".mcp.json.bak");
        std::fs::write(&backup_path, &current)
            .map_err(|e| format!("Cannot create backup: {}", e))?;
    }

    // Write profile servers to .mcp.json
    let new_config = serde_json::json!({
        "mcpServers": profile.servers
    });

    let json = serde_json::to_string_pretty(&new_config)
        .map_err(|e| format!("Cannot serialize config: {}", e))?;

    std::fs::write(&config_path, &json)
        .map_err(|e| format!("Cannot write config: {}", e))?;

    Ok(format!("Profile '{}' applied ({} servers)", name, profile.servers.len()))
}

/// Delete a saved profile
#[tauri::command]
pub fn delete_profile(name: String) -> Result<String, String> {
    let profiles_dir = get_profiles_dir()?;
    let file_name = format!("{}.json", sanitize_filename(&name));
    let file_path = profiles_dir.join(&file_name);

    if !file_path.exists() {
        return Err(format!("Profile '{}' not found", name));
    }

    std::fs::remove_file(&file_path)
        .map_err(|e| format!("Cannot delete profile: {}", e))?;

    Ok(format!("Profile '{}' deleted", name))
}

// ══════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════

/// Get the profiles directory path
/// Windows: %APPDATA%/com.mcplens.app/profiles/
fn get_profiles_dir() -> Result<PathBuf, String> {
    if let Some(appdata) = std::env::var_os("APPDATA") {
        Ok(PathBuf::from(appdata)
            .join("com.mcplens.app")
            .join("profiles"))
    } else if let Some(home) = home_dir() {
        Ok(home.join(".mcp-lens").join("profiles"))
    } else {
        Err("Cannot determine profiles directory".to_string())
    }
}

/// Remove unsafe characters from filename and block dangerous names
fn sanitize_filename(name: &str) -> String {
    let sanitized: String = name.chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' | '\0' => '_',
            c if c.is_control() => '_',
            _ => c,
        })
        .collect();

    // Block names that are just dots (path traversal)
    let trimmed = sanitized.trim();
    if trimmed.is_empty() || trimmed.chars().all(|c| c == '.') {
        return "unnamed_profile".to_string();
    }

    // Limit length to 100 chars
    let result: String = trimmed.chars().take(100).collect();
    result
}

fn home_dir() -> Option<PathBuf> {
    #[allow(deprecated)]
    std::env::home_dir()
}
