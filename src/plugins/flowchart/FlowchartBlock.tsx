import type { CodeBlockRendererProps } from "../registry";
import { MermaidBlock } from "../mermaid/MermaidBlock";
import { normalizeFlowchartSource } from "./normalize";

export function FlowchartBlock({ code }: CodeBlockRendererProps) {
  return <MermaidBlock code={normalizeFlowchartSource(code)} />;
}
