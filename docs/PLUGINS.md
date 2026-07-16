# Plugins do Mykdown

O Mykdown possui plugins oficiais empacotados e plugins locais de preview.
Mermaid, Flowchart e o Pacote de temas são oficiais e podem ser ativados nas
preferências.

## Pacote oficial de temas

O Pacote de temas adiciona **Nord**, **Dracula** e **Coffee** ao seletor em
**Preferências → Aparência → Tema**. Ele pode ser desligado separadamente na
seção **Plugins oficiais**.

Os temas são declarativos: cada um fornece somente uma paleta de tokens visuais
predefinidos pelo Mykdown. Eles não executam JavaScript e não recebem acesso ao
DOM ou ao filesystem.

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
