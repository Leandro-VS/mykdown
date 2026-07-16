import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type NativeMenuAction =
  "new-file" | "open-file" | "open-folder" | "save" | "quit";

export async function takePendingOpenPaths(): Promise<string[]> {
  return invoke<string[]>("take_pending_open_paths");
}

export function listenForOpenFileRequests(
  onRequest: () => void,
): Promise<UnlistenFn> {
  return listen("mykdown://open-files", onRequest);
}

export function listenForNativeMenu(
  onAction: (action: NativeMenuAction) => void,
): Promise<UnlistenFn> {
  return listen<string>("mykdown://menu", (event) => {
    if (
      event.payload === "new-file" ||
      event.payload === "open-file" ||
      event.payload === "open-folder" ||
      event.payload === "save" ||
      event.payload === "quit"
    ) {
      onAction(event.payload);
    }
  });
}
