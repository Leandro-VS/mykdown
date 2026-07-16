import { describe, expect, it } from "vitest";
import { getSaoPauloGreeting } from "./greeting";

describe("getSaoPauloGreeting", () => {
  it("uses the America/Sao_Paulo hour for each greeting period", () => {
    expect(getSaoPauloGreeting(new Date("2026-07-16T11:00:00Z"))).toBe(
      "Bom dia",
    );
    expect(getSaoPauloGreeting(new Date("2026-07-16T15:00:00Z"))).toBe(
      "Boa tarde",
    );
    expect(getSaoPauloGreeting(new Date("2026-07-16T23:00:00Z"))).toBe(
      "Boa noite",
    );
  });
});
