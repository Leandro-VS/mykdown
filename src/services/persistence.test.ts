import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREFERENCES,
  mergePreferences,
  mergeRecent,
  type RecentItem,
} from "./persistence";

describe("mergeRecent", () => {
  it("moves an existing path to the front without duplicating it", () => {
    const current: RecentItem[] = [
      { kind: "file", path: "/notes/one.md", name: "one.md", lastOpenedAt: 1 },
      { kind: "folder", path: "/notes", name: "notes", lastOpenedAt: 2 },
    ];

    expect(
      mergeRecent(
        current,
        { kind: "file", path: "/notes/one.md", name: "one.md" },
        3,
      ),
    ).toEqual([
      { kind: "file", path: "/notes/one.md", name: "one.md", lastOpenedAt: 3 },
      { kind: "folder", path: "/notes", name: "notes", lastOpenedAt: 2 },
    ]);
  });

  it("keeps only the ten most recent items", () => {
    const current: RecentItem[] = Array.from({ length: 10 }, (_, index) => ({
      kind: "file",
      path: `/notes/${index}.md`,
      name: `${index}.md`,
      lastOpenedAt: index,
    }));

    const next = mergeRecent(
      current,
      { kind: "folder", path: "/new", name: "new" },
      11,
    );

    expect(next).toHaveLength(10);
    expect(next[0]?.path).toBe("/new");
    expect(next.some((item) => item.path === "/notes/9.md")).toBe(false);
  });
});

describe("mergePreferences", () => {
  it("migrates partial preferences without disabling new defaults", () => {
    expect(
      mergePreferences({
        theme: "light",
        officialPlugins: { mermaid: false } as {
          mermaid: boolean;
          flowchart: boolean;
          themePack: boolean;
        },
      }),
    ).toEqual({
      ...DEFAULT_PREFERENCES,
      theme: "light",
      officialPlugins: { mermaid: false, flowchart: true, themePack: true },
    });
  });
});
