import type { ComponentType } from "react";

export type CodeBlockRendererProps = {
  code: string;
};

export type CodeBlockRenderer = ComponentType<CodeBlockRendererProps>;

class PluginRegistry {
  private readonly codeBlockRenderers = new Map<string, CodeBlockRenderer>();

  registerCodeBlock(language: string, renderer: CodeBlockRenderer): () => void {
    const key = language.toLocaleLowerCase();
    this.codeBlockRenderers.set(key, renderer);
    return () => this.codeBlockRenderers.delete(key);
  }

  getCodeBlockRenderer(language: string): CodeBlockRenderer | undefined {
    return this.codeBlockRenderers.get(language.toLocaleLowerCase());
  }
}

export const pluginRegistry = new PluginRegistry();
