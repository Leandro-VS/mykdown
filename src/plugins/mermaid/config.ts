import type { MermaidConfig } from "mermaid";

export function createMermaidConfig(theme: "dark" | "default"): MermaidConfig {
  return {
    startOnLoad: false,
    securityLevel: "strict",
    htmlLabels: false,
    theme,
  };
}
