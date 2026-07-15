import { pluginRegistry } from "../registry";
import { MermaidBlock } from "./MermaidBlock";

let dispose: (() => void) | null = null;

export function activateMermaidPlugin(): void {
  dispose ??= pluginRegistry.registerCodeBlock("mermaid", MermaidBlock);
}

export function deactivateMermaidPlugin(): void {
  dispose?.();
  dispose = null;
}
