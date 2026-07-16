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
});
