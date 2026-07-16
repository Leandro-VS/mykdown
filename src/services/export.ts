import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character] ?? character,
  );
}

async function blobUrlToDataUrl(source: string): Promise<string> {
  const blob = await fetch(source).then((response) => response.blob());
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function serializedPreview(): Promise<string> {
  const preview = document.querySelector<HTMLElement>(".markdown-preview");
  if (!preview) throw new Error("Não há preview disponível para exportar.");
  const clone = preview.cloneNode(true) as HTMLElement;
  const originalImages = [...preview.querySelectorAll("img")];
  const clonedImages = [...clone.querySelectorAll("img")];

  await Promise.all(
    originalImages.map(async (image, index) => {
      if (!image.src.startsWith("blob:")) return;
      const cloneImage = clonedImages[index];
      if (cloneImage) cloneImage.src = await blobUrlToDataUrl(image.src);
    }),
  );
  return clone.innerHTML;
}

export async function exportPreviewAsHtml(documentName: string): Promise<void> {
  const path = await save({
    title: "Exportar Markdown como HTML",
    defaultPath: documentName.replace(/\.(md|markdown)$/i, ".html"),
    filters: [{ name: "HTML", extensions: ["html"] }],
  });
  if (!path) return;

  const body = await serializedPreview();
  const title = escapeHtml(documentName.replace(/\.(md|markdown)$/i, ""));
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    :root { color-scheme: light dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { max-width: 980px; margin: 0 auto; padding: 48px; line-height: 1.7; }
    img, svg { max-width: 100%; height: auto; } table { width: 100%; border-collapse: collapse; }
    th, td { padding: 8px 10px; border: 1px solid #8a8a8a; text-align: left; }
    pre { overflow: auto; padding: 16px; border-radius: 8px; background: rgba(127,127,127,.12); }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    blockquote { margin-left: 0; padding-left: 16px; border-left: 3px solid #6f9f91; }
    @media print { body { max-width: none; padding: 0; } }
  </style>
</head>
<body>${body}</body>
</html>`;
  await invoke("write_html_export", { path, content: html });
}

export function exportPreviewAsPdf(): void {
  if (!document.querySelector(".markdown-preview")) {
    throw new Error("Não há preview disponível para exportar.");
  }
  window.print();
}
