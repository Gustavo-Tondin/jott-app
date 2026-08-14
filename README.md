# Jott

Tarefas e notas que moram no seu computador, em arquivos que você consegue
abrir sem o app.

Jott é um aplicativo local-first: nada essencial depende de internet ou de
criar conta. Suas tarefas ficam em arquivos Markdown comuns, dentro de uma
pasta que você escolhe — dá pra ler, editar ou versionar com qualquer outra
ferramenta, inclusive o Obsidian. Se um dia você parar de usar o Jott, seus
dados continuam lá, legíveis.

Roda em Linux e Android a partir do mesmo código, com interface nativa
(não é um site empacotado).

> **Status:** em desenvolvimento inicial. Ainda não há versão utilizável.

## Princípios

- **Local first** — funciona inteiro sem internet.
- **Os dados são seus** — formato aberto, acessível fora do app, sem prisão.
- **Simples primeiro** — o que é avançado é opcional e não polui o básico.
- **O que é local é gratuito, pra sempre.** Serviços online (sync, backup)
  são pagos e opcionais, mas nenhum recurso local será removido pra empurrar
  assinatura.
- **Privacidade** — criptografia ponta a ponta nos serviços online.

## Como suas coisas ficam no disco

Cada pasta é um espaço com **uma função só**: ou é uma lista de tarefas, ou
é um bloco de notas. As três que o app cria carregam o prefixo `jott.` — são
dele, e dizer isso no nome deixa os nomes bonitos livres pra você.

```
MeuCaderno/
├── jott.tasks/          ← a lista que o app cria
│   ├── Tasks.md
│   └── Completed.md
├── jott.notes/          ← as notas soltas
├── Compras/             ← uma lista sua
│   ├── Compras.md
│   └── Completed.md
└── Trabalho/            ← um grupo, reunindo espaços
    └── Clientes/
```

E dentro de cada arquivo, checklist Markdown comum:

```markdown
- [ ] Comprar leite
- [x] Pagar internet
```

## O que vem por aí

O desenvolvimento é sequencial: cada etapa só começa quando a anterior está
funcionando de verdade.

### Versão 1 — tarefas e notas

- [x] Base do aplicativo rodando no Linux
- [x] Criar, editar e concluir tarefas, com tudo salvo em arquivos `.md`
- [x] Listas e blocos de notas próprios, que podem ser reunidos em grupos
- [x] Visão de **Hoje** e da **Semana**: você escolhe o que puxar pra cada
      período, em vez de encarar a lista inteira
- [x] Virada do dia e da semana configurável — inclusive o horário, pra quem
      monta o dia seguinte antes de dormir ou decide de manhã cedo
- [x] Tarefas concluídas separadas, com desfazer que devolve o item pra
      lista de origem
- [x] Detecta alterações feitas por fora (útil com Syncthing, Drive etc.)
- [x] Excluir nunca destrói: tudo passa por uma lixeira dentro do caderno
- [ ] Notas: editor de Markdown e organização em pastas, em construção
- [ ] Interface finalizada, com tema claro e escuro
- [ ] Versão Android, com layout adaptado pra toque
- [ ] Pacotes prontos: AppImage/Flatpak no Linux, APK no Android

### Depois da v1

- **Recursos opcionais, sempre locais e gratuitos** — tabela e kanban como
  outras formas de ver a mesma lista, ligações entre notas, importador de
  outros apps, tradução da interface
- **Serviços online opcionais (pagos)** — sincronização entre dispositivos
  com criptografia ponta a ponta, backup automático com histórico de
  versões, colaboração e publicação de notas

Sincronizar entre dispositivos **hoje já é possível de graça**, apontando
Syncthing, Drive ou similar pra pasta do caderno. O serviço pago é
conveniência, não permissão.

## Desenvolvimento

Requisitos: Rust (stable, via `rustup`), Node.js com npm, e as bibliotecas
de sistema `webkit2gtk-4.1`, `gtk3` e `libsoup3`.

```bash
npm install          # dependências do frontend
npm run tauri dev    # roda o app
cargo test           # testes da lógica de negócio
npm test             # testes do frontend
npm run package      # gera AppImage / deb
```

### Instalar

**Arch e derivados** — o jeito nativo, que põe o app no menu de aplicativos:

```bash
cd packaging && makepkg -sid    # -d se o Rust/Node vier do rustup ou do nvm
```

**Qualquer distribuição** — o AppImage sai em
`target/release/bundle/appimage/` depois do `npm run package`.

> **Nota do AppImage:** o empacotamento usa `NO_STRIP=1` (é o que o script
> `package` faz). O `strip` que vem dentro do `linuxdeploy` é antigo demais
> para a seção ELF `.relr.dyn` que as distribuições atuais usam, e sem isso o
> bundle falha em toda biblioteca do sistema.

Estrutura:

| Pasta        | O que é                                                        |
| ------------ | -------------------------------------------------------------- |
| `core/`      | Crate Rust puro com toda a lógica de negócio. Não depende do Tauri. |
| `src-tauri/` | Casca fina que expõe o `core` pro frontend via `invoke()`.      |
| `src/`       | Frontend em Svelte, com CSS puro.                               |
