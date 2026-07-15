import type { MarkdownTreeNode } from "../types/files";

const MARKDOWN_EXTENSIONS = [".md", ".markdown"];

export function isMarkdownFile(name: string): boolean {
  const normalizedName = name.toLocaleLowerCase();
  return MARKDOWN_EXTENSIONS.some((extension) =>
    normalizedName.endsWith(extension),
  );
}

export function sortMarkdownTree(
  nodes: MarkdownTreeNode[],
): MarkdownTreeNode[] {
  return [...nodes]
    .map((node) =>
      node.kind === "directory"
        ? { ...node, children: sortMarkdownTree(node.children) }
        : node,
    )
    .sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === "directory" ? -1 : 1;
      }

      return left.name.localeCompare(right.name, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });
}
