import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import type { MarkdownTreeNode } from "../types/files";

type FileTreeProps = {
  nodes: MarkdownTreeNode[];
  activePath: string | null;
  onSelect: (path: string) => void;
  onCreateFile: (parentPath: string) => void;
  onCreateFolder: (parentPath: string) => void;
  onRename: (node: MarkdownTreeNode) => void;
  onDelete: (node: MarkdownTreeNode) => void;
  depth?: number;
};

export function FileTree({
  nodes,
  activePath,
  onSelect,
  onCreateFile,
  onCreateFolder,
  onRename,
  onDelete,
  depth = 0,
}: FileTreeProps) {
  return (
    <div className="file-tree" role={depth === 0 ? "tree" : "group"}>
      {nodes.map((node) =>
        node.kind === "directory" ? (
          <DirectoryRow
            key={node.path}
            node={node}
            activePath={activePath}
            onSelect={onSelect}
            onCreateFile={onCreateFile}
            onCreateFolder={onCreateFolder}
            onRename={onRename}
            onDelete={onDelete}
            depth={depth}
          />
        ) : (
          <div className="tree-row-wrap" key={node.path}>
            <button
              type="button"
              role="treeitem"
              className={`tree-row file-row ${activePath === node.path ? "is-selected" : ""}`}
              style={{ "--tree-depth": depth } as React.CSSProperties}
              onClick={() => onSelect(node.path)}
            >
              <FileText size={15} aria-hidden="true" />
              <span>{node.name}</span>
            </button>
            <NodeActions
              node={node}
              onCreateFile={onCreateFile}
              onCreateFolder={onCreateFolder}
              onRename={onRename}
              onDelete={onDelete}
            />
          </div>
        ),
      )}
    </div>
  );
}

type DirectoryRowProps = Omit<FileTreeProps, "nodes"> & {
  node: Extract<MarkdownTreeNode, { kind: "directory" }>;
  depth: number;
};

function DirectoryRow({
  node,
  activePath,
  onSelect,
  onCreateFile,
  onCreateFolder,
  onRename,
  onDelete,
  depth,
}: DirectoryRowProps) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div>
      <div className="tree-row-wrap">
        <button
          type="button"
          role="treeitem"
          aria-expanded={isOpen}
          className="tree-row directory-row"
          style={{ "--tree-depth": depth } as React.CSSProperties}
          onClick={() => setIsOpen((value) => !value)}
        >
          {isOpen ? (
            <ChevronDown size={13} aria-hidden="true" />
          ) : (
            <ChevronRight size={13} aria-hidden="true" />
          )}
          {isOpen ? (
            <FolderOpen size={15} aria-hidden="true" />
          ) : (
            <Folder size={15} aria-hidden="true" />
          )}
          <span>{node.name}</span>
        </button>
        <NodeActions
          node={node}
          onCreateFile={onCreateFile}
          onCreateFolder={onCreateFolder}
          onRename={onRename}
          onDelete={onDelete}
        />
      </div>
      {isOpen ? (
        <FileTree
          nodes={node.children}
          activePath={activePath}
          onSelect={onSelect}
          onCreateFile={onCreateFile}
          onCreateFolder={onCreateFolder}
          onRename={onRename}
          onDelete={onDelete}
          depth={depth + 1}
        />
      ) : null}
    </div>
  );
}

function NodeActions({
  node,
  onCreateFile,
  onCreateFolder,
  onRename,
  onDelete,
}: {
  node: MarkdownTreeNode;
  onCreateFile: (parentPath: string) => void;
  onCreateFolder: (parentPath: string) => void;
  onRename: (node: MarkdownTreeNode) => void;
  onDelete: (node: MarkdownTreeNode) => void;
}) {
  const runAndClose = (
    event: React.MouseEvent<HTMLButtonElement>,
    action: () => void,
  ) => {
    event.currentTarget.closest("details")?.removeAttribute("open");
    action();
  };

  return (
    <details className="tree-actions">
      <summary aria-label={`Ações para ${node.name}`}>
        <MoreHorizontal size={15} />
      </summary>
      <div className="tree-action-menu">
        {node.kind === "directory" ? (
          <>
            <button
              type="button"
              onClick={(event) =>
                runAndClose(event, () => onCreateFile(node.path))
              }
            >
              <FilePlus2 size={14} /> Novo arquivo
            </button>
            <button
              type="button"
              onClick={(event) =>
                runAndClose(event, () => onCreateFolder(node.path))
              }
            >
              <FolderPlus size={14} /> Nova pasta
            </button>
          </>
        ) : null}
        <button
          type="button"
          onClick={(event) => runAndClose(event, () => onRename(node))}
        >
          <Pencil size={14} /> Renomear
        </button>
        <button
          type="button"
          className="danger-menu-item"
          onClick={(event) => runAndClose(event, () => onDelete(node))}
        >
          <Trash2 size={14} /> Excluir
        </button>
      </div>
    </details>
  );
}
