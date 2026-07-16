import { useEffect, useState } from "react";
import DOMPurify from "dompurify";
import type { IsolatedPluginRuntime } from "./runtime";

export function LocalPluginBlock({
  runtime,
  code,
  name,
}: {
  runtime: IsolatedPluginRuntime;
  code: string;
  name: string;
}) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void runtime
      .render(code)
      .then((result) => {
        if (!cancelled) {
          setError(null);
          setHtml(DOMPurify.sanitize(result));
        }
      })
      .catch((cause) => {
        if (!cancelled) {
          setHtml(null);
          setError(cause instanceof Error ? cause.message : "Falha no plugin.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [code, runtime]);

  if (error) {
    return (
      <div className="plugin-error" role="status">
        <strong>{name} falhou.</strong>
        <span>{error}</span>
      </div>
    );
  }
  if (html === null)
    return <div className="plugin-loading">Executando {name}…</div>;
  return (
    <div
      className="local-plugin-output"
      data-plugin={name}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
