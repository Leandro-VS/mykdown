import type { ComponentType } from "react";

export type CodeBlockRendererProps = {
  code: string;
};

export type CodeBlockRenderer = ComponentType<CodeBlockRendererProps>;

export const THEME_TOKEN_NAMES = [
  "--bg-app",
  "--bg-sidebar",
  "--bg-editor",
  "--bg-preview",
  "--bg-elevated",
  "--bg-hover",
  "--text-primary",
  "--text-secondary",
  "--text-faint",
  "--accent",
  "--accent-strong",
  "--accent-soft",
  "--selection",
  "--active-line",
  "--border",
  "--danger",
  "--shadow",
] as const;

export type ThemeTokenName = (typeof THEME_TOKEN_NAMES)[number];

export type PluginTheme = {
  id: string;
  name: string;
  colorScheme: "dark" | "light";
  tokens: Record<ThemeTokenName, string>;
};

export class PluginRegistry {
  private readonly codeBlockRenderers = new Map<string, CodeBlockRenderer>();
  private readonly themes = new Map<string, PluginTheme>();

  registerCodeBlock(language: string, renderer: CodeBlockRenderer): () => void {
    const key = language.toLocaleLowerCase();
    if (this.codeBlockRenderers.has(key)) {
      throw new Error(`Já existe um plugin para blocos ${key}.`);
    }
    this.codeBlockRenderers.set(key, renderer);
    return () => {
      if (this.codeBlockRenderers.get(key) === renderer) {
        this.codeBlockRenderers.delete(key);
      }
    };
  }

  getCodeBlockRenderer(language: string): CodeBlockRenderer | undefined {
    return this.codeBlockRenderers.get(language.toLocaleLowerCase());
  }

  listCodeBlockLanguages(): string[] {
    return [...this.codeBlockRenderers.keys()].sort();
  }

  registerTheme(theme: PluginTheme): () => void {
    const key = theme.id.toLocaleLowerCase();
    if (!/^[a-z0-9-]+$/.test(key)) {
      throw new Error("O identificador do tema é inválido.");
    }
    if (this.themes.has(key)) {
      throw new Error(`Já existe um tema com o identificador ${key}.`);
    }
    const registeredTheme = { ...theme, id: key };
    this.themes.set(key, registeredTheme);
    return () => {
      if (this.themes.get(key) === registeredTheme) this.themes.delete(key);
    };
  }

  getTheme(id: string): PluginTheme | undefined {
    return this.themes.get(id.toLocaleLowerCase());
  }

  listThemes(): PluginTheme[] {
    return [...this.themes.values()].sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  }
}

export const pluginRegistry = new PluginRegistry();
