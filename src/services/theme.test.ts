// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  activateThemePackPlugin,
  deactivateThemePackPlugin,
} from "../plugins/theme-pack";
import { applyAppTheme } from "./theme";

describe("applyAppTheme", () => {
  beforeEach(() => activateThemePackPlugin());

  afterEach(() => {
    deactivateThemePackPlugin();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("style");
  });

  it("applies a registered plugin theme as safe CSS tokens", () => {
    applyAppTheme("nord");

    expect(document.documentElement.dataset.theme).toBe("nord");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(document.documentElement.style.getPropertyValue("--bg-app")).toBe(
      "#2e3440",
    );
    expect(document.documentElement.style.getPropertyValue("--accent")).toBe(
      "#88c0d0",
    );
  });

  it("clears plugin tokens when switching back to a built-in theme", () => {
    applyAppTheme("coffee");
    applyAppTheme("light");

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("");
    expect(document.documentElement.style.getPropertyValue("--bg-app")).toBe(
      "",
    );
  });
});
