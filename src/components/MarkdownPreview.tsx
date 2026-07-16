import { isValidElement, useEffect, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { openUrl } from "@tauri-apps/plugin-opener";
import { pluginRegistry } from "../plugins/registry";
import {
  isRunningInTauri,
  readDocumentAsset,
  resolveMarkdownLink,
} from "../services/filesystem";
import { highlightCode } from "../services/highlight";

type MarkdownPreviewProps = {
  content: string;
  documentPath?: string | null;
  onOpenDocument?: (path: string) => void;
};

export function MarkdownPreview({
  content,
  documentPath,
  onOpenDocument,
}: MarkdownPreviewProps) {
  return (
    <article className="markdown-preview">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          pre({ children }) {
            if (isValidElement<{ className?: string }>(children)) {
              const language = /language-([\w-]+)/.exec(
                children.props.className ?? "",
              )?.[1];
              if (language && pluginRegistry.getCodeBlockRenderer(language)) {
                return children;
              }
            }
            return <CodeBlockShell>{children}</CodeBlockShell>;
          },
          code({ className, children, ...props }) {
            const language = /language-([\w-]+)/.exec(className ?? "")?.[1];
            const Renderer = language
              ? pluginRegistry.getCodeBlockRenderer(language)
              : undefined;

            if (Renderer) {
              return <Renderer code={String(children).replace(/\n$/, "")} />;
            }

            const highlighted = language
              ? highlightCode(String(children).replace(/\n$/, ""), language)
              : null;

            if (highlighted) {
              return (
                <code
                  className={`hljs language-${language}`}
                  dangerouslySetInnerHTML={{ __html: highlighted }}
                />
              );
            }

            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          img({ src, alt, ...props }) {
            return (
              <LocalMarkdownImage
                source={typeof src === "string" ? src : ""}
                alt={alt ?? ""}
                documentPath={documentPath}
                {...props}
              />
            );
          },
          a({ href, children, ...props }) {
            return (
              <a
                href={href}
                {...props}
                onClick={(event) => {
                  if (!href) return;
                  if (/^https?:\/\//i.test(href)) {
                    event.preventDefault();
                    if (isRunningInTauri()) void openUrl(href);
                    return;
                  }
                  if (
                    documentPath &&
                    onOpenDocument &&
                    /\.(md|markdown)(?:[?#].*)?$/i.test(href)
                  ) {
                    event.preventDefault();
                    void resolveMarkdownLink(documentPath, href)
                      .then(onOpenDocument)
                      .catch(() => undefined);
                  }
                }}
              >
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </article>
  );
}

function CodeBlockShell({ children }: { children: ReactNode }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="code-block-shell">
      <button
        type="button"
        onClick={(event) => {
          const code =
            event.currentTarget.parentElement?.querySelector("code")
              ?.textContent ?? "";
          void navigator.clipboard.writeText(code).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1_200);
          });
        }}
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
        {copied ? "Copiado" : "Copiar"}
      </button>
      <pre>{children}</pre>
    </div>
  );
}

function LocalMarkdownImage({
  source,
  alt,
  documentPath,
  ...props
}: {
  source: string;
  alt: string;
  documentPath?: string | null;
}) {
  const [resolvedSource, setResolvedSource] = useState<string | null>(null);
  const isAlreadySafeSource = /^(data:|blob:)/i.test(source);

  useEffect(() => {
    if (isAlreadySafeSource) {
      setResolvedSource(source);
      return;
    }
    if (!documentPath || !source || !isRunningInTauri()) {
      setResolvedSource(null);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    void readDocumentAsset(documentPath, source)
      .then(({ bytes, mimeType }) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(
          new Blob([new Uint8Array(bytes)], { type: mimeType }),
        );
        setResolvedSource(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setResolvedSource(null);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [documentPath, isAlreadySafeSource, source]);

  return resolvedSource ? (
    <img src={resolvedSource} alt={alt} {...props} />
  ) : (
    <span className="broken-local-image" role="img" aria-label={alt}>
      Imagem indisponível: {alt || source}
    </span>
  );
}
