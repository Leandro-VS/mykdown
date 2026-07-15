# Plano de implementação do Marli

## 1. Objetivo prático

Construir um editor Markdown confiável para uso diário em um único Mac Apple Silicon. O aplicativo deve ser rápido, funcionar sem internet, abrir arquivos reais do filesystem e ser simples de compilar, instalar e atualizar localmente.

O produto inicial não será preparado para App Store nem para distribuição pública. Isso elimina contas de desenvolvedor, notarização, atualizador remoto, telemetria e compatibilidade multiplataforma. Essas decisões podem ser revisitadas sem mudar o núcleo do aplicativo.

## 2. Decisões para uso pessoal

### Alvo e distribuição

- Plataforma: somente macOS `arm64`.
- Formato: `Marli.app`, sem DMG no fluxo normal.
- Instalação: build local e cópia do bundle para `/Applications`.
- Assinatura: ad-hoc com a identidade `-`. É suficiente para um app compilado e instalado na própria máquina; notarização só é necessária se o app for distribuído para outras pessoas.
- Atualização: manual e reproduzível. Fazer `git pull`, rodar testes, gerar o bundle e substituir o app instalado.
- Versão: SemVer no `tauri.conf.json`, com tags Git como `v0.1.0`.

### Dados e preferências

- Arquivos Markdown continuam em suas pastas originais.
- Nenhum conteúdo de documento será copiado para armazenamento interno.
- O armazenamento local conterá apenas preferências de UI, lista de recentes, último workspace, dimensões da janela e escopos de acesso autorizados.
- Não haverá banco de dados, conta, sync ou telemetria.

### Escopo de filesystem

O diálogo do Tauri libera acesso ao caminho selecionado somente durante a execução atual. Para reabrir itens recentes depois de reiniciar o app, o projeto deve usar o plugin oficial de escopo persistido e restaurar apenas os caminhos escolhidos explicitamente pelo usuário.

Não habilitar acesso irrestrito a `$HOME`. As permissões devem ser limitadas aos comandos necessários: listar, ler, consultar metadados e escrever arquivos selecionados.

## 3. Arquitetura definida

```text
React / TypeScript
  AppShell
  ├── WelcomeScreen (abrir pasta, abrir arquivo, recentes)
  ├── Sidebar (árvore Markdown)
  ├── Toolbar (arquivo ativo, dirty, modo de visualização)
  ├── EditorPane (CodeMirror 6)
  └── PreviewPane (Markdown sanitizado)
        │
        ├── Zustand: estado transitório da sessão
        ├── Store: preferências e recentes
        └── Serviços Tauri: dialog, fs, persisted-scope e window-state
                         │
                         └── Filesystem do macOS
```

### Camadas do frontend

- `components/`: UI sem acesso direto ao Tauri.
- `features/editor/`: CodeMirror, atalhos, dirty state e seleção.
- `features/files/`: árvore, arquivo ativo, proteção contra troca com alterações.
- `features/preview/`: renderização, sanitização e estilos tipográficos.
- `services/`: adaptadores pequenos para as APIs Tauri.
- `store/`: estado Zustand e seletores.
- `types/`: tipos de arquivo, árvore, recente e preferências.

Essa divisão permite testar a maior parte da aplicação no navegador sem depender de uma janela Tauri.

### Dependências previstas

- Base: Tauri 2, React, TypeScript e Vite.
- Editor: `@codemirror/state`, `view`, `commands` e `lang-markdown`.
- Preview: `react-markdown`, `remark-gfm`, `rehype-sanitize` e `rehype-highlight` com linguagens selecionadas.
- Estado: Zustand.
- Tauri: plugins `dialog`, `fs`, `store`, `persisted-scope`, `window-state` e `single-instance`.
- Qualidade: ESLint, Prettier, Vitest, Testing Library e `cargo test`.

Evitar uma biblioteca de componentes completa. CSS custom properties e componentes próprios são suficientes e mantêm o bundle pequeno.

## 4. Modelo de estado

```ts
type WorkspaceState = {
  rootDir: string | null;
  tree: MarkdownNode[];
  activePath: string | null;
  savedContent: string;
  draftContent: string;
  diskModifiedAt: number | null;
  viewMode: "editor" | "split" | "preview";
};
```

O estado `dirty` deve ser derivado de `draftContent !== savedContent`, e não armazenado separadamente. Isso evita inconsistência. O título da janela recebe um marcador quando houver alterações.

Antes de trocar de arquivo, fechar a janela ou recarregar conteúdo alterado externamente, mostrar as opções salvar, descartar ou cancelar.

## 5. Estratégia de gravação segura

Salvar é a operação de maior risco do aplicativo. O fluxo deve:

1. Confirmar que o arquivo no disco ainda possui o `modifiedAt` conhecido.
2. Se houve mudança externa e o editor também está dirty, interromper e pedir uma escolha.
3. Gravar o novo conteúdo em arquivo temporário na mesma pasta.
4. Sincronizar e renomear o temporário sobre o original, preservando o máximo possível das permissões existentes.
5. Atualizar `savedContent` e os metadados somente após sucesso.

Para garantir a troca atômica, essa operação pode ser um command Rust pequeno. É uma exceção deliberada à ideia inicial de “zero Rust”, pois protege documentos reais e é fácil de testar isoladamente.

Não implementar autosave silencioso no MVP. `Cmd+S` é previsível; autosave pode virar uma preferência depois.

## 6. Etapas de implementação

### Etapa 0 — Repositório e fundação

Entregas:

- Repositório Git local na branch `main`.
- `README.md`, `.gitignore` e documentação do plano.
- Scaffold Tauri 2 + React + TypeScript no diretório atual.
- Scripts `dev`, `build`, `test`, `lint`, `format:check` e `install:local`.
- Identificador do bundle, provisoriamente `dev.leandro.marli`.
- Configuração inicial de assinatura ad-hoc e target macOS.

Critério de pronto: janela vazia abre com hot reload; lint, testes e build passam; primeiro commit está criado.

### Etapa 1 — Shell visual e estado vazio

Entregas:

- Janela com titlebar overlay, traffic lights posicionados e tamanho mínimo adequado.
- Tokens do tema escuro e tipografia com fallback para fontes já instaladas no macOS; não depender de fonte baixada em runtime.
- Sidebar, toolbar e painéis responsivos.
- Tela inicial com “Abrir pasta”, “Abrir arquivo” e recentes.
- Persistência da posição/tamanho da janela e do modo de visualização.

Critério de pronto: o layout não pisca ao iniciar, funciona em diferentes tamanhos de janela e toda ação pode ser alcançada pelo teclado.

### Etapa 2 — Arquivo avulso e editor

Entregas:

- Diálogo nativo filtrando `.md` e `.markdown`.
- Leitura de arquivo avulso e integração do CodeMirror.
- Highlight de Markdown, undo/redo e seleção nativa.
- `Cmd+O`, `Cmd+S`, `Cmd+Shift+O` para pasta e marcador de alteração.
- Proteção ao trocar/fechar com conteúdo não salvo.
- Gravação atômica e tratamento visível de erros.

Critério de pronto: editar e salvar repetidamente nunca corrompe o arquivo; cancelar um diálogo não altera o estado.

### Etapa 3 — Preview e modos de visualização

Entregas:

- Preview GFM sanitizado, com tabelas, listas de tarefas e blocos de código.
- Links externos abertos no navegador padrão, nunca dentro da webview principal.
- Imagens locais resolvidas de maneira segura em relação à pasta do documento.
- Toggle editor/split/preview e atalhos `Cmd+1`, `Cmd+2`, `Cmd+3`.
- Atualização do preview com debounce curto, sem modificar o conteúdo do editor.

Critério de pronto: Markdown não confiável não executa scripts nem invoca comandos Tauri; documentos longos continuam fluidos.

### Etapa 4 — Pastas e árvore de arquivos

Entregas:

- Abertura de pasta pelo diálogo nativo.
- Varredura recursiva apenas de `.md`/`.markdown`.
- Ignorar `.git`, `node_modules`, `dist`, `target`, pastas ocultas e symlinks de diretório por padrão.
- Podar pastas sem Markdown, ordenar pastas antes de arquivos e manter hierarquia.
- Estado de loading e cancelamento/obsolescência de scans anteriores.
- Guarda de alterações ao selecionar outro arquivo.

Começar com o plugin `fs`. Se a medição em pastas reais mostrar atraso perceptível, mover somente a varredura para Rust usando a crate `ignore`.

Critério de pronto: abrir uma pasta grande não congela a interface, e trocar entre documentos não perde rascunhos.

### Etapa 5 — Sessão diária e integração com macOS

Entregas:

- Recentes persistidos com remoção automática de caminhos inexistentes.
- Escopos persistidos somente para arquivos/pastas escolhidos.
- Plugin single-instance: abrir um segundo Marli direciona a solicitação à janela existente.
- Associação opcional de `.md`/`.markdown` no bundle.
- Tratamento dos dois cenários do Finder: app fechado e app já aberto.
- Restaurar o último workspace apenas se ainda existir e estiver autorizado.
- File watching para detectar criação, remoção e alteração externa.
- Política de conflito: nunca sobrescrever silenciosamente um arquivo alterado fora do Marli.

Critério de pronto: o app pode ser colocado no Dock, iniciado pelo Finder e usado por vários dias sem estado quebrado.

### Etapa 6 — Empacotamento e instalação local

Entregas:

- Ícone `.icns` e metadados finais do bundle.
- Versão única em `tauri.conf.json`.
- Build release com `npm run tauri build -- --bundles app`.
- Script de instalação que encerra uma instância aberta, preserva preferências, copia com segurança o novo `Marli.app` e abre novamente somente quando solicitado.
- Checklist de smoke test no app instalado, não apenas em modo dev.

Critério de pronto: `npm run install:local` produz a mesma instalação em `/Applications/Marli.app` a partir de um checkout limpo.

### Etapa 7 — Estabilização para uso diário

Executar o Marli como editor principal por pelo menos uma semana e registrar problemas reais. Antes de adicionar features, corrigir:

- perda de foco e atalhos;
- conflito com edições externas;
- arquivos grandes;
- imagens e links relativos;
- recuperação após arquivo movido ou excluído;
- reinício depois de atualização.

Só depois considerar criação/renomeação/exclusão na sidebar, busca por nome, tema claro, scroll sync ou exportação.

## 7. Testes mínimos obrigatórios

### Unitários

- filtro, poda e ordenação da árvore;
- normalização de extensões;
- cálculo de dirty state;
- recentes e caminhos inexistentes;
- política de conflito externo;
- renderização sanitizada de Markdown malicioso.

### Integração

- abrir, editar, salvar e reler um arquivo temporário;
- falha de escrita sem perder o draft;
- arquivo alterado externamente enquanto dirty;
- scan de pasta com diretórios ignorados e symlinks;
- restauração de escopo e sessão.

### Smoke test manual do bundle

- iniciar pelo Dock;
- abrir arquivo e pasta pelos diálogos;
- abrir `.md` pelo Finder;
- `Cmd+S`, `Cmd+1/2/3`, fechar com dirty;
- reiniciar e usar recentes;
- substituir a versão instalada e confirmar que preferências permanecem.

## 8. Fluxo Git pessoal

- Branch principal: `main`, sempre compilável.
- Commits pequenos por entrega, por exemplo `feat: add markdown file picker`.
- Branches curtas apenas para mudanças arriscadas; pull request não é obrigatório num projeto individual.
- Tag em cada versão instalada: `v0.1.0`, `v0.2.0` etc.
- Nunca versionar `node_modules`, `target`, builds, logs, `.env` ou certificados.
- O lockfile do npm e `Cargo.lock` devem ser versionados para builds reproduzíveis.
- Antes de instalar uma versão: `npm run lint`, `npm test`, `cargo test` e build release.

O repositório remoto pode ser criado posteriormente como privado no GitHub. Isso exige definir o nome remoto e confirmar a conta; o repositório Git local não depende dessa etapa.

## 9. Ordem dos primeiros commits

1. `docs: define product and implementation plan`
2. `chore: bootstrap tauri react application`
3. `feat: add app shell and welcome screen`
4. `feat: open and safely save markdown files`
5. `feat: add sanitized markdown preview`
6. `feat: browse markdown folders`
7. `feat: persist sessions and integrate with macos`
8. `chore: add local release installation`

## 10. Definição de versão 1.0 pessoal

A versão `1.0.0` estará pronta quando:

- abrir arquivo, pasta e itens pelo Finder for confiável;
- editar, visualizar e salvar não causar perda silenciosa;
- conflitos externos forem detectados;
- recentes e estado de janela sobreviverem a reinícios;
- o bundle instalado iniciar rapidamente e funcionar offline;
- testes e smoke checklist passarem;
- um checkout limpo conseguir recriar `/Applications/Marli.app` com um único comando documentado.

