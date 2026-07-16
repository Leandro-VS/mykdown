import { pluginRegistry } from "../registry";
import { THEME_PACK_THEMES } from "./themes";

let disposers: Array<() => void> = [];

export function activateThemePackPlugin(): void {
  if (disposers.length > 0) return;
  disposers = THEME_PACK_THEMES.map((theme) =>
    pluginRegistry.registerTheme(theme),
  );
}

export function deactivateThemePackPlugin(): void {
  disposers.forEach((dispose) => dispose());
  disposers = [];
}

export { THEME_PACK_THEMES } from "./themes";
