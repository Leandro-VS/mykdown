import { describe, expect, it } from "vitest";
import { createMermaidConfig } from "./config";

describe("createMermaidConfig", () => {
  it("uses native SVG labels so sanitization does not remove node text", () => {
    const config = createMermaidConfig("dark");

    expect(config.htmlLabels).toBe(false);
    expect(config.securityLevel).toBe("strict");
    expect(config.theme).toBe("dark");
  });
});
