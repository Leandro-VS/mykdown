import { pluginRegistry, THEME_TOKEN_NAMES } from "../plugins/registry";
import type { ThemePreference } from "./persistence";

const BUILTIN_THEMES = new Set<ThemePreference>(["system", "dark", "light"]);

export function applyAppTheme(themeId: ThemePreference): void {
  const root = document.documentElement;
  for (const token of THEME_TOKEN_NAMES) root.style.removeProperty(token);
  root.style.removeProperty("color-scheme");

  const pluginTheme = pluginRegistry.getTheme(themeId);
  if (pluginTheme) {
    root.dataset.theme = pluginTheme.id;
    root.style.setProperty("color-scheme", pluginTheme.colorScheme);
    for (const token of THEME_TOKEN_NAMES) {
      root.style.setProperty(token, pluginTheme.tokens[token]);
    }
    return;
  }

  root.dataset.theme = BUILTIN_THEMES.has(themeId) ? themeId : "system";
}
