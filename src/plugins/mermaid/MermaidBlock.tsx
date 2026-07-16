import { useEffect, useId, useState } from "react";
import { Check, Copy } from "lucide-react";
import DOMPurify from "dompurify";
import type { CodeBlockRendererProps } from "../registry";
import { createMermaidConfig } from "./config";

export function MermaidBlock({ code }: CodeBlockRendererProps) {
  const reactId = useId();
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<"dark" | "default">("dark");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const updateTheme = () => {
      const preference = document.documentElement.dataset.theme ?? "system";
      const pluginUsesDarkScheme = getComputedStyle(
        document.documentElement,
      ).colorScheme.includes("dark");
      setTheme(
        preference === "dark" ||
          pluginUsesDarkScheme ||
          (preference === "system" && media.matches)
          ? "dark"
          : "default",
      );
    };
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "style"],
    });
    media.addEventListener("change", updateTheme);
    updateTheme();
    return () => {
      observer.disconnect();
      media.removeEventListener("change", updateTheme);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      try {
        setError(null);
        const { default: mermaid } = await import("mermaid");
        mermaid.initialize(createMermaidConfig(theme));

        const diagramId = `mykdown-mermaid-${reactId.replaceAll(":", "")}`;
        const result = await mermaid.render(diagramId, code);
        const cleanSvg = DOMPurify.sanitize(result.svg, {
          USE_PROFILES: { svg: true, svgFilters: true },
        });

        if (!cancelled) {
          setSvg(cleanSvg);
        }
      } catch (cause) {
        if (!cancelled) {
          setSvg(null);
          setError(
            cause instanceof Error ? cause.message : "Diagrama inválido.",
          );
        }
      }
    }

    void renderDiagram();
    return () => {
      cancelled = true;
    };
  }, [code, reactId, theme]);

  if (error) {
    return (
      <div className="plugin-error" role="status">
        <strong>Não foi possível renderizar este diagrama.</strong>
        <span>{error}</span>
      </div>
    );
  }

  if (!svg) {
    return <div className="plugin-loading">Renderizando Mermaid…</div>;
  }

  return (
    <div className="mermaid-diagram" aria-label="Diagrama Mermaid">
      <button
        type="button"
        className="copy-diagram-source"
        onClick={() => {
          void navigator.clipboard.writeText(code).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1_200);
          });
        }}
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
        {copied ? "Copiado" : "Copiar fonte"}
      </button>
      <div dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
}
