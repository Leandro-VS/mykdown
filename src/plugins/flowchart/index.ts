import { pluginRegistry } from "../registry";
import { FlowchartBlock } from "./FlowchartBlock";

let dispose: (() => void) | null = null;

export function activateFlowchartPlugin(): void {
  dispose ??= pluginRegistry.registerCodeBlock("flowchart", FlowchartBlock);
}

export function deactivateFlowchartPlugin(): void {
  dispose?.();
  dispose = null;
}
