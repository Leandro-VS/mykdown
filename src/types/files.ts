export type ViewMode = "editor" | "split" | "preview";

export type MarkdownFileNode = {
  kind: "file";
  name: string;
  path: string;
};

export type MarkdownDirectoryNode = {
  kind: "directory";
  name: string;
  path: string;
  children: MarkdownTreeNode[];
};

export type MarkdownTreeNode = MarkdownFileNode | MarkdownDirectoryNode;

export type MarkdownDocument = {
  path: string;
  name: string;
  content: string;
  modifiedAt: number | null;
};
