# Smoke test do Mykdown 1.0

Execute este checklist no bundle instalado em `/Applications/Mykdown.app` antes
de cada release.

## Arquivos e sessão

- abrir arquivo e pasta pelos diálogos;
- abrir `.md` e `.markdown` pelo Finder com o app fechado e aberto;
- criar, renomear e excluir arquivos pela sidebar;
- confirmar que uma pasta não vazia não é excluída;
- editar, salvar, reiniciar e restaurar a sessão;
- alterar o mesmo arquivo externamente e verificar o aviso de conflito;
- fechar e encerrar com conteúdo dirty usando salvar, descartar e cancelar.

## Editor e preview

- testar editor, split e preview com `Cmd+1/2/3`;
- ajustar a margem do preview e reiniciar;
- buscar arquivo com `Cmd+P` usando nome incompleto;
- usar busca e substituição do CodeMirror;
- verificar scroll sincronizado nos dois sentidos;
- abrir link relativo para outro Markdown;
- carregar PNG, JPEG, GIF e WebP relativos;
- renderizar Mermaid e Flowchart válidos e inválidos;
- copiar código e fonte de diagrama.

## Preferências e exportação

- testar tema do sistema, claro e escuro;
- mudar fonte, altura de linha, wrap e autosave;
- desativar e reativar Mermaid e Flowchart;
- exportar HTML e abrir o resultado offline;
- imprimir ou salvar o preview como PDF.

## Plugins locais

- copiar `examples/plugins/callout-example` para a pasta de plugins;
- recarregar, ativar e renderizar um bloco `callout`;
- confirmar que modo seguro impede a execução;
- testar um plugin que lança erro e outro que entra em loop;
- remover o plugin pelas preferências.

## Instalação

- executar `npm run release:check`;
- fechar o Mykdown e executar `npm run install:local`;
- confirmar que preferências e recentes permanecem;
- confirmar que a versão exibida corresponde ao release atual.
