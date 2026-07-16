import type { ComponentType } from "react";

export type CodeBlockRendererProps = {
  code: string;
};

export type CodeBlockRenderer = ComponentType<CodeBlockRendererProps>;

export class PluginRegistry {
  private readonly codeBlockRenderers = new Map<string, CodeBlockRenderer>();

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
}

export const pluginRegistry = new PluginRegistry();
