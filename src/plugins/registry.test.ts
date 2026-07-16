import { describe, expect, it } from "vitest";
import type { ComponentType } from "react";
import {
  PluginRegistry,
  THEME_TOKEN_NAMES,
  type CodeBlockRendererProps,
  type PluginTheme,
} from "./registry";

const Renderer = (() => null) as ComponentType<CodeBlockRendererProps>;

const theme: PluginTheme = {
  id: "Test-Theme",
  name: "Tema de teste",
  colorScheme: "dark",
  tokens: Object.fromEntries(
    THEME_TOKEN_NAMES.map((token) => [token, "#123456"]),
  ) as PluginTheme["tokens"],
};

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

  it("registers normalized themes and disposes them", () => {
    const registry = new PluginRegistry();
    const dispose = registry.registerTheme(theme);

    expect(registry.getTheme("TEST-THEME")).toMatchObject({
      id: "test-theme",
      name: "Tema de teste",
    });
    expect(registry.listThemes()).toHaveLength(1);

    dispose();
    expect(registry.getTheme("test-theme")).toBeUndefined();
  });

  it("rejects invalid and conflicting theme identifiers", () => {
    const registry = new PluginRegistry();
    registry.registerTheme(theme);

    expect(() => registry.registerTheme(theme)).toThrow();
    expect(() =>
      registry.registerTheme({ ...theme, id: "tema inválido" }),
    ).toThrow();
  });
});
