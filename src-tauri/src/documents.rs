use serde::Serialize;
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::AppHandle;
use tauri_plugin_fs::FsExt;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveResult {
    modified_at: u64,
}

#[tauri::command]
pub fn save_document_atomic(
    app: AppHandle,
    path: String,
    content: String,
    expected_modified_at: Option<u64>,
) -> Result<SaveResult, String> {
    let path = PathBuf::from(path);
    if !app.fs_scope().is_allowed(&path) {
        return Err("O arquivo não está no escopo autorizado pelo usuário.".into());
    }

    atomic_write(&path, content.as_bytes(), expected_modified_at)?;
    Ok(SaveResult {
        modified_at: modified_at_ms(&path)?,
    })
}

fn atomic_write(
    path: &Path,
    content: &[u8],
    expected_modified_at: Option<u64>,
) -> Result<(), String> {
    validate_markdown_path(path)?;

    let symlink_metadata = fs::symlink_metadata(path).map_err(format_io_error)?;
    if symlink_metadata.file_type().is_symlink() {
        return Err("Por segurança, o Mykdown não sobrescreve links simbólicos.".into());
    }
    if !symlink_metadata.is_file() {
        return Err("O caminho selecionado não é um arquivo regular.".into());
    }

    if let Some(expected) = expected_modified_at {
        let current = modified_at_ms(path)?;
        if current != expected {
            return Err(
                "O arquivo mudou no disco. O salvamento foi interrompido para proteger suas alterações."
                    .into(),
            );
        }
    }

    let parent = path
        .parent()
        .ok_or_else(|| "Não foi possível determinar a pasta do arquivo.".to_string())?;
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "O nome do arquivo não é válido.".to_string())?;
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_nanos();
    let temp_path = parent.join(format!(".{file_name}.mykdown-{nonce}.tmp"));

    let write_result = (|| -> Result<(), String> {
        let mut temp = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp_path)
            .map_err(format_io_error)?;
        temp.write_all(content).map_err(format_io_error)?;
        temp.sync_all().map_err(format_io_error)?;
        fs::set_permissions(&temp_path, symlink_metadata.permissions()).map_err(format_io_error)?;
        fs::rename(&temp_path, path).map_err(format_io_error)?;

        if let Ok(directory) = fs::File::open(parent) {
            let _ = directory.sync_all();
        }
        Ok(())
    })();

    if write_result.is_err() {
        let _ = fs::remove_file(&temp_path);
    }
    write_result
}

fn validate_markdown_path(path: &Path) -> Result<(), String> {
    let extension = path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase);
    match extension.as_deref() {
        Some("md" | "markdown") => Ok(()),
        _ => Err("O Mykdown salva somente arquivos .md e .markdown.".into()),
    }
}

fn modified_at_ms(path: &Path) -> Result<u64, String> {
    let modified = fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .map_err(format_io_error)?;
    let duration = modified
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?;
    Ok(duration.as_millis() as u64)
}

fn format_io_error(error: std::io::Error) -> String {
    format!("Falha ao acessar o arquivo: {error}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_and_replaces_markdown_atomically() {
        let path = std::env::temp_dir().join(format!(
            "mykdown-atomic-{}-{}.md",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::write(&path, "before").unwrap();
        let expected = modified_at_ms(&path).unwrap();

        atomic_write(&path, b"after", Some(expected)).unwrap();

        assert_eq!(fs::read_to_string(&path).unwrap(), "after");
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn rejects_non_markdown_files() {
        assert!(validate_markdown_path(Path::new("notes.txt")).is_err());
    }
}
