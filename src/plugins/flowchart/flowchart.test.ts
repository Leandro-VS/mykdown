import { describe, expect, it } from "vitest";
import { normalizeFlowchartSource } from "./normalize";

describe("normalizeFlowchartSource", () => {
  it("adds a default top-down declaration to compact flowcharts", () => {
    expect(normalizeFlowchartSource("A --> B")).toBe("flowchart TD\nA --> B");
  });

  it("preserves explicit Mermaid flowchart directions", () => {
    expect(normalizeFlowchartSource("flowchart LR\nA --> B")).toBe(
      "flowchart LR\nA --> B",
    );
    expect(normalizeFlowchartSource("graph BT\nA --> B")).toBe(
      "graph BT\nA --> B",
    );
  });
});
