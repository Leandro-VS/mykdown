export type LocalPluginManifest = {
  id: string;
  name: string;
  version: string;
  apiVersion: 1;
  language: string;
  entry: "plugin.js";
  capabilities: ["preview.codeBlock"];
};

export type LocalPluginDescriptor = {
  manifest: LocalPluginManifest | null;
  source: string | null;
  directoryName: string;
  error: string | null;
};
