import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  BookOpen,
  Check,
  Clock3,
  Columns2,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  LoaderCircle,
  PanelLeft,
  Save,
  SlidersHorizontal,
  TriangleAlert,
  X,
} from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { FileTree } from "./components/FileTree";
import { IconButton } from "./components/IconButton";
import { MarkdownEditor } from "./components/MarkdownEditor";
import { MarkdownPreview } from "./components/MarkdownPreview";
import {
  chooseMarkdownFile,
  chooseMarkdownFolder,
  createMarkdownDirectory,
  createMarkdownDocument,
  deleteMarkdownEntry,
  getFileModifiedAt,
  isRunningInTauri,
  readMarkdownDocument,
  renameMarkdownEntry,
  saveMarkdownDocument,
  scanMarkdownFolder,
  watchMarkdownPath,
} from "./services/filesystem";
import {
  listenForNativeMenu,
  listenForOpenFileRequests,
  takePendingOpenPaths,
  type NativeMenuAction,
} from "./services/integration";
import {
  persistSession,
  readPersistedState,
  recordRecent,
  removeRecent,
  type RecentItem,
} from "./services/persistence";
import { selectIsDirty, useWorkspaceStore } from "./store/workspace";
import type { MarkdownTreeNode, ViewMode } from "./types/files";

type DeferredAction = () => Promise<void>;

type ExternalChange =
  { kind: "modified"; modifiedAt: number } | { kind: "removed" };

type WorkspaceDialogState =
  | { kind: "create-file"; parentPath: string }
  | { kind: "create-folder"; parentPath: string }
  | { kind: "rename"; node: MarkdownTreeNode }
  | { kind: "delete"; node: MarkdownTreeNode };

const DEFAULT_PREVIEW_MARGIN = 64;

function isPathInside(path: string, parent: string): boolean {
  return path === parent || path.startsWith(`${parent}/`);
}

function countFiles(nodes: MarkdownTreeNode[]): number {
  return nodes.reduce(
    (total, node) =>
      total + (node.kind === "file" ? 1 : countFiles(node.children)),
    0,
  );
}

function displayPathName(path: string): string {
  return path.split("/").filter(Boolean).at(-1) ?? path;
}

export default function App() {
  const rootDir = useWorkspaceStore((state) => state.rootDir);
  const tree = useWorkspaceStore((state) => state.tree);
  const activePath = useWorkspaceStore((state) => state.activePath);
  const activeName = useWorkspaceStore((state) => state.activeName);
  const draftContent = useWorkspaceStore((state) => state.draftContent);
  const diskModifiedAt = useWorkspaceStore((state) => state.diskModifiedAt);
  const viewMode = useWorkspaceStore((state) => state.viewMode);
  const isBusy = useWorkspaceStore((state) => state.isBusy);
  const error = useWorkspaceStore((state) => state.error);
  const isDirty = useWorkspaceStore(selectIsDirty);
  const setRoot = useWorkspaceStore((state) => state.setRoot);
  const updateTree = useWorkspaceStore((state) => state.updateTree);
  const loadDocument = useWorkspaceStore((state) => state.loadDocument);
  const closeDocument = useWorkspaceStore((state) => state.closeDocument);
  const updateDraft = useWorkspaceStore((state) => state.updateDraft);
  const markSaved = useWorkspaceStore((state) => state.markSaved);
  const setDiskModifiedAt = useWorkspaceStore(
    (state) => state.setDiskModifiedAt,
  );
  const setViewMode = useWorkspaceStore((state) => state.setViewMode);
  const setBusy = useWorkspaceStore((state) => state.setBusy);
  const setError = useWorkspaceStore((state) => state.setError);

  const [recents, setRecents] = useState<RecentItem[]>([]);
  const [pendingAction, setPendingAction] = useState<DeferredAction | null>(
    null,
  );
  const [externalChange, setExternalChange] = useState<ExternalChange | null>(
    null,
  );
  const [persistenceReady, setPersistenceReady] = useState(false);
  const [previewMargin, setPreviewMargin] = useState(DEFAULT_PREVIEW_MARGIN);
  const [workspaceDialog, setWorkspaceDialog] =
    useState<WorkspaceDialogState | null>(null);
  const ignoreWatchUntil = useRef(0);
  const nativeMenuActionRef = useRef<(action: NativeMenuAction) => void>(
    () => undefined,
  );
  const drainOpenRequestsRef = useRef<() => void>(() => undefined);

  const handleSave = useCallback(async (): Promise<boolean> => {
    if (!activePath || !isDirty) {
      return true;
    }

    setBusy(true);
    setError(null);
    ignoreWatchUntil.current = Date.now() + 1_200;
    try {
      const modifiedAt = await saveMarkdownDocument(
        activePath,
        draftContent,
        diskModifiedAt,
      );
      markSaved(modifiedAt);
      setExternalChange(null);
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar o arquivo.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }, [
    activePath,
    diskModifiedAt,
    draftContent,
    isDirty,
    markSaved,
    setBusy,
    setError,
  ]);

  const runOrDefer = useCallback(
    async (action: DeferredAction) => {
      if (isDirty) {
        setPendingAction(() => action);
        return;
      }
      await action();
    },
    [isDirty],
  );

  const openStandaloneDocument = useCallback(
    async (path: string) => {
      setBusy(true);
      setError(null);
      try {
        const document = await readMarkdownDocument(path);
        setRoot(null, []);
        loadDocument(document);
        setExternalChange(null);
        setRecents(
          await recordRecent({ kind: "file", path, name: document.name }),
        );
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Não foi possível abrir o arquivo.",
        );
      } finally {
        setBusy(false);
      }
    },
    [loadDocument, setBusy, setError, setRoot],
  );

  const performOpenFile = useCallback(async () => {
    setError(null);
    try {
      const path = await chooseMarkdownFile();
      if (!path) return;
      await openStandaloneDocument(path);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível abrir o arquivo.",
      );
    }
  }, [openStandaloneDocument, setError]);

  const handleOpenFile = useCallback(
    () => runOrDefer(performOpenFile),
    [performOpenFile, runOrDefer],
  );

  const performOpenFolder = useCallback(async () => {
    setError(null);
    try {
      const path = await chooseMarkdownFolder();
      if (!path) return;

      setBusy(true);
      setRoot(path, await scanMarkdownFolder(path));
      setExternalChange(null);
      setRecents(
        await recordRecent({
          kind: "folder",
          path,
          name: displayPathName(path),
        }),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível abrir a pasta.",
      );
    } finally {
      setBusy(false);
    }
  }, [setBusy, setError, setRoot]);

  const handleOpenFolder = useCallback(
    () => runOrDefer(performOpenFolder),
    [performOpenFolder, runOrDefer],
  );

  const openDocumentAtPath = useCallback(
    async (path: string) => {
      if (path === activePath) return;

      await runOrDefer(async () => {
        setBusy(true);
        setError(null);
        try {
          const document = await readMarkdownDocument(path);
          loadDocument(document);
          setExternalChange(null);
          setRecents(
            await recordRecent({ kind: "file", path, name: document.name }),
          );
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Não foi possível abrir o arquivo.",
          );
        } finally {
          setBusy(false);
        }
      });
    },
    [activePath, loadDocument, runOrDefer, setBusy, setError],
  );

  const handleOpenRecent = useCallback(
    async (recent: RecentItem) => {
      await runOrDefer(async () => {
        setBusy(true);
        setError(null);
        try {
          if (recent.kind === "folder") {
            setRoot(recent.path, await scanMarkdownFolder(recent.path));
            setExternalChange(null);
          } else {
            const document = await readMarkdownDocument(recent.path);
            setRoot(null, []);
            loadDocument(document);
            setExternalChange(null);
          }
          setRecents(
            await recordRecent({
              kind: recent.kind,
              path: recent.path,
              name: recent.name,
            }),
          );
        } catch (cause) {
          setRecents(await removeRecent(recent.path));
          setError(
            cause instanceof Error
              ? cause.message
              : "Este item recente não está mais disponível.",
          );
        } finally {
          setBusy(false);
        }
      });
    },
    [loadDocument, runOrDefer, setBusy, setError, setRoot],
  );

  const refreshWorkspaceTree = useCallback(async () => {
    if (!rootDir) return;
    updateTree(await scanMarkdownFolder(rootDir));
  }, [rootDir, updateTree]);

  const handleCreateFile = useCallback(
    async (parentPath: string, name: string) => {
      await runOrDefer(async () => {
        setBusy(true);
        setError(null);
        try {
          const path = await createMarkdownDocument(parentPath, name);
          await refreshWorkspaceTree();
          const document = await readMarkdownDocument(path);
          loadDocument(document);
          setExternalChange(null);
          setRecents(
            await recordRecent({ kind: "file", path, name: document.name }),
          );
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Não foi possível criar o arquivo.",
          );
        } finally {
          setBusy(false);
        }
      });
    },
    [loadDocument, refreshWorkspaceTree, runOrDefer, setBusy, setError],
  );

  const handleCreateFolder = useCallback(
    async (parentPath: string, name: string) => {
      setBusy(true);
      setError(null);
      try {
        await createMarkdownDirectory(parentPath, name);
        await refreshWorkspaceTree();
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Não foi possível criar a pasta.",
        );
      } finally {
        setBusy(false);
      }
    },
    [refreshWorkspaceTree, setBusy, setError],
  );

  const handleRenameEntry = useCallback(
    async (node: MarkdownTreeNode, newName: string) => {
      const affectsActive =
        activePath !== null && isPathInside(activePath, node.path);
      const action = async () => {
        setBusy(true);
        setError(null);
        try {
          const newPath = await renameMarkdownEntry(node.path, newName);
          await refreshWorkspaceTree();
          if (affectsActive && activePath) {
            const nextActivePath = `${newPath}${activePath.slice(node.path.length)}`;
            loadDocument(await readMarkdownDocument(nextActivePath));
            setExternalChange(null);
            setRecents(await removeRecent(node.path));
          }
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Não foi possível renomear o item.",
          );
        } finally {
          setBusy(false);
        }
      };

      if (affectsActive) await runOrDefer(action);
      else await action();
    },
    [
      activePath,
      loadDocument,
      refreshWorkspaceTree,
      runOrDefer,
      setBusy,
      setError,
    ],
  );

  const handleDeleteEntry = useCallback(
    async (node: MarkdownTreeNode) => {
      const affectsActive =
        activePath !== null && isPathInside(activePath, node.path);
      const action = async () => {
        setBusy(true);
        setError(null);
        try {
          await deleteMarkdownEntry(node.path);
          await refreshWorkspaceTree();
          if (affectsActive) {
            closeDocument();
            setExternalChange(null);
          }
          setRecents(await removeRecent(node.path));
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Não foi possível excluir o item.",
          );
        } finally {
          setBusy(false);
        }
      };

      if (affectsActive) await runOrDefer(action);
      else await action();
    },
    [
      activePath,
      closeDocument,
      refreshWorkspaceTree,
      runOrDefer,
      setBusy,
      setError,
    ],
  );

  const submitWorkspaceDialog = useCallback(
    async (value?: string) => {
      const dialog = workspaceDialog;
      if (!dialog) return;
      setWorkspaceDialog(null);

      if (dialog.kind === "create-file" && value) {
        await handleCreateFile(dialog.parentPath, value);
      } else if (dialog.kind === "create-folder" && value) {
        await handleCreateFolder(dialog.parentPath, value);
      } else if (dialog.kind === "rename" && value) {
        await handleRenameEntry(dialog.node, value);
      } else if (dialog.kind === "delete") {
        await handleDeleteEntry(dialog.node);
      }
    },
    [
      handleCreateFile,
      handleCreateFolder,
      handleDeleteEntry,
      handleRenameEntry,
      workspaceDialog,
    ],
  );

  const saveAndContinue = useCallback(async () => {
    const action = pendingAction;
    if (!action || !(await handleSave())) return;

    setPendingAction(null);
    await action();
  }, [handleSave, pendingAction]);

  const discardAndContinue = useCallback(async () => {
    const action = pendingAction;
    setPendingAction(null);
    if (action) await action();
  }, [pendingAction]);

  const drainOpenRequests = useCallback(async () => {
    try {
      const paths = await takePendingOpenPaths();
      const path = paths.at(-1);
      if (path) {
        await runOrDefer(() => openStandaloneDocument(path));
      }
    } catch {
      setError("Não foi possível abrir o arquivo solicitado pelo macOS.");
    }
  }, [openStandaloneDocument, runOrDefer, setError]);

  const handleNativeMenuAction = useCallback(
    (action: NativeMenuAction) => {
      if (action === "open-file") {
        void handleOpenFile();
      } else if (action === "open-folder") {
        void handleOpenFolder();
      } else if (action === "save") {
        void handleSave();
      } else if (action === "quit") {
        void runOrDefer(async () => {
          await getCurrentWindow().destroy();
        });
      } else if (rootDir) {
        setWorkspaceDialog({ kind: "create-file", parentPath: rootDir });
      } else {
        setError("Abra uma pasta antes de criar um arquivo.");
      }
    },
    [
      handleOpenFile,
      handleOpenFolder,
      handleSave,
      rootDir,
      runOrDefer,
      setError,
    ],
  );

  nativeMenuActionRef.current = handleNativeMenuAction;
  drainOpenRequestsRef.current = () => void drainOpenRequests();

  useEffect(() => {
    if (!isRunningInTauri()) return;
    let disposed = false;
    let unlistenOpen: (() => void) | undefined;
    let unlistenMenu: (() => void) | undefined;

    void Promise.all([
      listenForOpenFileRequests(() => drainOpenRequestsRef.current()),
      listenForNativeMenu((action) => nativeMenuActionRef.current(action)),
    ])
      .then(([stopOpen, stopMenu]) => {
        if (disposed) {
          stopOpen();
          stopMenu();
        } else {
          unlistenOpen = stopOpen;
          unlistenMenu = stopMenu;
          drainOpenRequestsRef.current();
        }
      })
      .catch(() => {
        if (!disposed) {
          setError("A integração com o menu do macOS não pôde ser iniciada.");
        }
      });

    return () => {
      disposed = true;
      unlistenOpen?.();
      unlistenMenu?.();
    };
  }, [setError]);

  useEffect(() => {
    if (!isRunningInTauri()) {
      setPersistenceReady(true);
      return;
    }
    let cancelled = false;

    void (async () => {
      try {
        const persisted = await readPersistedState();
        if (cancelled) return;
        setRecents(persisted.recents);
        if (!persisted.session) return;

        setViewMode(persisted.session.viewMode);
        if (Number.isFinite(persisted.session.previewMargin)) {
          setPreviewMargin(
            Math.min(240, Math.max(16, persisted.session.previewMargin)),
          );
        }
        setBusy(true);
        if (persisted.session.rootDir) {
          setRoot(
            persisted.session.rootDir,
            await scanMarkdownFolder(persisted.session.rootDir),
          );
        } else {
          setRoot(null, []);
        }
        if (persisted.session.activePath) {
          loadDocument(
            await readMarkdownDocument(persisted.session.activePath),
          );
        }
      } catch {
        if (!cancelled) {
          setError("A sessão anterior não pôde ser restaurada por completo.");
        }
      } finally {
        if (!cancelled) {
          setBusy(false);
          setPersistenceReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadDocument, setBusy, setError, setRoot, setViewMode]);

  useEffect(() => {
    if (!persistenceReady || !isRunningInTauri()) return;
    void persistSession({ rootDir, activePath, viewMode, previewMargin });
  }, [activePath, persistenceReady, previewMargin, rootDir, viewMode]);

  useEffect(() => {
    if (!isRunningInTauri() || !rootDir) return;
    let disposed = false;
    let unwatch: (() => void) | undefined;

    void watchMarkdownPath(
      rootDir,
      () => {
        void scanMarkdownFolder(rootDir)
          .then((nextTree) => {
            if (!disposed) updateTree(nextTree);
          })
          .catch(() => {
            if (!disposed) setError("A pasta aberta não está mais disponível.");
          });
      },
      true,
    )
      .then((stop) => {
        if (disposed) stop();
        else unwatch = stop;
      })
      .catch(() => {
        if (!disposed) {
          setError("Não foi possível monitorar alterações nesta pasta.");
        }
      });

    return () => {
      disposed = true;
      unwatch?.();
    };
  }, [rootDir, setError, updateTree]);

  useEffect(() => {
    if (!isRunningInTauri() || !activePath) return;
    let disposed = false;
    let unwatch: (() => void) | undefined;

    const inspectExternalChange = async () => {
      if (disposed || Date.now() < ignoreWatchUntil.current) return;
      try {
        const currentModifiedAt = await getFileModifiedAt(activePath);
        if (
          currentModifiedAt === diskModifiedAt ||
          currentModifiedAt === null
        ) {
          return;
        }
        if (isDirty) {
          setExternalChange({
            kind: "modified",
            modifiedAt: currentModifiedAt,
          });
        } else {
          loadDocument(await readMarkdownDocument(activePath));
        }
      } catch {
        if (!disposed) setExternalChange({ kind: "removed" });
      }
    };

    void watchMarkdownPath(activePath, () => void inspectExternalChange()).then(
      (stop) => {
        if (disposed) stop();
        else unwatch = stop;
      },
      () => {
        if (!disposed) {
          setError("Não foi possível monitorar alterações neste arquivo.");
        }
      },
    );

    return () => {
      disposed = true;
      unwatch?.();
    };
  }, [activePath, diskModifiedAt, isDirty, loadDocument, setError]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!event.metaKey) return;

      const key = event.key.toLocaleLowerCase();
      if (key === "s" && !isRunningInTauri()) {
        event.preventDefault();
        void handleSave();
      } else if (key === "o" && event.shiftKey && !isRunningInTauri()) {
        event.preventDefault();
        void handleOpenFolder();
      } else if (key === "o" && !isRunningInTauri()) {
        event.preventDefault();
        void handleOpenFile();
      } else if (["1", "2", "3"].includes(key)) {
        event.preventDefault();
        const modes: Record<string, ViewMode> = {
          "1": "editor",
          "2": "split",
          "3": "preview",
        };
        const mode = modes[key];
        if (mode) setViewMode(mode);
      }
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [handleOpenFile, handleOpenFolder, handleSave, setViewMode]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isDirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    if (!isRunningInTauri()) return;
    const appWindow = getCurrentWindow();
    const unlistenPromise = appWindow.onCloseRequested((event) => {
      if (!isDirty) return;
      event.preventDefault();
      setPendingAction(() => async () => {
        await appWindow.destroy();
      });
    });
    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [isDirty]);

  useEffect(() => {
    if (!isRunningInTauri()) return;
    const title = `${isDirty ? "● " : ""}${activeName ?? "Mykdown"}`;
    void getCurrentWindow().setTitle(title);
  }, [activeName, isDirty]);

  const lineCount = useMemo(
    () => (draftContent.length === 0 ? 0 : draftContent.split("\n").length),
    [draftContent],
  );
  const wordCount = useMemo(
    () => draftContent.trim().split(/\s+/).filter(Boolean).length,
    [draftContent],
  );
  const showSidebar = rootDir !== null;

  return (
    <div className={`app-shell ${showSidebar ? "has-sidebar" : ""}`}>
      <header className="titlebar" data-tauri-drag-region>
        <div className="brand" data-tauri-drag-region>
          <span className="brand-mark">M↓</span>
          <span>Mykdown</span>
        </div>
        <div className="document-title" data-tauri-drag-region>
          {activeName ??
            (rootDir ? displayPathName(rootDir) : "Seus textos, no seu Mac")}
          {isDirty ? (
            <span className="dirty-dot" aria-label="Não salvo" />
          ) : null}
        </div>
        <div className="titlebar-actions">
          <IconButton
            label="Abrir arquivo (⌘O)"
            onClick={() => void handleOpenFile()}
          >
            <FilePlus2 size={16} />
          </IconButton>
          <IconButton
            label="Abrir pasta (⌘⇧O)"
            onClick={() => void handleOpenFolder()}
          >
            <FolderOpen size={16} />
          </IconButton>
          <span className="toolbar-divider" />
          <ViewModeButtons viewMode={viewMode} onChange={setViewMode} />
          <IconButton
            label="Salvar (⌘S)"
            disabled={!activePath || !isDirty}
            onClick={() => void handleSave()}
          >
            {isDirty ? <Save size={16} /> : <Check size={16} />}
          </IconButton>
        </div>
      </header>

      <div className="workspace">
        {showSidebar ? (
          <aside className="sidebar">
            <div className="sidebar-heading">
              <div className="sidebar-title">
                <span className="eyebrow">PASTA ABERTA</span>
                <strong>{displayPathName(rootDir)}</strong>
              </div>
              <div className="sidebar-heading-actions">
                <IconButton
                  label="Novo arquivo"
                  onClick={() =>
                    setWorkspaceDialog({
                      kind: "create-file",
                      parentPath: rootDir,
                    })
                  }
                >
                  <FilePlus2 size={15} />
                </IconButton>
                <IconButton
                  label="Nova pasta"
                  onClick={() =>
                    setWorkspaceDialog({
                      kind: "create-folder",
                      parentPath: rootDir,
                    })
                  }
                >
                  <FolderPlus size={15} />
                </IconButton>
                <span className="file-count">{countFiles(tree)}</span>
              </div>
            </div>
            {tree.length > 0 ? (
              <FileTree
                nodes={tree}
                activePath={activePath}
                onSelect={(path) => void openDocumentAtPath(path)}
                onCreateFile={(parentPath) =>
                  setWorkspaceDialog({ kind: "create-file", parentPath })
                }
                onCreateFolder={(parentPath) =>
                  setWorkspaceDialog({ kind: "create-folder", parentPath })
                }
                onRename={(node) =>
                  setWorkspaceDialog({ kind: "rename", node })
                }
                onDelete={(node) =>
                  setWorkspaceDialog({ kind: "delete", node })
                }
              />
            ) : (
              <div className="sidebar-empty">
                Nenhum arquivo Markdown nesta pasta.
              </div>
            )}
          </aside>
        ) : null}

        <main className="main-area">
          {!activePath && !rootDir ? (
            <WelcomeScreen
              recents={recents}
              onOpenFile={handleOpenFile}
              onOpenFolder={handleOpenFolder}
              onOpenRecent={handleOpenRecent}
            />
          ) : !activePath ? (
            <FolderEmptyState onOpenFile={handleOpenFile} />
          ) : (
            <div
              className={`content-panes mode-${viewMode}`}
              style={
                {
                  "--preview-margin": `${previewMargin}px`,
                } as CSSProperties
              }
            >
              {viewMode !== "preview" ? (
                <section className="editor-pane" aria-label="Editor Markdown">
                  <MarkdownEditor
                    key={activePath}
                    value={draftContent}
                    onChange={updateDraft}
                  />
                </section>
              ) : null}
              {viewMode !== "editor" ? (
                <section className="preview-pane" aria-label="Preview Markdown">
                  <MarkdownPreview content={draftContent} />
                </section>
              ) : null}
            </div>
          )}
        </main>
      </div>

      <footer className="statusbar">
        <span>{activePath ? "Markdown" : "Pronto"}</span>
        <span className="status-spacer" />
        {activePath ? (
          <>
            {viewMode === "preview" ? (
              <label className="preview-margin-control">
                <SlidersHorizontal size={12} />
                <span>Margem</span>
                <input
                  type="range"
                  min="16"
                  max="240"
                  step="8"
                  value={previewMargin}
                  aria-label="Margem lateral do preview"
                  onChange={(event) =>
                    setPreviewMargin(Number(event.currentTarget.value))
                  }
                />
                <output>{previewMargin}px</output>
              </label>
            ) : null}
            <span>{lineCount} linhas</span>
            <span>{wordCount} palavras</span>
            <span>UTF-8</span>
          </>
        ) : null}
      </footer>

      {externalChange ? (
        <ExternalChangeNotice
          change={externalChange}
          onReload={() => {
            if (activePath) {
              void readMarkdownDocument(activePath)
                .then((document) => {
                  loadDocument(document);
                  setExternalChange(null);
                })
                .catch(() => {
                  setError("Não foi possível recarregar o arquivo.");
                });
            }
          }}
          onKeep={() => {
            if (externalChange.kind === "modified") {
              setDiskModifiedAt(externalChange.modifiedAt);
            }
            setExternalChange(null);
          }}
        />
      ) : null}

      {error ? (
        <div className="error-toast" role="alert">
          <span>{error}</span>
          <button
            type="button"
            aria-label="Fechar erro"
            onClick={() => setError(null)}
          >
            <X size={15} />
          </button>
        </div>
      ) : null}

      {pendingAction ? (
        <UnsavedChangesDialog
          busy={isBusy}
          onSave={() => void saveAndContinue()}
          onDiscard={() => void discardAndContinue()}
          onCancel={() => setPendingAction(null)}
        />
      ) : null}

      {workspaceDialog ? (
        <WorkspaceActionDialog
          dialog={workspaceDialog}
          busy={isBusy}
          onConfirm={(value) => void submitWorkspaceDialog(value)}
          onCancel={() => setWorkspaceDialog(null)}
        />
      ) : null}

      {isBusy ? (
        <div className="busy-indicator" aria-label="Processando">
          <LoaderCircle size={17} className="spin" />
        </div>
      ) : null}
    </div>
  );
}

type ViewModeButtonsProps = {
  viewMode: ViewMode;
  onChange: (mode: ViewMode) => void;
};

function ViewModeButtons({ viewMode, onChange }: ViewModeButtonsProps) {
  return (
    <div className="view-modes" role="group" aria-label="Modo de visualização">
      <IconButton
        label="Só editor (⌘1)"
        active={viewMode === "editor"}
        onClick={() => onChange("editor")}
      >
        <PanelLeft size={16} />
      </IconButton>
      <IconButton
        label="Editor e preview (⌘2)"
        active={viewMode === "split"}
        onClick={() => onChange("split")}
      >
        <Columns2 size={16} />
      </IconButton>
      <IconButton
        label="Só preview (⌘3)"
        active={viewMode === "preview"}
        onClick={() => onChange("preview")}
      >
        <BookOpen size={16} />
      </IconButton>
    </div>
  );
}

type WelcomeScreenProps = {
  recents: RecentItem[];
  onOpenFile: () => Promise<void>;
  onOpenFolder: () => Promise<void>;
  onOpenRecent: (recent: RecentItem) => Promise<void>;
};

function WelcomeScreen({
  recents,
  onOpenFile,
  onOpenFolder,
  onOpenRecent,
}: WelcomeScreenProps) {
  return (
    <section className="welcome-screen">
      <div className="welcome-mark" aria-hidden="true">
        M<span>↓</span>
      </div>
      <div className="welcome-copy">
        <span className="eyebrow">MY MARKDOWN</span>
        <h1>Escreva onde seus arquivos já vivem.</h1>
        <p>
          Sem vault, sem importação e sem lock-in. Abra uma pasta ou um arquivo
          Markdown do seu Mac e comece.
        </p>
      </div>
      <div className="welcome-actions">
        <button
          className="primary-button"
          type="button"
          onClick={() => void onOpenFolder()}
        >
          <FolderOpen size={17} /> Abrir pasta <kbd>⌘⇧O</kbd>
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={() => void onOpenFile()}
        >
          <FileText size={17} /> Abrir arquivo <kbd>⌘O</kbd>
        </button>
      </div>
      <div className="recent-section">
        <span className="eyebrow">RECENTES</span>
        {recents.length > 0 ? (
          <div className="recent-list">
            {recents.map((recent) => (
              <button
                type="button"
                className="recent-row"
                key={recent.path}
                onClick={() => void onOpenRecent(recent)}
              >
                {recent.kind === "folder" ? (
                  <Folder size={16} />
                ) : (
                  <FileText size={16} />
                )}
                <span className="recent-name">{recent.name}</span>
                <span className="recent-path">{recent.path}</span>
              </button>
            ))}
          </div>
        ) : (
          <p>Seus arquivos recentes aparecerão aqui.</p>
        )}
      </div>
    </section>
  );
}

function FolderEmptyState({ onOpenFile }: { onOpenFile: () => Promise<void> }) {
  return (
    <section className="folder-empty-state">
      <FileText size={28} />
      <h2>Escolha um arquivo na sidebar</h2>
      <p>
        Ou abra um Markdown avulso para editar sem trocar a pasta no Finder.
      </p>
      <button
        className="secondary-button"
        type="button"
        onClick={() => void onOpenFile()}
      >
        Abrir arquivo
      </button>
    </section>
  );
}

function WorkspaceActionDialog({
  dialog,
  busy,
  onConfirm,
  onCancel,
}: {
  dialog: WorkspaceDialogState;
  busy: boolean;
  onConfirm: (value?: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(
    dialog.kind === "rename" ? dialog.node.name : "",
  );
  const isDelete = dialog.kind === "delete";
  const title =
    dialog.kind === "create-file"
      ? "Novo arquivo Markdown"
      : dialog.kind === "create-folder"
        ? "Nova pasta"
        : dialog.kind === "rename"
          ? "Renomear item"
          : "Excluir item";

  return (
    <div className="modal-backdrop">
      <form
        className="confirmation-dialog workspace-action-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-action-title"
        onSubmit={(event) => {
          event.preventDefault();
          if (isDelete || value.trim()) onConfirm(value.trim());
        }}
      >
        <div className={`dialog-icon ${isDelete ? "is-danger" : ""}`}>
          {isDelete ? <TriangleAlert size={20} /> : <FilePlus2 size={20} />}
        </div>
        <div>
          <h2 id="workspace-action-title">{title}</h2>
          {isDelete ? (
            <p>
              “{dialog.node.name}” será excluído permanentemente. Pastas só
              podem ser excluídas quando estiverem vazias.
            </p>
          ) : (
            <label className="dialog-field">
              <span>Nome</span>
              <input
                autoFocus
                value={value}
                placeholder={
                  dialog.kind === "create-file" ? "minhas-notas.md" : "Nome"
                }
                onChange={(event) => setValue(event.currentTarget.value)}
              />
              {dialog.kind === "create-file" ? (
                <small>A extensão .md será adicionada automaticamente.</small>
              ) : null}
            </label>
          )}
        </div>
        <div className="dialog-actions">
          <button
            type="button"
            className="ghost-button"
            disabled={busy}
            onClick={onCancel}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className={isDelete ? "danger-button" : "primary-button"}
            disabled={busy || (!isDelete && !value.trim())}
          >
            {isDelete ? "Excluir" : "Confirmar"}
          </button>
        </div>
      </form>
    </div>
  );
}

function UnsavedChangesDialog({
  busy,
  onSave,
  onDiscard,
  onCancel,
}: {
  busy: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <div
        className="confirmation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="unsaved-title"
      >
        <div className="dialog-icon">
          <Clock3 size={20} />
        </div>
        <div>
          <h2 id="unsaved-title">Salvar alterações?</h2>
          <p>
            O documento atual foi modificado. Escolha o que fazer antes de
            continuar.
          </p>
        </div>
        <div className="dialog-actions">
          <button
            type="button"
            className="ghost-button"
            disabled={busy}
            onClick={onCancel}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="danger-button"
            disabled={busy}
            onClick={onDiscard}
          >
            Descartar
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={busy}
            onClick={onSave}
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

function ExternalChangeNotice({
  change,
  onReload,
  onKeep,
}: {
  change: ExternalChange;
  onReload: () => void;
  onKeep: () => void;
}) {
  return (
    <div className="external-change-notice" role="alert">
      <TriangleAlert size={17} />
      <span>
        {change.kind === "modified"
          ? "Este arquivo foi alterado por outro aplicativo."
          : "Este arquivo foi removido ou movido no disco."}
      </span>
      {change.kind === "modified" ? (
        <button type="button" onClick={onReload}>
          Recarregar
        </button>
      ) : null}
      <button type="button" onClick={onKeep}>
        {change.kind === "modified" ? "Manter minha versão" : "Fechar aviso"}
      </button>
    </div>
  );
}
