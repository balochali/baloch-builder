use tauri_plugin_sql::{Migration, MigrationKind};

mod commands;
use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![Migration {
        version: 1,
        description: "001_init",
        sql: include_str!("../migrations/001_init.sql"),
        kind: MigrationKind::Up,
    }];

    tauri::Builder::default()
        .manage(Mutex::new(commands::auth::LoginAttempts::default()))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:baloch-builder.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            commands::paths::get_app_data_path,
            commands::files::copy_attachment,
            commands::files::open_file,
            commands::auth::auth_status,
            commands::auth::create_account,
            commands::auth::login,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
