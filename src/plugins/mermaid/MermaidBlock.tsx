import { useEffect, useId, useState } from "react";
import DOMPurify from "dompurify";
import type { CodeBlockRendererProps } from "../registry";

export function MermaidBlock({ code }: CodeBlockRendererProps) {
  const reactId = useId();
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      try {
        setError(null);
        const { default: mermaid } = await import("mermaid");
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "dark",
          flowchart: { htmlLabels: false },
        });

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
  }, [code, reactId]);

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
    <div
      className="mermaid-diagram"
      aria-label="Diagrama Mermaid"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
