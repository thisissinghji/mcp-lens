// lib.rs — Tauri app entry point / command router
//
// Har Rust command yahan register hota hai.
// Frontend invoke("command_name") call karta hai → Tauri yahan route karta hai.

mod config;    // read_mcp_configs
mod toggle;    // toggle_server, get_disabled_servers
mod profiles;  // list/save/apply/delete profiles

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            // Config reading
            config::read_mcp_configs,
            config::count_real_tokens,
            // Toggle servers on/off
            toggle::toggle_server,
            toggle::get_disabled_servers,
            // Profile management
            profiles::list_profiles,
            profiles::save_profile,
            profiles::apply_profile,
            profiles::delete_profile,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
