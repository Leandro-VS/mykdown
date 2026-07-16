use std::{
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder},
    App, AppHandle, Emitter, Manager, RunEvent, State,
};
use tauri_plugin_fs::FsExt;

#[derive(Default)]
pub struct PendingOpenPaths(Mutex<Vec<String>>);

pub fn setup_native_menu(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let new_file = MenuItemBuilder::with_id("new-file", "Novo arquivo…")
        .accelerator("CmdOrCtrl+N")
        .build(app)?;
    let open_file = MenuItemBuilder::with_id("open-file", "Abrir arquivo…")
        .accelerator("CmdOrCtrl+O")
        .build(app)?;
    let open_folder = MenuItemBuilder::with_id("open-folder", "Abrir pasta…")
        .accelerator("CmdOrCtrl+Shift+O")
        .build(app)?;
    let save = MenuItemBuilder::with_id("save", "Salvar")
        .accelerator("CmdOrCtrl+S")
        .build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Encerrar Mykdown")
        .accelerator("CmdOrCtrl+Q")
        .build(app)?;

    let app_menu = SubmenuBuilder::new(app, "Mykdown")
        .about(None)
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .item(&quit)
        .build()?;
    let file_menu = SubmenuBuilder::new(app, "Arquivo")
        .item(&new_file)
        .separator()
        .item(&open_file)
        .item(&open_folder)
        .separator()
        .item(&save)
        .separator()
        .close_window()
        .build()?;
    let edit_menu = SubmenuBuilder::new(app, "Editar")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;
    let view_menu = SubmenuBuilder::new(app, "Visualizar")
        .fullscreen()
        .build()?;
    let window_menu = SubmenuBuilder::new(app, "Janela")
        .minimize()
        .maximize()
        .build()?;

    let menu = MenuBuilder::new(app)
        .items(&[&app_menu, &file_menu, &edit_menu, &view_menu, &window_menu])
        .build()?;
    app.set_menu(menu)?;
    Ok(())
}

pub fn handle_menu_event(app: &AppHandle, id: &str) {
    if matches!(
        id,
        "new-file" | "open-file" | "open-folder" | "save" | "quit"
    ) {
        let _ = app.emit("mykdown://menu", id);
    }
}

pub fn handle_secondary_instance(app: &AppHandle, args: Vec<String>) {
    deliver_paths(app, markdown_paths(args));
    focus_main_window(app);
}

pub fn handle_run_event(app: &AppHandle, event: &RunEvent) {
    #[cfg(target_os = "macos")]
    match event {
        RunEvent::Opened { urls } => {
            let paths = urls
                .iter()
                .filter_map(|url| url.to_file_path().ok())
                .filter(|path| is_markdown_path(path))
                .collect();
            deliver_paths(app, paths);
            focus_main_window(app);
        }
        RunEvent::Reopen { .. } => focus_main_window(app),
        _ => {}
    }
}

#[tauri::command]
pub fn take_pending_open_paths(state: State<'_, PendingOpenPaths>) -> Vec<String> {
    let Ok(mut paths) = state.0.lock() else {
        return Vec::new();
    };
    std::mem::take(&mut *paths)
}

fn markdown_paths(values: impl IntoIterator<Item = String>) -> Vec<PathBuf> {
    values
        .into_iter()
        .filter_map(|value| {
            if let Ok(url) = tauri::Url::parse(&value) {
                if url.scheme() == "file" {
                    return url.to_file_path().ok();
                }
            }
            Some(PathBuf::from(value))
        })
        .filter(|path| path.is_file() && is_markdown_path(path))
        .collect()
}

fn is_markdown_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            extension.eq_ignore_ascii_case("md") || extension.eq_ignore_ascii_case("markdown")
        })
}

fn deliver_paths(app: &AppHandle, paths: Vec<PathBuf>) {
    if paths.is_empty() {
        return;
    }

    let mut accepted = Vec::new();
    for path in paths {
        if path.is_file() && app.fs_scope().allow_file(&path).is_ok() {
            accepted.push(path.to_string_lossy().into_owned());
        }
    }
    if accepted.is_empty() {
        return;
    }

    if let Ok(mut pending) = app.state::<PendingOpenPaths>().0.lock() {
        for path in accepted {
            if !pending.contains(&path) {
                pending.push(path);
            }
        }
    }
    let _ = app.emit("mykdown://open-files", ());
}

fn focus_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filters_markdown_arguments() {
        let temp = std::env::temp_dir().join("mykdown-integration-test.md");
        std::fs::write(&temp, "test").unwrap();
        let paths = markdown_paths([
            "/Applications/Mykdown.app/Contents/MacOS/mykdown".into(),
            temp.to_string_lossy().into_owned(),
            "/tmp/notes.txt".into(),
        ]);
        assert_eq!(paths, vec![temp.clone()]);
        std::fs::remove_file(temp).unwrap();
    }
}
