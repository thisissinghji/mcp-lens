// lib.rs — Tauri app entry point / command router

mod config;    // read_mcp_configs, count_real_tokens
mod toggle;    // toggle_server, get_disabled_servers
mod profiles;  // list/save/apply/delete profiles
mod add;       // add_server, delete_server, fetch_marketplace

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            config::read_mcp_configs,
            config::count_real_tokens,
            toggle::toggle_server,
            toggle::get_disabled_servers,
            profiles::list_profiles,
            profiles::save_profile,
            profiles::apply_profile,
            profiles::delete_profile,
            add::add_server,
            add::delete_server,
            add::fetch_marketplace,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
