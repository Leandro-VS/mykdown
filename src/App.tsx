import { useCallback, useEffect, useMemo } from "react";
import {
  BookOpen,
  Check,
  Columns2,
  FilePlus2,
  FileText,
  FolderOpen,
  LoaderCircle,
  PanelLeft,
  Save,
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
  getFileModifiedAt,
  isRunningInTauri,
  readMarkdownDocument,
  saveMarkdownDocument,
  scanMarkdownFolder,
} from "./services/filesystem";
import { selectIsDirty, useWorkspaceStore } from "./store/workspace";
import type { MarkdownTreeNode, ViewMode } from "./types/files";

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
  const loadDocument = useWorkspaceStore((state) => state.loadDocument);
  const updateDraft = useWorkspaceStore((state) => state.updateDraft);
  const markSaved = useWorkspaceStore((state) => state.markSaved);
  const setViewMode = useWorkspaceStore((state) => state.setViewMode);
  const setBusy = useWorkspaceStore((state) => state.setBusy);
  const setError = useWorkspaceStore((state) => state.setError);

  const canDiscardChanges = useCallback(() => {
    if (!isDirty) {
      return true;
    }

    return window.confirm(
      "Este arquivo possui alterações não salvas. Deseja descartá-las?",
    );
  }, [isDirty]);

  const openDocumentAtPath = useCallback(
    async (path: string) => {
      if (path === activePath || !canDiscardChanges()) {
        return;
      }

      setBusy(true);
      setError(null);
      try {
        loadDocument(await readMarkdownDocument(path));
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
    [activePath, canDiscardChanges, loadDocument, setBusy, setError],
  );

  const handleOpenFile = useCallback(async () => {
    if (!canDiscardChanges()) {
      return;
    }

    setError(null);
    try {
      const path = await chooseMarkdownFile();
      if (!path) {
        return;
      }
      setBusy(true);
      const document = await readMarkdownDocument(path);
      setRoot(null, []);
      loadDocument(document);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível abrir o arquivo.",
      );
    } finally {
      setBusy(false);
    }
  }, [canDiscardChanges, loadDocument, setBusy, setError, setRoot]);

  const handleOpenFolder = useCallback(async () => {
    if (!canDiscardChanges()) {
      return;
    }

    setError(null);
    try {
      const path = await chooseMarkdownFolder();
      if (!path) {
        return;
      }
      setBusy(true);
      setRoot(path, await scanMarkdownFolder(path));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível abrir a pasta.",
      );
    } finally {
      setBusy(false);
    }
  }, [canDiscardChanges, setBusy, setError, setRoot]);

  const handleSave = useCallback(async () => {
    if (!activePath || !isDirty) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const currentModifiedAt = await getFileModifiedAt(activePath);
      if (
        diskModifiedAt !== null &&
        currentModifiedAt !== null &&
        currentModifiedAt !== diskModifiedAt
      ) {
        throw new Error(
          "O arquivo mudou no disco. O salvamento foi interrompido para proteger suas alterações.",
        );
      }

      markSaved(await saveMarkdownDocument(activePath, draftContent));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar o arquivo.",
      );
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

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!event.metaKey) {
        return;
      }

      const key = event.key.toLocaleLowerCase();
      if (key === "s") {
        event.preventDefault();
        void handleSave();
      } else if (key === "o" && event.shiftKey) {
        event.preventDefault();
        void handleOpenFolder();
      } else if (key === "o") {
        event.preventDefault();
        void handleOpenFile();
      } else if (["1", "2", "3"].includes(key)) {
        event.preventDefault();
        const viewModeByKey: Record<string, ViewMode> = {
          "1": "editor",
          "2": "split",
          "3": "preview",
        };
        const nextViewMode = viewModeByKey[key];
        if (nextViewMode) {
          setViewMode(nextViewMode);
        }
      }
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [handleOpenFile, handleOpenFolder, handleSave, setViewMode]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isDirty) {
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    if (!isRunningInTauri()) {
      return;
    }
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
              <div>
                <span className="eyebrow">PASTA ABERTA</span>
                <strong>{displayPathName(rootDir)}</strong>
              </div>
              <span className="file-count">{countFiles(tree)}</span>
            </div>
            {tree.length > 0 ? (
              <FileTree
                nodes={tree}
                activePath={activePath}
                onSelect={(path) => void openDocumentAtPath(path)}
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
              onOpenFile={handleOpenFile}
              onOpenFolder={handleOpenFolder}
            />
          ) : !activePath ? (
            <FolderEmptyState onOpenFile={handleOpenFile} />
          ) : (
            <div className={`content-panes mode-${viewMode}`}>
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
            <span>{lineCount} linhas</span>
            <span>{wordCount} palavras</span>
            <span>UTF-8</span>
          </>
        ) : null}
      </footer>

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
  onOpenFile: () => Promise<void>;
  onOpenFolder: () => Promise<void>;
};

function WelcomeScreen({ onOpenFile, onOpenFolder }: WelcomeScreenProps) {
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
          <FolderOpen size={17} />
          Abrir pasta
          <kbd>⌘⇧O</kbd>
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={() => void onOpenFile()}
        >
          <FileText size={17} />
          Abrir arquivo
          <kbd>⌘O</kbd>
        </button>
      </div>
      <div className="recent-placeholder">
        <span className="eyebrow">RECENTES</span>
        <p>Seus arquivos recentes aparecerão aqui.</p>
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
