import { pluginRegistry } from "../registry";
import { LocalPluginBlock } from "./LocalPluginBlock";
import type { LocalPluginDescriptor } from "./types";

type PendingRender = {
  resolve: (html: string) => void;
  reject: (error: Error) => void;
  timeout: number;
};

export class IsolatedPluginRuntime {
  private readonly worker: Worker;
  private readonly pending = new Map<number, PendingRender>();
  private nextRequestId = 1;
  private stopped = false;

  constructor(source: string) {
    const bootstrap = `"use strict";
${source}
self.onmessage = async (event) => {
  const { id, code } = event.data || {};
  try {
    const plugin = self.mykdownPlugin;
    if (!plugin || typeof plugin.render !== "function") {
      throw new Error("O plugin precisa definir self.mykdownPlugin.render(code).");
    }
    const html = await plugin.render(String(code ?? ""));
    self.postMessage({ id, ok: true, html: String(html ?? "") });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};`;
    const url = URL.createObjectURL(
      new Blob([bootstrap], { type: "text/javascript" }),
    );
    this.worker = new Worker(url);
    URL.revokeObjectURL(url);
    this.worker.onmessage = (event: MessageEvent) => {
      const payload = event.data as {
        id?: number;
        ok?: boolean;
        html?: string;
        error?: string;
      };
      if (typeof payload.id !== "number") return;
      const request = this.pending.get(payload.id);
      if (!request) return;
      window.clearTimeout(request.timeout);
      this.pending.delete(payload.id);
      if (payload.ok) request.resolve(payload.html ?? "");
      else request.reject(new Error(payload.error ?? "Falha no plugin local."));
    };
    this.worker.onerror = () => this.stop("O plugin local falhou.");
  }

  render(code: string): Promise<string> {
    if (this.stopped)
      return Promise.reject(new Error("Plugin desativado após falha."));
    const id = this.nextRequestId++;
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("O plugin excedeu o limite de 1 segundo."));
        this.stop("Plugin interrompido por tempo excedido.");
      }, 1_000);
      this.pending.set(id, { resolve, reject, timeout });
      this.worker.postMessage({ id, code });
    });
  }

  stop(message = "Plugin desativado."): void {
    if (this.stopped) return;
    this.stopped = true;
    this.worker.terminate();
    for (const request of this.pending.values()) {
      window.clearTimeout(request.timeout);
      request.reject(new Error(message));
    }
    this.pending.clear();
  }
}

export function activateLocalPlugins(
  descriptors: LocalPluginDescriptor[],
  enabled: Record<string, boolean>,
  safeMode: boolean,
): () => void {
  if (safeMode) return () => undefined;
  const disposers: Array<() => void> = [];

  for (const descriptor of descriptors) {
    const { manifest, source } = descriptor;
    if (!manifest || !source || !enabled[manifest.id]) continue;
    try {
      const runtime = new IsolatedPluginRuntime(source);
      const Renderer = ({ code }: { code: string }) => (
        <LocalPluginBlock runtime={runtime} code={code} name={manifest.name} />
      );
      const disposeRenderer = pluginRegistry.registerCodeBlock(
        manifest.language,
        Renderer,
      );
      disposers.push(() => {
        disposeRenderer();
        runtime.stop();
      });
    } catch {
      // Um conflito de linguagem desativa somente este plugin.
    }
  }

  return () => disposers.forEach((dispose) => dispose());
}
