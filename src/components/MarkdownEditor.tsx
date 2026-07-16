import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type CSSProperties,
} from "react";
import { basicSetup } from "codemirror";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { reachedSynchronizedScrollTarget } from "../utils/scrollSync";

type MarkdownEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onScroll?: (ratio: number) => void;
  fontSize: number;
  lineHeight: number;
  wordWrap: boolean;
};

export type MarkdownEditorHandle = {
  scrollToRatio: (ratio: number) => void;
  focus: () => void;
};

const mykdownEditorTheme = EditorView.theme(
  {
    "&": {
      height: "100%",
      color: "var(--text-primary)",
      backgroundColor: "transparent",
    },
    ".cm-content": {
      caretColor: "var(--accent)",
      fontFamily: "var(--font-mono)",
      padding: "28px clamp(20px, 4vw, 54px)",
    },
    ".cm-line": { padding: "0" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--accent)" },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      backgroundColor: "var(--selection)",
    },
    ".cm-gutters": {
      color: "var(--text-faint)",
      backgroundColor: "transparent",
      border: "none",
      paddingLeft: "8px",
    },
    ".cm-activeLine, .cm-activeLineGutter": {
      backgroundColor: "var(--active-line)",
    },
    ".cm-scroller": {
      fontFamily: "var(--font-mono)",
      lineHeight: "var(--editor-line-height, 1.75)",
      fontSize: "var(--editor-font-size, 13px)",
    },
  },
  { dark: true },
);

export const MarkdownEditor = forwardRef<
  MarkdownEditorHandle,
  MarkdownEditorProps
>(function MarkdownEditor(
  { value, onChange, onScroll, fontSize, lineHeight, wordWrap },
  forwardedRef,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onScrollRef = useRef(onScroll);
  const initialValueRef = useRef(value);
  const synchronizedScrollTargetRef = useRef<number | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
    onScrollRef.current = onScroll;
  }, [onChange, onScroll]);

  useImperativeHandle(
    forwardedRef,
    () => ({
      scrollToRatio(ratio) {
        const scroller = editorRef.current?.scrollDOM;
        if (!scroller) return;
        const maximum = scroller.scrollHeight - scroller.clientHeight;
        const target = Math.max(0, Math.min(1, ratio)) * maximum;
        if (reachedSynchronizedScrollTarget(scroller.scrollTop, target)) return;
        synchronizedScrollTargetRef.current = target;
        scroller.scrollTop = target;
      },
      focus() {
        editorRef.current?.focus();
      },
    }),
    [],
  );

  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: initialValueRef.current,
      extensions: [
        basicSetup,
        markdown({ base: markdownLanguage }),
        ...(wordWrap ? [EditorView.lineWrapping] : []),
        mykdownEditorTheme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    const handleScroll = () => {
      const synchronizedTarget = synchronizedScrollTargetRef.current;
      if (
        reachedSynchronizedScrollTarget(
          view.scrollDOM.scrollTop,
          synchronizedTarget,
        )
      ) {
        synchronizedScrollTargetRef.current = null;
        return;
      }
      synchronizedScrollTargetRef.current = null;
      const maximum = view.scrollDOM.scrollHeight - view.scrollDOM.clientHeight;
      onScrollRef.current?.(
        maximum > 0 ? view.scrollDOM.scrollTop / maximum : 0,
      );
    };
    view.scrollDOM.addEventListener("scroll", handleScroll, { passive: true });
    editorRef.current = view;
    view.focus();

    return () => {
      view.scrollDOM.removeEventListener("scroll", handleScroll);
      view.destroy();
      editorRef.current = null;
    };
  }, [wordWrap]);

  useEffect(() => {
    const view = editorRef.current;
    if (!view || view.state.doc.toString() === value) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    });
  }, [value]);

  return (
    <div
      className="editor-host"
      ref={containerRef}
      style={
        {
          "--editor-font-size": `${fontSize}px`,
          "--editor-line-height": lineHeight,
        } as CSSProperties
      }
    />
  );
});
