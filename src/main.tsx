import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { activateMermaidPlugin } from "./plugins/mermaid";
import "./styles.css";

activateMermaidPlugin();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
