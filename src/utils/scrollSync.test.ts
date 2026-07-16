import { describe, expect, it } from "vitest";
import { reachedSynchronizedScrollTarget } from "./scrollSync";

describe("reachedSynchronizedScrollTarget", () => {
  it("consumes programmatic scroll events within rounding tolerance", () => {
    expect(reachedSynchronizedScrollTarget(240.6, 240)).toBe(true);
    expect(reachedSynchronizedScrollTarget(241.1, 240)).toBe(false);
    expect(reachedSynchronizedScrollTarget(240, null)).toBe(false);
  });
});
