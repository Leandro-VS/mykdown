use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};
use tauri::{AppHandle, Manager};

const MANIFEST_FILE: &str = "mykdown-plugin.json";
const MAX_MANIFEST_SIZE: u64 = 64 * 1024;
const MAX_SOURCE_SIZE: u64 = 512 * 1024;

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalPluginManifest {
    id: String,
    name: String,
    version: String,
    api_version: u8,
    language: String,
    entry: String,
    capabilities: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalPluginDescriptor {
    manifest: Option<LocalPluginManifest>,
    source: Option<String>,
    directory_name: String,
    error: Option<String>,
}

#[tauri::command]
pub fn list_local_plugins(app: AppHandle) -> Result<Vec<LocalPluginDescriptor>, String> {
    let root = plugins_root(&app)?;
    fs::create_dir_all(&root).map_err(format_io_error)?;
    let mut descriptors = Vec::new();

    for entry in fs::read_dir(&root).map_err(format_io_error)? {
        let entry = entry.map_err(format_io_error)?;
        let metadata = entry.metadata().map_err(format_io_error)?;
        if !metadata.is_dir() || entry.file_type().map_err(format_io_error)?.is_symlink() {
            continue;
        }
        let directory_name = entry.file_name().to_string_lossy().into_owned();
        descriptors.push(load_plugin(entry.path(), directory_name));
    }
    descriptors.sort_by(|left, right| left.directory_name.cmp(&right.directory_name));
    Ok(descriptors)
}

#[tauri::command]
pub fn local_plugins_directory(app: AppHandle) -> Result<String, String> {
    let root = plugins_root(&app)?;
    fs::create_dir_all(&root).map_err(format_io_error)?;
    Ok(root.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn remove_local_plugin(app: AppHandle, id: String) -> Result<(), String> {
    validate_plugin_id(&id)?;
    let root = plugins_root(&app)?;
    let directory = root.join(&id);
    if !directory.exists() {
        return Ok(());
    }
    let metadata = fs::symlink_metadata(&directory).map_err(format_io_error)?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err("A pasta do plugin local não é válida.".into());
    }
    fs::remove_dir_all(directory).map_err(format_io_error)
}

fn plugins_root(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("plugins"))
}

fn load_plugin(directory: PathBuf, directory_name: String) -> LocalPluginDescriptor {
    match try_load_plugin(&directory) {
        Ok((manifest, _)) if manifest.id != directory_name => LocalPluginDescriptor {
            manifest: None,
            source: None,
            directory_name,
            error: Some("O id do manifesto precisa ser igual ao nome da pasta.".into()),
        },
        Ok((manifest, source)) => LocalPluginDescriptor {
            manifest: Some(manifest),
            source: Some(source),
            directory_name,
            error: None,
        },
        Err(error) => LocalPluginDescriptor {
            manifest: None,
            source: None,
            directory_name,
            error: Some(error),
        },
    }
}

fn try_load_plugin(directory: &std::path::Path) -> Result<(LocalPluginManifest, String), String> {
    let manifest_path = directory.join(MANIFEST_FILE);
    let metadata = fs::symlink_metadata(&manifest_path).map_err(format_io_error)?;
    if metadata.file_type().is_symlink()
        || !metadata.is_file()
        || metadata.len() > MAX_MANIFEST_SIZE
    {
        return Err("Manifesto ausente, inválido ou grande demais.".into());
    }
    let manifest: LocalPluginManifest =
        serde_json::from_slice(&fs::read(&manifest_path).map_err(format_io_error)?)
            .map_err(|error| format!("Manifesto inválido: {error}"))?;
    validate_manifest(&manifest)?;

    let entry_path = directory.join(&manifest.entry);
    if entry_path.parent() != Some(directory) {
        return Err("O entry do plugin precisa estar na raiz da própria pasta.".into());
    }
    let entry_metadata = fs::symlink_metadata(&entry_path).map_err(format_io_error)?;
    if entry_metadata.file_type().is_symlink()
        || !entry_metadata.is_file()
        || entry_metadata.len() > MAX_SOURCE_SIZE
    {
        return Err("Código do plugin ausente, inválido ou grande demais.".into());
    }
    let source = fs::read_to_string(entry_path).map_err(format_io_error)?;
    Ok((manifest, source))
}

fn validate_manifest(manifest: &LocalPluginManifest) -> Result<(), String> {
    validate_plugin_id(&manifest.id)?;
    if manifest.name.trim().is_empty() || manifest.version.trim().is_empty() {
        return Err("Nome e versão do plugin são obrigatórios.".into());
    }
    if manifest.api_version != 1 {
        return Err("Versão da API do plugin incompatível.".into());
    }
    validate_plugin_id(&manifest.language)?;
    if manifest.entry != "plugin.js" {
        return Err("A versão 1 da API usa obrigatoriamente o entry plugin.js.".into());
    }
    if manifest.capabilities != ["preview.codeBlock"] {
        return Err("O plugin solicita capacidades não suportadas.".into());
    }
    Ok(())
}

fn validate_plugin_id(id: &str) -> Result<(), String> {
    let valid = !id.is_empty()
        && id.len() <= 64
        && id
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-');
    if valid {
        Ok(())
    } else {
        Err("O identificador deve usar apenas a-z, 0-9 e hífen.".into())
    }
}

fn format_io_error(error: std::io::Error) -> String {
    format!("Falha ao acessar plugin local: {error}")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_manifest() -> LocalPluginManifest {
        LocalPluginManifest {
            id: "callout-example".into(),
            name: "Callout".into(),
            version: "1.0.0".into(),
            api_version: 1,
            language: "callout".into(),
            entry: "plugin.js".into(),
            capabilities: vec!["preview.codeBlock".into()],
        }
    }

    #[test]
    fn validates_the_v1_manifest_contract() {
        assert!(validate_manifest(&valid_manifest()).is_ok());
        let mut invalid = valid_manifest();
        invalid.capabilities.push("filesystem".into());
        assert!(validate_manifest(&invalid).is_err());
    }

    #[test]
    fn rejects_traversal_in_plugin_ids() {
        assert!(validate_plugin_id("../plugin").is_err());
        assert!(validate_plugin_id("Plugin").is_err());
    }
}
