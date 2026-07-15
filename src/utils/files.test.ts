import { describe, expect, it } from "vitest";
import { isMarkdownFile, sortMarkdownTree } from "./files";

describe("isMarkdownFile", () => {
  it("accepts supported extensions without case sensitivity", () => {
    expect(isMarkdownFile("notes.md")).toBe(true);
    expect(isMarkdownFile("README.MARKDOWN")).toBe(true);
  });

  it("rejects unrelated and misleading extensions", () => {
    expect(isMarkdownFile("notes.txt")).toBe(false);
    expect(isMarkdownFile("notes.md.backup")).toBe(false);
  });
});

describe("sortMarkdownTree", () => {
  it("places directories first and sorts every level", () => {
    const sorted = sortMarkdownTree([
      { kind: "file", name: "z.md", path: "/z.md" },
      { kind: "directory", name: "b", path: "/b", children: [] },
      { kind: "file", name: "a.md", path: "/a.md" },
    ]);

    expect(sorted.map((node) => node.name)).toEqual(["b", "a.md", "z.md"]);
  });
});
