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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MutationResult {
    path: String,
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

#[tauri::command]
pub fn create_markdown_document(
    app: AppHandle,
    parent: String,
    name: String,
) -> Result<MutationResult, String> {
    let parent = PathBuf::from(parent);
    validate_directory(&app, &parent)?;
    let file_name = normalized_markdown_name(&name, None)?;
    let path = parent.join(file_name);
    validate_new_path(&app, &path)?;

    OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(format_io_error)?
        .sync_all()
        .map_err(format_io_error)?;

    Ok(mutation_result(path))
}

#[tauri::command]
pub fn create_directory(
    app: AppHandle,
    parent: String,
    name: String,
) -> Result<MutationResult, String> {
    let parent = PathBuf::from(parent);
    validate_directory(&app, &parent)?;
    let path = parent.join(validate_entry_name(&name)?);
    validate_new_path(&app, &path)?;
    fs::create_dir(&path).map_err(format_io_error)?;
    Ok(mutation_result(path))
}

#[tauri::command]
pub fn rename_entry(
    app: AppHandle,
    path: String,
    new_name: String,
) -> Result<MutationResult, String> {
    let path = PathBuf::from(path);
    validate_existing_path(&app, &path)?;
    let metadata = fs::symlink_metadata(&path).map_err(format_io_error)?;
    let parent = path
        .parent()
        .ok_or_else(|| "Não foi possível determinar a pasta do item.".to_string())?;

    let target_name = if metadata.is_file() {
        let current_extension = path.extension().and_then(|extension| extension.to_str());
        normalized_markdown_name(&new_name, current_extension)?
    } else if metadata.is_dir() {
        validate_entry_name(&new_name)?
    } else {
        return Err("O item selecionado não pode ser renomeado.".into());
    };

    let target = parent.join(target_name);
    if target == path {
        return Ok(mutation_result(path));
    }
    validate_new_path(&app, &target)?;
    fs::rename(&path, &target).map_err(format_io_error)?;
    Ok(mutation_result(target))
}

#[tauri::command]
pub fn delete_entry(app: AppHandle, path: String) -> Result<(), String> {
    let path = PathBuf::from(path);
    validate_existing_path(&app, &path)?;
    let metadata = fs::symlink_metadata(&path).map_err(format_io_error)?;

    if metadata.is_file() {
        validate_markdown_path(&path)?;
        fs::remove_file(path).map_err(format_io_error)
    } else if metadata.is_dir() {
        fs::remove_dir(path).map_err(|error| {
            if error.kind() == std::io::ErrorKind::DirectoryNotEmpty {
                "A pasta precisa estar vazia antes de ser excluída.".to_string()
            } else {
                format_io_error(error)
            }
        })
    } else {
        Err("O item selecionado não pode ser excluído.".into())
    }
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

fn validate_directory(app: &AppHandle, path: &Path) -> Result<(), String> {
    validate_existing_path(app, path)?;
    let metadata = fs::symlink_metadata(path).map_err(format_io_error)?;
    if !metadata.is_dir() {
        return Err("Escolha uma pasta válida.".into());
    }
    Ok(())
}

fn validate_existing_path(app: &AppHandle, path: &Path) -> Result<(), String> {
    if !app.fs_scope().is_allowed(path) {
        return Err("O item não está no escopo autorizado pelo usuário.".into());
    }
    let metadata = fs::symlink_metadata(path).map_err(format_io_error)?;
    if metadata.file_type().is_symlink() {
        return Err("Por segurança, esta operação não aceita links simbólicos.".into());
    }
    Ok(())
}

fn validate_new_path(app: &AppHandle, path: &Path) -> Result<(), String> {
    if !app.fs_scope().is_allowed(path) {
        return Err("O novo item não está no escopo autorizado pelo usuário.".into());
    }
    if path.exists() {
        return Err("Já existe um item com esse nome.".into());
    }
    Ok(())
}

fn validate_entry_name(name: &str) -> Result<String, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("Informe um nome.".into());
    }
    let mut components = Path::new(name).components();
    let component = components
        .next()
        .ok_or_else(|| "Informe um nome válido.".to_string())?;
    if components.next().is_some() || !matches!(component, std::path::Component::Normal(_)) {
        return Err("Use apenas um nome, sem barras ou caminhos relativos.".into());
    }
    if name.starts_with('.') {
        return Err("Nomes ocultos não são permitidos nesta versão.".into());
    }
    Ok(name.to_string())
}

fn normalized_markdown_name(
    name: &str,
    fallback_extension: Option<&str>,
) -> Result<String, String> {
    let mut name = validate_entry_name(name)?;
    if Path::new(&name).extension().is_none() {
        name.push('.');
        name.push_str(fallback_extension.unwrap_or("md"));
    }
    validate_markdown_path(Path::new(&name))?;
    Ok(name)
}

fn mutation_result(path: PathBuf) -> MutationResult {
    MutationResult {
        path: path.to_string_lossy().into_owned(),
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

    #[test]
    fn normalizes_markdown_names() {
        assert_eq!(normalized_markdown_name("notes", None).unwrap(), "notes.md");
        assert_eq!(
            normalized_markdown_name("notes", Some("markdown")).unwrap(),
            "notes.markdown"
        );
        assert_eq!(
            normalized_markdown_name("notes.MD", None).unwrap(),
            "notes.MD"
        );
    }

    #[test]
    fn rejects_paths_as_entry_names() {
        assert!(validate_entry_name("../notes").is_err());
        assert!(validate_entry_name("folder/notes").is_err());
        assert!(validate_entry_name(".hidden").is_err());
    }
}
