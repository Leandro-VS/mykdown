import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
} from "lucide-react";
import type { MarkdownTreeNode } from "../types/files";

type FileTreeProps = {
  nodes: MarkdownTreeNode[];
  activePath: string | null;
  onSelect: (path: string) => void;
  depth?: number;
};

export function FileTree({
  nodes,
  activePath,
  onSelect,
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
            depth={depth}
          />
        ) : (
          <button
            type="button"
            role="treeitem"
            key={node.path}
            className={`tree-row file-row ${activePath === node.path ? "is-selected" : ""}`}
            style={{ "--tree-depth": depth } as React.CSSProperties}
            onClick={() => onSelect(node.path)}
          >
            <FileText size={15} aria-hidden="true" />
            <span>{node.name}</span>
          </button>
        ),
      )}
    </div>
  );
}

type DirectoryRowProps = {
  node: Extract<MarkdownTreeNode, { kind: "directory" }>;
  activePath: string | null;
  onSelect: (path: string) => void;
  depth: number;
};

function DirectoryRow({
  node,
  activePath,
  onSelect,
  depth,
}: DirectoryRowProps) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div>
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
      {isOpen ? (
        <FileTree
          nodes={node.children}
          activePath={activePath}
          onSelect={onSelect}
          depth={depth + 1}
        />
      ) : null}
    </div>
  );
}
