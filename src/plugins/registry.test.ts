import { describe, expect, it } from "vitest";
import type { ComponentType } from "react";
import { PluginRegistry, type CodeBlockRendererProps } from "./registry";

const Renderer = (() => null) as ComponentType<CodeBlockRendererProps>;

describe("PluginRegistry", () => {
  it("registers and disposes renderers without leaving stale entries", () => {
    const registry = new PluginRegistry();
    const dispose = registry.registerCodeBlock("FLOWCHART", Renderer);

    expect(registry.getCodeBlockRenderer("flowchart")).toBe(Renderer);
    expect(registry.listCodeBlockLanguages()).toEqual(["flowchart"]);

    dispose();
    expect(registry.getCodeBlockRenderer("flowchart")).toBeUndefined();
  });

  it("rejects conflicting renderers", () => {
    const registry = new PluginRegistry();
    registry.registerCodeBlock("mermaid", Renderer);
    expect(() => registry.registerCodeBlock("MERMAID", Renderer)).toThrow();
  });
});
