import { useEffect, useMemo, useState } from "react";
import { FileSearch, FileText } from "lucide-react";
import type { SearchableFile } from "../utils/search";
import { searchMarkdownFiles } from "../utils/search";

export function QuickOpenDialog({
  files,
  onSelect,
  onClose,
}: {
  files: SearchableFile[];
  onSelect: (path: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const results = useMemo(
    () => searchMarkdownFiles(files, query),
    [files, query],
  );

  useEffect(() => setSelectedIndex(0), [query]);

  return (
    <div className="modal-backdrop quick-open-backdrop" onMouseDown={onClose}>
      <div
        className="quick-open-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Abrir arquivo rapidamente"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
          else if (event.key === "ArrowDown") {
            event.preventDefault();
            setSelectedIndex((index) =>
              Math.min(index + 1, results.length - 1),
            );
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setSelectedIndex((index) => Math.max(index - 1, 0));
          } else if (event.key === "Enter" && results[selectedIndex]) {
            onSelect(results[selectedIndex].path);
          }
        }}
      >
        <label className="quick-open-input">
          <FileSearch size={18} />
          <input
            autoFocus
            value={query}
            placeholder="Digite parte do nome do arquivo…"
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
          <kbd>ESC</kbd>
        </label>
        <div className="quick-open-results" role="listbox">
          {results.length ? (
            results.map((file, index) => (
              <button
                type="button"
                role="option"
                aria-selected={index === selectedIndex}
                className={index === selectedIndex ? "is-selected" : ""}
                key={file.path}
                onMouseEnter={() => setSelectedIndex(index)}
                onClick={() => onSelect(file.path)}
              >
                <FileText size={15} />
                <span>{file.name}</span>
                <small>{file.relativePath}</small>
              </button>
            ))
          ) : (
            <p>Nenhum arquivo encontrado.</p>
          )}
        </div>
        <footer>
          <span>↑↓ navegar</span>
          <span>↵ abrir</span>
          <span>{files.length} arquivos</span>
        </footer>
      </div>
    </div>
  );
}
