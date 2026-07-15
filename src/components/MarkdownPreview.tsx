import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { openUrl } from "@tauri-apps/plugin-opener";
import { pluginRegistry } from "../plugins/registry";
import { isRunningInTauri } from "../services/filesystem";
import { highlightCode } from "../services/highlight";

type MarkdownPreviewProps = {
  content: string;
};

export function MarkdownPreview({ content }: MarkdownPreviewProps) {
  return (
    <article className="markdown-preview">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
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
          a({ href, children, ...props }) {
            return (
              <a
                href={href}
                {...props}
                onClick={(event) => {
                  if (!href || !/^https?:\/\//i.test(href)) {
                    return;
                  }
                  event.preventDefault();
                  if (isRunningInTauri()) {
                    void openUrl(href);
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
