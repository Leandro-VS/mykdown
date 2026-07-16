mod documents;
mod integration;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .manage(integration::PendingOpenPaths::default())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            integration::handle_secondary_instance(app, args);
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_persisted_scope::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(integration::setup_native_menu)
        .on_menu_event(|app, event| {
            integration::handle_menu_event(app, event.id().as_ref());
        })
        .invoke_handler(tauri::generate_handler![
            documents::save_document_atomic,
            documents::create_markdown_document,
            documents::create_directory,
            documents::rename_entry,
            documents::delete_entry,
            integration::take_pending_open_paths,
        ])
        .build(tauri::generate_context!())
        .expect("error while running Mykdown");

    app.run(|app, event| integration::handle_run_event(app, &event));
}
