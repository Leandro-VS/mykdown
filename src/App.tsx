import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  BookOpen,
  Check,
  Clock3,
  Columns2,
  FilePlus2,
  FileText,
  FolderOpen,
  FolderCog,
  FolderPlus,
  House,
  LoaderCircle,
  PanelLeft,
  Save,
  Search,
  Settings2,
  SlidersHorizontal,
  RefreshCw,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { FileTree } from "./components/FileTree";
import { CurrentWeatherIcon } from "./components/CurrentWeatherIcon";
import { IconButton } from "./components/IconButton";
import {
  MarkdownEditor,
  type MarkdownEditorHandle,
} from "./components/MarkdownEditor";
import { MarkdownPreview } from "./components/MarkdownPreview";
import { QuickOpenDialog } from "./components/QuickOpenDialog";
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
import { exportPreviewAsHtml, exportPreviewAsPdf } from "./services/export";
import {
  listenForNativeMenu,
  listenForOpenFileRequests,
  takePendingOpenPaths,
  type NativeMenuAction,
} from "./services/integration";
import {
  DEFAULT_PREFERENCES,
  persistPreferences,
  persistSession,
  readPersistedState,
  recordRecent,
  removeRecent,
  type AppPreferences,
  type RecentItem,
} from "./services/persistence";
import {
  activateFlowchartPlugin,
  deactivateFlowchartPlugin,
} from "./plugins/flowchart";
import {
  activateMermaidPlugin,
  deactivateMermaidPlugin,
} from "./plugins/mermaid";
import {
  activateThemePackPlugin,
  deactivateThemePackPlugin,
  THEME_PACK_THEMES,
} from "./plugins/theme-pack";
import { activateLocalPlugins } from "./plugins/local/runtime";
import type { LocalPluginDescriptor } from "./plugins/local/types";
import {
  listLocalPlugins,
  openLocalPluginsDirectory,
  removeLocalPlugin,
} from "./services/localPlugins";
import { applyAppTheme } from "./services/theme";
import { selectIsDirty, useWorkspaceStore } from "./store/workspace";
import type { MarkdownTreeNode, ViewMode } from "./types/files";
import { getSaoPauloGreeting } from "./utils/greeting";
import { flattenMarkdownFiles } from "./utils/search";
import { reachedSynchronizedScrollTarget } from "./utils/scrollSync";

type DeferredAction = () => Promise<void>;

type ExternalChange =
  { kind: "modified"; modifiedAt: number } | { kind: "removed" };

type WorkspaceDialogState =
  | { kind: "create-file"; parentPath: string; openAsWorkspace?: boolean }
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
  const [isQuickOpen, setIsQuickOpen] = useState(false);
  const [preferences, setPreferences] =
    useState<AppPreferences>(DEFAULT_PREFERENCES);
  const [showPreferences, setShowPreferences] = useState(false);
  const [localPlugins, setLocalPlugins] = useState<LocalPluginDescriptor[]>([]);
  const ignoreWatchUntil = useRef(0);
  const nativeMenuActionRef = useRef<(action: NativeMenuAction) => void>(
    () => undefined,
  );
  const drainOpenRequestsRef = useRef<() => void>(() => undefined);
  const editorRef = useRef<MarkdownEditorHandle>(null);
  const previewPaneRef = useRef<HTMLElement>(null);
  const synchronizedPreviewTargetRef = useRef<number | null>(null);

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

  const refreshLocalPlugins = useCallback(async () => {
    if (!isRunningInTauri()) return;
    try {
      setLocalPlugins(await listLocalPlugins());
    } catch {
      setError("Não foi possível carregar os plugins locais.");
    }
  }, [setError]);

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

  const performCreateDocumentFromHome = useCallback(async () => {
    setError(null);
    try {
      const path = await chooseMarkdownFolder();
      if (!path) return;
      setWorkspaceDialog({
        kind: "create-file",
        parentPath: path,
        openAsWorkspace: true,
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível escolher a pasta do novo arquivo.",
      );
    }
  }, [setError]);

  const handleCreateDocumentFromHome = useCallback(
    () => runOrDefer(performCreateDocumentFromHome),
    [performCreateDocumentFromHome, runOrDefer],
  );

  const performShowHome = useCallback(async () => {
    setRoot(null, []);
    setExternalChange(null);
  }, [setRoot]);

  const handleShowHome = useCallback(
    () => runOrDefer(performShowHome),
    [performShowHome, runOrDefer],
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
    async (parentPath: string, name: string, openAsWorkspace = false) => {
      await runOrDefer(async () => {
        setBusy(true);
        setError(null);
        try {
          const path = await createMarkdownDocument(parentPath, name);
          if (openAsWorkspace) {
            setRoot(parentPath, await scanMarkdownFolder(parentPath));
            await recordRecent({
              kind: "folder",
              path: parentPath,
              name: displayPathName(parentPath),
            });
          } else {
            await refreshWorkspaceTree();
          }
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
    [
      loadDocument,
      refreshWorkspaceTree,
      runOrDefer,
      setBusy,
      setError,
      setRoot,
    ],
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
        await handleCreateFile(
          dialog.parentPath,
          value,
          dialog.openAsWorkspace,
        );
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
      } else if (action === "quick-open") {
        if (tree.length > 0) setIsQuickOpen(true);
      } else if (action === "preferences") {
        setShowPreferences(true);
      } else if (action === "export-html") {
        if (!activeName) {
          setError("Abra um documento antes de exportar.");
        } else {
          void exportPreviewAsHtml(activeName).catch((cause) => {
            setError(
              cause instanceof Error
                ? cause.message
                : "Falha ao exportar HTML.",
            );
          });
        }
      } else if (action === "export-pdf") {
        try {
          exportPreviewAsPdf();
        } catch (cause) {
          setError(
            cause instanceof Error ? cause.message : "Falha ao exportar PDF.",
          );
        }
      } else if (action === "quit") {
        void runOrDefer(async () => {
          await getCurrentWindow().destroy();
        });
      } else if (rootDir) {
        setWorkspaceDialog({ kind: "create-file", parentPath: rootDir });
      } else {
        void handleCreateDocumentFromHome();
      }
    },
    [
      activeName,
      handleOpenFile,
      handleOpenFolder,
      handleCreateDocumentFromHome,
      handleSave,
      rootDir,
      runOrDefer,
      setError,
      tree.length,
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
        setPreferences(persisted.preferences);
        if (!persisted.session) return;

        setViewMode(persisted.session.viewMode);
        if (Number.isFinite(persisted.session.previewMargin)) {
          setPreviewMargin(
            Math.min(240, Math.max(16, persisted.session.previewMargin)),
          );
        }
      } catch {
        if (!cancelled) {
          setError("As preferências anteriores não puderam ser restauradas.");
        }
      } finally {
        if (!cancelled) {
          setPersistenceReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [setError, setViewMode]);

  useEffect(() => {
    if (!persistenceReady || !isRunningInTauri()) return;
    void persistSession({ rootDir, activePath, viewMode, previewMargin });
  }, [activePath, persistenceReady, previewMargin, rootDir, viewMode]);

  useEffect(() => {
    if (!persistenceReady || !isRunningInTauri()) return;
    void persistPreferences(preferences);
  }, [persistenceReady, preferences]);

  useEffect(() => {
    if (preferences.officialPlugins.themePack) activateThemePackPlugin();
    else deactivateThemePackPlugin();
    return deactivateThemePackPlugin;
  }, [preferences.officialPlugins.themePack]);

  useEffect(() => {
    applyAppTheme(preferences.theme);
  }, [preferences.officialPlugins.themePack, preferences.theme]);

  useEffect(() => {
    if (preferences.officialPlugins.mermaid) activateMermaidPlugin();
    else deactivateMermaidPlugin();
    return deactivateMermaidPlugin;
  }, [preferences.officialPlugins.mermaid]);

  useEffect(() => {
    if (preferences.officialPlugins.flowchart) activateFlowchartPlugin();
    else deactivateFlowchartPlugin();
    return deactivateFlowchartPlugin;
  }, [preferences.officialPlugins.flowchart]);

  useEffect(() => {
    if (!persistenceReady) return;
    void refreshLocalPlugins();
  }, [persistenceReady, refreshLocalPlugins]);

  useEffect(
    () =>
      activateLocalPlugins(
        localPlugins,
        preferences.localPluginEnabled,
        preferences.safeMode,
      ),
    [localPlugins, preferences.localPluginEnabled, preferences.safeMode],
  );

  useEffect(() => {
    if (!preferences.autoSave || !activePath || !isDirty) return;
    const timeout = window.setTimeout(() => void handleSave(), 1_500);
    return () => window.clearTimeout(timeout);
  }, [activePath, handleSave, isDirty, preferences.autoSave]);

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
      if (key === "p") {
        event.preventDefault();
        if (tree.length > 0) setIsQuickOpen(true);
      } else if (key === "s" && !isRunningInTauri()) {
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
  }, [handleOpenFile, handleOpenFolder, handleSave, setViewMode, tree.length]);

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
  const searchableFiles = useMemo(() => flattenMarkdownFiles(tree), [tree]);
  const wordCount = useMemo(
    () => draftContent.trim().split(/\s+/).filter(Boolean).length,
    [draftContent],
  );
  const showSidebar = rootDir !== null;

  const handleTitlebarMouseDown = (event: ReactMouseEvent<HTMLElement>) => {
    if (!isRunningInTauri() || event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, input, select, textarea, a, [role='button']")) {
      return;
    }
    void getCurrentWindow().startDragging();
  };

  const handleEditorScroll = (ratio: number) => {
    const preview = previewPaneRef.current;
    if (!preferences.syncScroll || viewMode !== "split" || !preview) {
      return;
    }
    const target = ratio * (preview.scrollHeight - preview.clientHeight);
    if (reachedSynchronizedScrollTarget(preview.scrollTop, target)) return;
    synchronizedPreviewTargetRef.current = target;
    preview.scrollTop = target;
  };

  const handlePreviewScroll = () => {
    const preview = previewPaneRef.current;
    if (!preferences.syncScroll || viewMode !== "split" || !preview) {
      return;
    }
    const synchronizedTarget = synchronizedPreviewTargetRef.current;
    if (
      reachedSynchronizedScrollTarget(preview.scrollTop, synchronizedTarget)
    ) {
      synchronizedPreviewTargetRef.current = null;
      return;
    }
    synchronizedPreviewTargetRef.current = null;
    const maximum = preview.scrollHeight - preview.clientHeight;
    editorRef.current?.scrollToRatio(
      maximum > 0 ? preview.scrollTop / maximum : 0,
    );
  };

  return (
    <div className={`app-shell ${showSidebar ? "has-sidebar" : ""}`}>
      <header className="titlebar" onMouseDown={handleTitlebarMouseDown}>
        <div className="brand">
          <span className="brand-mark">M↓</span>
          <span>Mykdown</span>
        </div>
        <div className="document-title">
          {activeName ??
            (rootDir ? displayPathName(rootDir) : "Seus textos, no seu Mac")}
          {isDirty ? (
            <span className="dirty-dot" aria-label="Não salvo" />
          ) : null}
        </div>
        <div className="titlebar-actions">
          <IconButton
            label="Início"
            disabled={!rootDir && !activePath}
            onClick={() => void handleShowHome()}
          >
            <House size={16} />
          </IconButton>
          <span className="toolbar-divider" />
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
          <IconButton
            label="Preferências"
            onClick={() => setShowPreferences(true)}
          >
            <Settings2 size={16} />
          </IconButton>
          {showSidebar ? (
            <IconButton
              label="Buscar arquivo (⌘P)"
              disabled={searchableFiles.length === 0}
              onClick={() => setIsQuickOpen(true)}
            >
              <Search size={16} />
            </IconButton>
          ) : null}
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
              onCreateFile={handleCreateDocumentFromHome}
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
                    ref={editorRef}
                    key={`${activePath}:${preferences.wordWrap}`}
                    value={draftContent}
                    onChange={updateDraft}
                    onScroll={handleEditorScroll}
                    fontSize={preferences.editorFontSize}
                    lineHeight={preferences.editorLineHeight}
                    wordWrap={preferences.wordWrap}
                  />
                </section>
              ) : null}
              {viewMode !== "editor" ? (
                <section
                  ref={previewPaneRef}
                  className="preview-pane"
                  aria-label="Preview Markdown"
                  onScroll={handlePreviewScroll}
                >
                  <MarkdownPreview
                    content={draftContent}
                    documentPath={activePath}
                    onOpenDocument={(path) => void openDocumentAtPath(path)}
                  />
                </section>
              ) : null}
            </div>
          )}
          {activePath && viewMode === "editor" ? (
            <div className="export-preview-host" aria-hidden="true">
              <MarkdownPreview
                content={draftContent}
                documentPath={activePath}
              />
            </div>
          ) : null}
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

      {isQuickOpen ? (
        <QuickOpenDialog
          files={searchableFiles}
          onSelect={(path) => {
            setIsQuickOpen(false);
            void openDocumentAtPath(path);
          }}
          onClose={() => setIsQuickOpen(false)}
        />
      ) : null}

      {showPreferences ? (
        <PreferencesDialog
          preferences={preferences}
          localPlugins={localPlugins}
          onChange={setPreferences}
          onReloadPlugins={() => void refreshLocalPlugins()}
          onOpenPluginsFolder={() =>
            void openLocalPluginsDirectory().catch(() =>
              setError("Não foi possível abrir a pasta de plugins."),
            )
          }
          onRemovePlugin={(id, name) => {
            if (!window.confirm(`Remover o plugin local “${name}”?`)) return;
            void removeLocalPlugin(id)
              .then(() => {
                setPreferences((current) => {
                  const localPluginEnabled = {
                    ...current.localPluginEnabled,
                  };
                  delete localPluginEnabled[id];
                  return { ...current, localPluginEnabled };
                });
                return refreshLocalPlugins();
              })
              .catch(() => setError("Não foi possível remover o plugin."));
          }}
          onClose={() => setShowPreferences(false)}
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
  onCreateFile: () => Promise<void>;
  onOpenFile: () => Promise<void>;
  onOpenFolder: () => Promise<void>;
  onOpenRecent: (recent: RecentItem) => Promise<void>;
};

function WelcomeScreen({
  recents,
  onCreateFile,
  onOpenFile,
  onOpenFolder,
  onOpenRecent,
}: WelcomeScreenProps) {
  const [greeting, setGreeting] = useState(() => getSaoPauloGreeting());
  const recentFiles = recents.filter((recent) => recent.kind === "file");

  useEffect(() => {
    const interval = window.setInterval(
      () => setGreeting(getSaoPauloGreeting()),
      60_000,
    );
    return () => window.clearInterval(interval);
  }, []);

  return (
    <section className="welcome-screen">
      <div className="welcome-mark" aria-hidden="true">
        M<span>↓</span>
      </div>
      <div className="welcome-copy">
        <div className="welcome-greeting">
          <h1>{greeting}</h1>
          <CurrentWeatherIcon />
        </div>
        <p>Leitor e Editor de markdown minimalista</p>
      </div>
      <div className="welcome-actions">
        <button
          className="primary-button"
          type="button"
          onClick={() => void onCreateFile()}
        >
          <FilePlus2 size={17} /> Novo arquivo
        </button>
        <button
          className="secondary-button"
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
        <span className="eyebrow">ARQUIVOS RECENTES</span>
        {recentFiles.length > 0 ? (
          <div className="recent-list">
            {recentFiles.map((recent) => (
              <button
                type="button"
                className="recent-row"
                key={recent.path}
                onClick={() => void onOpenRecent(recent)}
              >
                <FileText size={16} />
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

function PreferencesDialog({
  preferences,
  localPlugins,
  onChange,
  onReloadPlugins,
  onOpenPluginsFolder,
  onRemovePlugin,
  onClose,
}: {
  preferences: AppPreferences;
  localPlugins: LocalPluginDescriptor[];
  onChange: (preferences: AppPreferences) => void;
  onReloadPlugins: () => void;
  onOpenPluginsFolder: () => void;
  onRemovePlugin: (id: string, name: string) => void;
  onClose: () => void;
}) {
  const update = (patch: Partial<AppPreferences>) =>
    onChange({ ...preferences, ...patch });

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className="preferences-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="preferences-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span className="eyebrow">MYKDOWN</span>
            <h2 id="preferences-title">Preferências</h2>
          </div>
          <button
            type="button"
            aria-label="Fechar preferências"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </header>

        <div className="preferences-grid">
          <section>
            <h3>Aparência</h3>
            <label className="preference-row">
              <span>Tema</span>
              <select
                value={preferences.theme}
                onChange={(event) =>
                  update({
                    theme: event.currentTarget.value as AppPreferences["theme"],
                  })
                }
              >
                <option value="system">Seguir o sistema</option>
                <option value="dark">Escuro</option>
                <option value="light">Claro</option>
                {preferences.officialPlugins.themePack
                  ? THEME_PACK_THEMES.map((theme) => (
                      <option key={theme.id} value={theme.id}>
                        {theme.name}
                      </option>
                    ))
                  : null}
              </select>
            </label>
            <label className="preference-slider">
              <span>
                Tamanho do editor{" "}
                <output>{preferences.editorFontSize}px</output>
              </span>
              <input
                type="range"
                min="11"
                max="22"
                value={preferences.editorFontSize}
                onChange={(event) =>
                  update({ editorFontSize: Number(event.currentTarget.value) })
                }
              />
            </label>
            <label className="preference-slider">
              <span>
                Altura da linha{" "}
                <output>{preferences.editorLineHeight.toFixed(2)}</output>
              </span>
              <input
                type="range"
                min="1.35"
                max="2.2"
                step="0.05"
                value={preferences.editorLineHeight}
                onChange={(event) =>
                  update({
                    editorLineHeight: Number(event.currentTarget.value),
                  })
                }
              />
            </label>
          </section>

          <section>
            <h3>Editor</h3>
            <PreferenceToggle
              label="Quebrar linhas longas"
              checked={preferences.wordWrap}
              onChange={(wordWrap) => update({ wordWrap })}
            />
            <PreferenceToggle
              label="Sincronizar rolagem"
              checked={preferences.syncScroll}
              onChange={(syncScroll) => update({ syncScroll })}
            />
            <PreferenceToggle
              label="Salvar automaticamente"
              description="Salva 1,5 segundo depois da última alteração."
              checked={preferences.autoSave}
              onChange={(autoSave) => update({ autoSave })}
            />
          </section>

          <section>
            <h3>Plugins oficiais</h3>
            <PreferenceToggle
              label="Mermaid"
              description="Diagramas em blocos ```mermaid."
              checked={preferences.officialPlugins.mermaid}
              onChange={(mermaid) =>
                update({
                  officialPlugins: {
                    ...preferences.officialPlugins,
                    mermaid,
                  },
                })
              }
            />
            <PreferenceToggle
              label="Flowchart"
              description="Fluxogramas em blocos ```flowchart."
              checked={preferences.officialPlugins.flowchart}
              onChange={(flowchart) =>
                update({
                  officialPlugins: {
                    ...preferences.officialPlugins,
                    flowchart,
                  },
                })
              }
            />
            <PreferenceToggle
              label="Pacote de temas"
              description="Adiciona Nord, Dracula e Coffee."
              checked={preferences.officialPlugins.themePack}
              onChange={(themePack) =>
                update({
                  theme:
                    !themePack &&
                    ["nord", "dracula", "coffee"].includes(preferences.theme)
                      ? "dark"
                      : preferences.theme,
                  officialPlugins: {
                    ...preferences.officialPlugins,
                    themePack,
                  },
                })
              }
            />
          </section>

          <section className="local-plugins-section">
            <div className="preference-section-heading">
              <div>
                <h3>Plugins locais</h3>
                <p>
                  Executados isoladamente, com limite de tempo e sem acesso ao
                  filesystem.
                </p>
              </div>
              <div>
                <button type="button" onClick={onOpenPluginsFolder}>
                  <FolderCog size={14} /> Abrir pasta
                </button>
                <button type="button" onClick={onReloadPlugins}>
                  <RefreshCw size={14} /> Recarregar
                </button>
              </div>
            </div>
            <PreferenceToggle
              label="Modo seguro"
              description="Inicia sem executar nenhum plugin local."
              checked={preferences.safeMode}
              onChange={(safeMode) => update({ safeMode })}
            />
            <div className="local-plugin-list">
              {localPlugins.length ? (
                localPlugins.map((plugin) => {
                  const manifest = plugin.manifest;
                  return (
                    <div
                      className="local-plugin-row"
                      key={plugin.directoryName}
                    >
                      <div>
                        <strong>
                          {manifest?.name ?? plugin.directoryName}
                        </strong>
                        <small>
                          {plugin.error ??
                            `${manifest?.language} · API ${manifest?.apiVersion} · v${manifest?.version}`}
                        </small>
                      </div>
                      {manifest && !plugin.error ? (
                        <input
                          type="checkbox"
                          aria-label={`Ativar ${manifest.name}`}
                          disabled={preferences.safeMode}
                          checked={Boolean(
                            preferences.localPluginEnabled[manifest.id],
                          )}
                          onChange={(event) =>
                            update({
                              localPluginEnabled: {
                                ...preferences.localPluginEnabled,
                                [manifest.id]: event.currentTarget.checked,
                              },
                            })
                          }
                        />
                      ) : null}
                      <button
                        type="button"
                        className="remove-local-plugin"
                        aria-label={`Remover ${manifest?.name ?? plugin.directoryName}`}
                        onClick={() =>
                          onRemovePlugin(
                            plugin.directoryName,
                            manifest?.name ?? plugin.directoryName,
                          )
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })
              ) : (
                <p className="empty-local-plugins">
                  Nenhum plugin local instalado. Use “Abrir pasta” para
                  adicionar um.
                </p>
              )}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

function PreferenceToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="preference-toggle">
      <span>
        <strong>{label}</strong>
        {description ? <small>{description}</small> : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
    </label>
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
