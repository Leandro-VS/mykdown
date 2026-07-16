# Plugins do Mykdown

O Mykdown 1.0 possui plugins oficiais empacotados e plugins locais de preview.
Mermaid e Flowchart são oficiais e podem ser ativados nas preferências.

## Plugin local API 1

Cada plugin fica em uma pasta própria dentro do diretório aberto pelo botão
**Preferências → Plugins locais → Abrir pasta**. A pasta contém:

```text
meu-plugin/
├── mykdown-plugin.json
└── plugin.js
```

Manifesto mínimo:

```json
{
  "id": "meu-plugin",
  "name": "Meu Plugin",
  "version": "1.0.0",
  "apiVersion": 1,
  "language": "alerta",
  "entry": "plugin.js",
  "capabilities": ["preview.codeBlock"]
}
```

O `plugin.js` define apenas uma função de renderização:

```js
self.mykdownPlugin = {
  render(code) {
    return `<strong>${code}</strong>`;
  },
};
```

Ela será usada em blocos ` ```alerta `. O HTML retornado é sanitizado antes de
entrar no preview.

## Isolamento

- o código roda em um Web Worker separado;
- não existe acesso ao DOM, Tauri ou filesystem;
- conexões externas são bloqueadas pela CSP do aplicativo;
- cada renderização tem limite de um segundo;
- HTML retornado é sanitizado;
- um plugin que falha é interrompido sem derrubar o editor;
- o modo seguro desativa todos os plugins locais.

O exemplo completo está em `examples/plugins/callout-example`.
