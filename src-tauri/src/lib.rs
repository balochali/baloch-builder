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
        Migration {
            version: 8,
            description: "008_udhaar_contacts",
            sql: include_str!("../migrations/008_udhaar_contacts.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "009_udhaar_delete",
            sql: include_str!("../migrations/009_udhaar_delete.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "010_udhaar_payment_guard",
            sql: include_str!("../migrations/010_udhaar_payment_guard.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 11,
            description: "011_bank_accounts",
            sql: include_str!("../migrations/011_bank_accounts.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 12,
            description: "012_business_reset",
            sql: include_str!("../migrations/012_business_reset.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 13,
            description: "013_expense_payment_details",
            sql: include_str!("../migrations/013_expense_payment_details.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 14,
            description: "014_covered_area_unit",
            sql: include_str!("../migrations/014_covered_area_unit.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 15,
            description: "015_project_sales",
            sql: include_str!("../migrations/015_project_sales.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 16,
            description: "016_sales_business_reset",
            sql: include_str!("../migrations/016_sales_business_reset.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 17,
            description: "017_personal_deposits",
            sql: include_str!("../migrations/017_personal_deposits.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 18,
            description: "018_deposit_payment_details",
            sql: include_str!("../migrations/018_deposit_payment_details.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 19,
            description: "019_land_sales",
            sql: include_str!("../migrations/019_land_sales.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .manage(Mutex::new(commands::auth::LoginAttempts::default()))
        .manage(commands::backup::BackupState::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:baloch-builder.db", migrations)
                .build(),
        )
        .setup(|app| {
            commands::backup::spawn_scheduler(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::paths::get_app_data_path,
            commands::files::copy_attachment,
            commands::files::open_file,
            commands::files::save_image_attachment,
            commands::files::read_image_attachment,
            commands::files::download_attachment,
            commands::project_stage::save_project_stage,
            commands::auth::auth_status,
            commands::auth::create_account,
            commands::auth::login,
            commands::auth::get_profile,
            commands::auth::update_profile,
            commands::auth::change_password,
            commands::backup::get_data_locations,
            commands::backup::get_backup_status,
            commands::backup::save_google_credentials,
            commands::backup::connect_google_drive,
            commands::backup::disconnect_google_drive,
            commands::backup::set_backup_schedule,
            commands::backup::run_backup_now,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
