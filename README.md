# Marli

Editor Markdown minimalista para macOS, pensado para abrir arquivos e pastas comuns do sistema sem vault, importação ou banco de dados.

O projeto está na fase de planejamento. O filesystem será a fonte da verdade e o primeiro alvo será exclusivamente um Mac Apple Silicon para uso pessoal.

## Documentação

- [Visão e requisitos](./plano-editor-markdown.md)
- [Plano de implementação](./PLANO_IMPLEMENTACAO.md)

## Stack definida

- Tauri 2
- React + TypeScript + Vite
- CodeMirror 6
- `react-markdown`/remark/rehype para o preview
- Zustand para estado de interface

