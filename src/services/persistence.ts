import { load, type Store } from "@tauri-apps/plugin-store";
import type { ViewMode } from "../types/files";

const STORE_PATH = "mykdown-state.json";
const MAX_RECENTS = 10;

export type RecentItem = {
  kind: "file" | "folder";
  path: string;
  name: string;
  lastOpenedAt: number;
};

export type SessionSnapshot = {
  rootDir: string | null;
  activePath: string | null;
  viewMode: ViewMode;
  previewMargin: number;
};

export type ThemePreference =
  "system" | "dark" | "light" | "nord" | "dracula" | "coffee";

export type AppPreferences = {
  theme: ThemePreference;
  editorFontSize: number;
  editorLineHeight: number;
  wordWrap: boolean;
  syncScroll: boolean;
  autoSave: boolean;
  officialPlugins: {
    mermaid: boolean;
    flowchart: boolean;
    themePack: boolean;
  };
  localPluginEnabled: Record<string, boolean>;
  safeMode: boolean;
};

export const DEFAULT_PREFERENCES: AppPreferences = {
  theme: "system",
  editorFontSize: 13,
  editorLineHeight: 1.75,
  wordWrap: true,
  syncScroll: true,
  autoSave: false,
  officialPlugins: { mermaid: true, flowchart: true, themePack: true },
  localPluginEnabled: {},
  safeMode: false,
};

export type PersistedState = {
  recents: RecentItem[];
  session: SessionSnapshot | null;
  preferences: AppPreferences;
};

export function mergePreferences(
  preferences?: Partial<AppPreferences> | null,
): AppPreferences {
  return {
    ...DEFAULT_PREFERENCES,
    ...preferences,
    officialPlugins: {
      ...DEFAULT_PREFERENCES.officialPlugins,
      ...preferences?.officialPlugins,
    },
  };
}

export function mergeRecent(
  current: RecentItem[],
  item: Omit<RecentItem, "lastOpenedAt">,
  lastOpenedAt = Date.now(),
): RecentItem[] {
  return [
    { ...item, lastOpenedAt },
    ...current.filter((recent) => recent.path !== item.path),
  ].slice(0, MAX_RECENTS);
}

let storePromise: Promise<Store> | null = null;

function getStore(): Promise<Store> {
  storePromise ??= load(STORE_PATH, {
    autoSave: 200,
    defaults: {
      recents: [],
      session: null,
      preferences: DEFAULT_PREFERENCES,
    },
  });
  return storePromise;
}

export async function readPersistedState(): Promise<PersistedState> {
  const store = await getStore();
  return {
    recents: (await store.get<RecentItem[]>("recents")) ?? [],
    session: (await store.get<SessionSnapshot | null>("session")) ?? null,
    preferences: mergePreferences(
      await store.get<Partial<AppPreferences>>("preferences"),
    ),
  };
}

export async function recordRecent(
  item: Omit<RecentItem, "lastOpenedAt">,
): Promise<RecentItem[]> {
  const store = await getStore();
  const current = (await store.get<RecentItem[]>("recents")) ?? [];
  const next = mergeRecent(current, item);
  await store.set("recents", next);
  return next;
}

export async function removeRecent(path: string): Promise<RecentItem[]> {
  const store = await getStore();
  const current = (await store.get<RecentItem[]>("recents")) ?? [];
  const next = current.filter((recent) => recent.path !== path);
  await store.set("recents", next);
  return next;
}

export async function persistSession(session: SessionSnapshot): Promise<void> {
  const store = await getStore();
  await store.set("session", session);
}

export async function persistPreferences(
  preferences: AppPreferences,
): Promise<void> {
  const store = await getStore();
  await store.set("preferences", preferences);
}
