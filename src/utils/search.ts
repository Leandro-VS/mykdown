import type { MarkdownTreeNode } from "../types/files";

export type SearchableFile = {
  name: string;
  path: string;
  relativePath: string;
};

export function flattenMarkdownFiles(
  nodes: MarkdownTreeNode[],
  parents: string[] = [],
): SearchableFile[] {
  return nodes.flatMap((node) => {
    const relativePath = [...parents, node.name].join("/");
    return node.kind === "file"
      ? [{ name: node.name, path: node.path, relativePath }]
      : flattenMarkdownFiles(node.children, [...parents, node.name]);
  });
}

export function fuzzyScore(candidate: string, query: string): number | null {
  const value = candidate.toLocaleLowerCase();
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return 0;

  let score = 0;
  let cursor = 0;
  let previousIndex = -2;

  for (const character of needle) {
    const index = value.indexOf(character, cursor);
    if (index === -1) return null;
    score += index === previousIndex + 1 ? 8 : 2;
    if (index === 0 || "/-_. ".includes(value[index - 1] ?? "")) score += 5;
    score -= index * 0.02;
    previousIndex = index;
    cursor = index + 1;
  }

  return score - value.length * 0.01;
}

export function searchMarkdownFiles(
  files: SearchableFile[],
  query: string,
  limit = 12,
): SearchableFile[] {
  return files
    .map((file) => ({ file, score: fuzzyScore(file.relativePath, query) }))
    .filter(
      (result): result is { file: SearchableFile; score: number } =>
        result.score !== null,
    )
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.file.relativePath.localeCompare(right.file.relativePath),
    )
    .slice(0, limit)
    .map(({ file }) => file);
}
