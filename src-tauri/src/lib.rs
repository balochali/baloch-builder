mod desktop;
use tauri::Manager;
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .manage(desktop::Desktop(std::sync::Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![desktop::desktop_data])
        .setup(|app| {
            if !cfg!(debug_assertions) {
                desktop::initialize(app.handle().clone());
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                let state = window.state::<desktop::Desktop>();
                if let Ok(mut runtime) = state.0.lock() {
                    runtime.take();
                };
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Baloch Builder");
}
