# Mykdown

Editor Markdown minimalista para macOS, pensado para abrir arquivos e pastas comuns do sistema sem vault, importação ou banco de dados.

O projeto está em implementação rumo à versão oficial `1.0.0`. O filesystem é a fonte da verdade e o primeiro alvo é exclusivamente um Mac Apple Silicon para uso pessoal. Não haverá um MVP separado ou descartável: toda implementação fará parte da base de produção.

## Documentação

- [Visão e requisitos](./docs/plano-editor-markdown.md)
- [Plano de implementação](./docs/PLANO_IMPLEMENTACAO.md)

## Stack definida

- Tauri 2
- React + TypeScript + Vite
- CodeMirror 6
- `react-markdown`/remark/rehype para o preview
- Zustand para estado de interface
- Arquitetura de plugins, começando por Mermaid

## Desenvolvimento

```bash
npm install
npm run tauri dev
```

Validação local:

```bash
npm run lint
npm test
npm run build
cd src-tauri && cargo check
```

O bundle macOS é gerado com:

```bash
npm run tauri build -- --bundles app
```
