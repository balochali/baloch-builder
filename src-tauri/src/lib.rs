use tauri_plugin_sql::{Migration, MigrationKind};

mod commands;
use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "001_init",
            sql: include_str!("../migrations/001_init.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "002_project_estimates",
            sql: include_str!("../migrations/002_project_estimates.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "003_project_building_details",
            sql: include_str!("../migrations/003_project_building_details.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "004_building_layout",
            sql: include_str!("../migrations/004_building_layout.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "005_parking_area",
            sql: include_str!("../migrations/005_parking_area.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "006_udhaars",
            sql: include_str!("../migrations/006_udhaars.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "007_personal_expenses",
            sql: include_str!("../migrations/007_personal_expenses.sql"),
            kind: MigrationKind::Up,
        },
    ];

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
