import { invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import type { LocalPluginDescriptor } from "../plugins/local/types";

export function listLocalPlugins(): Promise<LocalPluginDescriptor[]> {
  return invoke("list_local_plugins");
}

export async function openLocalPluginsDirectory(): Promise<void> {
  const path = await invoke<string>("local_plugins_directory");
  await openPath(path);
}

export function removeLocalPlugin(id: string): Promise<void> {
  return invoke("remove_local_plugin", { id });
}
