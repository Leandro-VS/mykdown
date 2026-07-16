import { beforeEach, describe, expect, it } from "vitest";
import { selectIsDirty, useWorkspaceStore } from "./workspace";

describe("workspace dirty state", () => {
  beforeEach(() => useWorkspaceStore.getState().setRoot(null, []));

  it("derives dirty state from saved and draft content", () => {
    useWorkspaceStore.getState().loadDocument({
      path: "/notes.md",
      name: "notes.md",
      content: "saved",
      modifiedAt: 1,
    });
    expect(selectIsDirty(useWorkspaceStore.getState())).toBe(false);

    useWorkspaceStore.getState().updateDraft("changed");
    expect(selectIsDirty(useWorkspaceStore.getState())).toBe(true);

    useWorkspaceStore.getState().markSaved(2);
    expect(selectIsDirty(useWorkspaceStore.getState())).toBe(false);
  });
});
