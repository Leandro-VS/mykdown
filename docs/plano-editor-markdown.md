# Plano: Editor de Markdown Minimalista para macOS

O **Mykdown** é um editor de Markdown desktop, elegante como o Inkdrop, mas sem vault, sem importação e sem local fixo de notas: você abre qualquer pasta do seu Mac (como no VS Code) e ele lista apenas os arquivos `.md`, ou abre um arquivo avulso direto. O nome representa “my Markdown”: um editor pessoal para o uso diário.

---

## 1. Requisitos

**Funcionais (versão oficial 1.0)**

- Abrir uma pasta qualquer via diálogo nativo do macOS e listar, em uma sidebar, somente arquivos `.md` / `.markdown` (recursivo, preservando a hierarquia de subpastas que contêm markdown).
- Abrir um arquivo `.md` avulso, sem pasta, direto no editor.
- Editar com syntax highlighting de markdown.
- Três modos de visualização com toggle na toolbar: **só editor**, **lado a lado**, **só preview**.
- Salvar com `Cmd+S`, indicador visual de "não salvo" (dot no título, como apps nativos de Mac).
- Lista de pastas/arquivos recentes na tela inicial.
- Núcleo de extensões com um registro de plugins interno, para que editor, preview e comandos possam ganhar recursos sem acoplá-los ao app principal.
- Criar, renomear e excluir arquivos Markdown pela sidebar, sempre com confirmação nas operações destrutivas.
- Detectar mudanças externas no filesystem e impedir sobrescrita silenciosa de conflitos.
- Busca rápida de arquivo por nome com `Cmd+P`.
- Scroll sincronizado no modo dividido, temas claro/escuro e exportação para HTML/PDF.
- Integração completa com o macOS: Finder, Dock, associação de arquivos e instância única.

**Não funcionais**

- App leve (abrir em < 1s, binário pequeno), visual polido e coeso, atalhos de teclado nativos de macOS.
- Nenhum banco de dados, nenhum índice, nenhum estado escondido: o filesystem é a fonte da verdade. Fechar e abrir o app não pode "perder" nada além de preferências de UI.

**Plugins planejados**

- O primeiro plugin oficial será **Mermaid**, renderizando no preview os blocos cercados identificados com a linguagem `mermaid`.
- A versão 1.0 incluirá plugins oficiais compilados junto com o Mykdown e plugins locais de terceiros, ambos ativáveis nas preferências.
- Plugins locais usarão manifesto e API versionada. Eles não receberão acesso direto às APIs do Tauri ou ao filesystem; toda capacidade deverá ser concedida pelo host.
- Pontos de extensão da versão oficial: renderizadores de blocos Markdown, extensões do CodeMirror, comandos/atalhos e temas.

**Fora de escopo por enquanto**: sync, tags, busca full-text, outros formatos de arquivo e marketplace online de plugins.

---

## 2. Stack recomendada: Tauri 2 + React + TypeScript + CodeMirror 6

### Por que Tauri e não Electron ou Swift

| Critério | Tauri 2 | Electron | Swift/SwiftUI |
|---|---|---|---|
| Tamanho do app | ~8–15 MB | ~150–250 MB | ~5 MB |
| RAM em uso | Baixa (WKWebView nativo) | Alta (Chromium embutido) | Mínima |
| Ecossistema de editor/preview md | Excelente (é web) | Excelente | Fraco (teria que construir muito na mão) |
| Curva para você | Rust pontual e isolado | Zero novidade | Swift do zero |
| Estética "Inkdrop" | Total controle via CSS | Total controle | Difícil replicar |

O Inkdrop em si é Electron, mas o que dá a ele a cara elegante é o CSS e a tipografia — nada que dependa do Electron. O Tauri entrega o mesmo controle visual usando a WKWebView que já existe no macOS, então o app fica com "peso" de app nativo. Os plugins oficiais `dialog` e `fs` serão chamados do TypeScript; commands Rust pequenos e testáveis serão usados desde o início onde aumentarem a confiabilidade, como gravação atômica, metadados e operações críticas do filesystem.

Trade-off honesto: o debugging do Tauri é um pouco menos maduro que o do Electron, e se um dia você quiser algo muito exótico de sistema, escreverá um command em Rust. Para este escopo, é o custo certo a pagar pela leveza.

### Bibliotecas do frontend

- **CodeMirror 6** (`@codemirror/lang-markdown`, `@codemirror/view`, `@lezer/highlight`) — editor. É o mesmo motor de editores modernos; leve, extensível, com highlighting de markdown de fábrica.
- **unified / remark / rehype** (`remark-parse`, `remark-gfm`, `remark-rehype`, `rehype-sanitize`, `rehype-react`) — pipeline do preview, com suporte a tabelas, checklists e strikethrough do GFM. O `rehype-sanitize` evita que HTML embutido num `.md` execute algo no seu app.
- **Shiki** ou `rehype-highlight` — syntax highlighting dos blocos de código no preview (o Inkdrop caprichar nisso é metade da elegância dele).
- **Zustand** — estado global mínimo (pasta aberta, árvore de arquivos, arquivo ativo, modo de visualização, dirty flag). Redux seria exagero.
- **CSS puro com custom properties** (ou Tailwind, se preferir) — para um app deste tamanho, tokens em CSS variables dão controle total do tema.

---

## 3. Arquitetura

```
┌────────────────────────────────────────────────────┐
│ Janela Tauri (WKWebView)                           │
│                                                    │
│  React (TypeScript)                                │
│  ┌──────────┐ ┌──────────────┐ ┌────────────────┐  │
│  │ Sidebar  │ │ EditorPane   │ │ PreviewPane    │  │
│  │ (árvore  │ │ (CodeMirror6)│ │ (remark→React) │  │
│  │  de .md) │ └──────┬───────┘ └───────▲────────┘  │
│  └────▲─────┘        │ conteúdo (debounce ~150ms)  │
│       │              └─────────────────┘           │
│  Zustand store: { rootDir, tree, activeFile,       │
│                   content, dirty, viewMode }       │
└───────┬────────────────────────────────────────────┘
        │ @tauri-apps/plugin-dialog / plugin-fs
        ▼
  Núcleo Rust do Tauri + commands de filesystem seguros
        ▼
  Filesystem do macOS
```

**Fluxo "abrir pasta"**: botão/`Cmd+O` → `open({ directory: true })` → `readDir` recursivo → filtra extensões `.md`/`.markdown` → monta árvore podando subpastas sem nenhum markdown → renderiza sidebar. Para pastas gigantes (ex.: um monorepo), ignore `node_modules`, `.git`, `dist`, `target` na varredura — resolve 99% dos casos de lentidão.

**Fluxo "editar"**: clique no arquivo → `readTextFile` → carrega no CodeMirror → cada mudança marca `dirty` e, com debounce, re-renderiza o preview → `Cmd+S` → `writeTextFile` → limpa `dirty`.

**Segurança do Tauri**: o escopo do plugin `fs` é configurado dinamicamente para a pasta que o usuário escolheu no diálogo (o Tauri faz isso automaticamente para paths vindos do `dialog`), então o app nunca tem acesso amplo ao disco. De brinde, isso conversa bem com o sandboxing do macOS se um dia você quiser distribuir.

**Decisão explícita — arquivo avulso vs. pasta**: são dois modos do mesmo estado. `rootDir = null` significa modo avulso (sidebar colapsada ou escondida); `rootDir` preenchido significa modo pasta. Nada de conceitos separados de "workspace".

---

## 4. Direção de design (a parte "Inkdrop")

A elegância do Inkdrop vem de três coisas: tema escuro bem calibrado (não preto puro), tipografia caprichada com fonte mono bonita no editor, e um preview que parece uma página tipografada, não um dump de HTML. O plano é seguir essa filosofia sem copiá-lo.

**Tokens sugeridos (tema escuro padrão)**

```css
--bg-app:      #22262e;  /* fundo geral, grafite azulado */
--bg-sidebar:  #1b1f26;  /* um passo mais escuro */
--bg-editor:   #22262e;
--bg-preview:  #262b33;  /* sutilmente distinto do editor */
--text:        #d4d8de;
--text-dim:    #7d8590;  /* nomes de pasta, metadados */
--accent:      #6fb3a0;  /* verde-jade discreto p/ seleção, links, cursor */
--border:      #2e343d;  /* divisores de 1px, quase invisíveis */
```

Acento verde-jade em vez do roxo/azul do Inkdrop: mantém a mesma temperatura calma, mas com identidade própria.

**Tipografia**: editor em **JetBrains Mono** ou **iA Writer Mono** (13–14px, line-height 1.7 — respiro é o que separa editor bonito de editor apertado). Preview em **Inter** para corpo com headings em peso 600, tamanho de leitura ~16px, largura máxima de ~68ch centralizada. UI (sidebar, toolbar) em Inter 12–13px.

**Elemento assinatura**: o **toggle de modo de visualização** como um segmented control minimalista no canto da toolbar — três ícones (`≡`, `◫`, `¶`), com transição suave de largura dos panes ao alternar. É o coração da feature que você pediu, então merece ser o detalhe mais bem acabado da UI. Atalhos: `Cmd+1` editor, `Cmd+2` split, `Cmd+3` preview.

**Detalhes que fazem diferença**: titlebar transparente/overlay do Tauri para a sidebar subir até o topo (cara de app nativo, estilo `hiddenTitle` + `trafficLightPosition` ajustado); scrollbars finas customizadas; estado vazio da tela inicial com duas ações claras ("Abrir pasta" / "Abrir arquivo") e a lista de recentes — um empty state que convida à ação, sem ilustração genérica.

---

## 5. Construção da versão oficial

Não haverá uma linha de produto “MVP”. As etapas abaixo são incrementos internos da mesma versão `1.0.0`; nenhuma delas será tratada como aplicativo final até cumprir todos os critérios de produção.

### Etapa 0 — Fundação

Pré-requisitos no Mac: Xcode Command Line Tools, Rust via rustup, Node 20+.

```bash
xcode-select --install          # se ainda não tiver
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

npm create tauri-app@latest mykdown -- --template react-ts
cd mykdown
npm install @codemirror/state @codemirror/view @codemirror/lang-markdown \
  @codemirror/commands @lezer/highlight \
  unified remark-parse remark-gfm remark-rehype rehype-sanitize rehype-react \
  zustand
npm install @tauri-apps/plugin-dialog @tauri-apps/plugin-fs
npm run tauri dev               # janela abre → bootstrap ok
```

Critério de pronto: janela abre com hot reload funcionando.

### Etapa 1 — Núcleo de edição

1. Layout base: sidebar + área principal + toolbar, com os tokens de design aplicados.
2. Abrir arquivo avulso: diálogo → `readTextFile` → CodeMirror renderizando com highlight de markdown.
3. Salvar: `Cmd+S`, dirty flag, aviso ao fechar com mudanças não salvas.
4. Preview: pipeline remark/rehype com debounce, e o toggle dos 3 modos.
5. Abrir pasta: varredura recursiva filtrada, árvore na sidebar, troca de arquivo (com guarda de dirty).

Critério de pronto: o núcleo de edição está confiável, testado e pronto para receber as demais capacidades da versão 1.0.

### Etapa 2 — Experiência diária completa

Recentes persistidos (`tauri-plugin-store`); criar/renomear/deletar `.md` pela sidebar; file watching para refletir mudanças externas na árvore e avisar se o arquivo aberto mudou no disco; scroll sincronizado entre editor e preview no modo split; tema claro + toggle.

### Etapa 3 — Plugins, integração e distribuição

Plugin Mermaid, carregamento seguro de plugins locais, busca de arquivo por nome (`Cmd+P`, fuzzy, estilo VS Code), export para HTML/PDF, integração com Finder/Dock e `npm run tauri build` para gerar o `.app`; assinatura ad-hoc para uso pessoal.

### Etapa 4 — Release candidate e versão 1.0.0

Executar o app como editor principal, eliminar falhas encontradas, validar todos os testes e instalar o bundle definitivo em `/Applications/Mykdown.app`. Somente então criar a tag `v1.0.0`.

---

## 6. Riscos e pontos de atenção

- **Pastas enormes**: a varredura recursiva é o único ponto com risco de latência. A lista de diretórios ignorados resolve o comum; se um dia precisar, move-se a varredura para um command Rust com `ignore` crate (mesma engine do ripgrep) — melhoria isolada, não muda a arquitetura.
- **Scroll sync do split**: mapear linha do editor ↔ posição do preview é o problema clássico de editores md. A versão 1.0 começará com sincronização por blocos e fallback proporcional.
- **HTML dentro do markdown**: sempre passar pelo `rehype-sanitize`. Preview renderiza numa webview com acesso a APIs do Tauri; sanitizar não é opcional.
- **Conflito de escrita externa**: se o arquivo mudou no disco enquanto estava aberto e dirty, nunca sobrescrever silenciosamente — dialog de escolha (manter meu / recarregar). Fail-safe primeiro, como nos seus guardrails.

## 7. O que revisitar quando crescer

Se surgir vontade de busca full-text ou backlinks entre notas, aí sim entra um índice (SQLite via plugin Tauri) — mas como cache derivado do filesystem, nunca como fonte da verdade, para preservar o princípio de "qualquer pasta, zero lock-in" que motivou o projeto.
