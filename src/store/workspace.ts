import { create } from "zustand";
import type {
  MarkdownDocument,
  MarkdownTreeNode,
  ViewMode,
} from "../types/files";

type WorkspaceState = {
  rootDir: string | null;
  tree: MarkdownTreeNode[];
  activePath: string | null;
  activeName: string | null;
  savedContent: string;
  draftContent: string;
  diskModifiedAt: number | null;
  viewMode: ViewMode;
  isBusy: boolean;
  error: string | null;
  setRoot: (rootDir: string | null, tree: MarkdownTreeNode[]) => void;
  updateTree: (tree: MarkdownTreeNode[]) => void;
  loadDocument: (document: MarkdownDocument) => void;
  updateDraft: (content: string) => void;
  markSaved: (modifiedAt: number | null) => void;
  setDiskModifiedAt: (modifiedAt: number | null) => void;
  setViewMode: (viewMode: ViewMode) => void;
  setBusy: (isBusy: boolean) => void;
  setError: (error: string | null) => void;
};

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  rootDir: null,
  tree: [],
  activePath: null,
  activeName: null,
  savedContent: "",
  draftContent: "",
  diskModifiedAt: null,
  viewMode: "split",
  isBusy: false,
  error: null,
  setRoot: (rootDir, tree) =>
    set({
      rootDir,
      tree,
      activePath: null,
      activeName: null,
      savedContent: "",
      draftContent: "",
      diskModifiedAt: null,
      error: null,
    }),
  updateTree: (tree) => set({ tree }),
  loadDocument: (document) =>
    set({
      activePath: document.path,
      activeName: document.name,
      savedContent: document.content,
      draftContent: document.content,
      diskModifiedAt: document.modifiedAt,
      error: null,
    }),
  updateDraft: (draftContent) => set({ draftContent }),
  markSaved: (diskModifiedAt) =>
    set((state) => ({ savedContent: state.draftContent, diskModifiedAt })),
  setDiskModifiedAt: (diskModifiedAt) => set({ diskModifiedAt }),
  setViewMode: (viewMode) => set({ viewMode }),
  setBusy: (isBusy) => set({ isBusy }),
  setError: (error) => set({ error, isBusy: false }),
}));

export function selectIsDirty(state: WorkspaceState): boolean {
  return state.draftContent !== state.savedContent;
}
