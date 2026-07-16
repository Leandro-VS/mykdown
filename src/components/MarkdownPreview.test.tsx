import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownPreview } from "./MarkdownPreview";

describe("MarkdownPreview", () => {
  it("does not render scripts or javascript links from untrusted Markdown", () => {
    const html = renderToStaticMarkup(
      <MarkdownPreview
        content={'<script>alert("x")</script>\n[unsafe](javascript:alert(1))'}
      />,
    );

    expect(html).not.toContain("<script");
    expect(html).not.toContain("javascript:");
  });

  it("keeps multiline fenced code inside a preformatted block", () => {
    const html = renderToStaticMarkup(
      <MarkdownPreview
        content={
          '```python\nprint("primeira linha")\nprint("segunda linha")\n```'
        }
      />,
    );

    expect(html).toContain('class="code-block-shell"');
    expect(html).toContain("<pre><code");
    expect(html).toContain('class="hljs language-python"');
    expect(html).toContain("primeira linha");
    expect(html).toContain("segunda linha");
  });
});
