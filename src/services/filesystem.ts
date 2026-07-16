import { invoke } from "@tauri-apps/api/core";
import { basename, join } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { readDir, readTextFile, stat, watch } from "@tauri-apps/plugin-fs";
import type { MarkdownDocument, MarkdownTreeNode } from "../types/files";
import { isMarkdownFile, sortMarkdownTree } from "../utils/files";

const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".idea",
  ".vscode",
  "node_modules",
  "dist",
  "target",
]);

export function isRunningInTauri(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

function requireTauri(): void {
  if (!isRunningInTauri()) {
    throw new Error("Abra esta ação pela janela desktop do Mykdown.");
  }
}

export async function chooseMarkdownFile(): Promise<string | null> {
  requireTauri();
  const selected = await open({
    multiple: false,
    directory: false,
    title: "Abrir arquivo Markdown",
    filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
  });

  return typeof selected === "string" ? selected : null;
}

export async function chooseMarkdownFolder(): Promise<string | null> {
  requireTauri();
  const selected = await open({
    multiple: false,
    directory: true,
    title: "Abrir pasta com Markdown",
  });

  return typeof selected === "string" ? selected : null;
}

export async function readMarkdownDocument(
  path: string,
): Promise<MarkdownDocument> {
  requireTauri();
  if (!isMarkdownFile(path)) {
    throw new Error("O Mykdown abre somente arquivos .md e .markdown.");
  }

  const [content, metadata, name] = await Promise.all([
    readTextFile(path),
    stat(path),
    basename(path),
  ]);

  return {
    path,
    name,
    content,
    modifiedAt: metadata.mtime?.getTime() ?? null,
  };
}

export async function saveMarkdownDocument(
  path: string,
  content: string,
  expectedModifiedAt: number | null,
): Promise<number | null> {
  requireTauri();
  const result = await invoke<{ modifiedAt: number }>("save_document_atomic", {
    path,
    content,
    expectedModifiedAt,
  });
  return result.modifiedAt;
}

type MutationResult = { path: string };

export async function createMarkdownDocument(
  parent: string,
  name: string,
): Promise<string> {
  requireTauri();
  const result = await invoke<MutationResult>("create_markdown_document", {
    parent,
    name,
  });
  return result.path;
}

export async function createMarkdownDirectory(
  parent: string,
  name: string,
): Promise<string> {
  requireTauri();
  const result = await invoke<MutationResult>("create_directory", {
    parent,
    name,
  });
  return result.path;
}

export async function renameMarkdownEntry(
  path: string,
  newName: string,
): Promise<string> {
  requireTauri();
  const result = await invoke<MutationResult>("rename_entry", {
    path,
    newName,
  });
  return result.path;
}

export async function deleteMarkdownEntry(path: string): Promise<void> {
  requireTauri();
  await invoke("delete_entry", { path });
}

export async function getFileModifiedAt(path: string): Promise<number | null> {
  requireTauri();
  const metadata = await stat(path);
  return metadata.mtime?.getTime() ?? null;
}

export async function watchMarkdownPath(
  path: string,
  onChange: () => void,
  recursive = false,
): Promise<() => void> {
  requireTauri();
  return watch(
    path,
    (event) => {
      if (
        event.type === "any" ||
        event.type === "other" ||
        (typeof event.type === "object" &&
          ("modify" in event.type ||
            "remove" in event.type ||
            "create" in event.type))
      ) {
        onChange();
      }
    },
    { delayMs: 250, recursive },
  );
}

export async function scanMarkdownFolder(
  rootPath: string,
): Promise<MarkdownTreeNode[]> {
  requireTauri();
  return sortMarkdownTree(await scanDirectory(rootPath));
}

async function scanDirectory(
  directoryPath: string,
  knownEntries?: Awaited<ReturnType<typeof readDir>>,
): Promise<MarkdownTreeNode[]> {
  const entries = knownEntries ?? (await readDir(directoryPath));
  const nodes = await Promise.all(
    entries.map(async (entry): Promise<MarkdownTreeNode | null> => {
      const entryPath = await join(directoryPath, entry.name);

      if (entry.isDirectory) {
        if (
          entry.name.startsWith(".") ||
          entry.isSymlink ||
          IGNORED_DIRECTORIES.has(entry.name)
        ) {
          return null;
        }

        const directoryEntries = await readDir(entryPath);
        const children = await scanDirectory(entryPath, directoryEntries);
        return children.length > 0 || directoryEntries.length === 0
          ? {
              kind: "directory",
              name: entry.name,
              path: entryPath,
              children,
            }
          : null;
      }

      return entry.isFile && isMarkdownFile(entry.name)
        ? { kind: "file", name: entry.name, path: entryPath }
        : null;
    }),
  );

  return nodes.filter((node): node is MarkdownTreeNode => node !== null);
}
