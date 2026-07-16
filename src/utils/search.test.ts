import { describe, expect, it } from "vitest";
import {
  flattenMarkdownFiles,
  fuzzyScore,
  searchMarkdownFiles,
} from "./search";

describe("file search", () => {
  it("flattens nested Markdown paths", () => {
    expect(
      flattenMarkdownFiles([
        {
          kind: "directory",
          name: "docs",
          path: "/docs",
          children: [
            { kind: "file", name: "guide.md", path: "/docs/guide.md" },
          ],
        },
      ]),
    ).toEqual([
      {
        name: "guide.md",
        path: "/docs/guide.md",
        relativePath: "docs/guide.md",
      },
    ]);
  });

  it("matches fuzzy subsequences and ranks contiguous names first", () => {
    expect(fuzzyScore("project-guide.md", "pgd")).not.toBeNull();
    expect(fuzzyScore("notes.md", "xyz")).toBeNull();

    const results = searchMarkdownFiles(
      [
        { name: "map.md", path: "/map", relativePath: "archive/map.md" },
        { name: "main-plan.md", path: "/main", relativePath: "main-plan.md" },
      ],
      "main",
    );
    expect(results[0]?.path).toBe("/main");
  });
});
