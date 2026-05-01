 --------------------------------------------------------------
    ___     ___    _  _____ _____   ____   ___   ____ 
   / \ \   / / \  | |/ /_ _|_   _| |  _ \ / _ \ / ___|
  / _ \ \ / / _ \ | ' / | |  | |   | | | | | | | |    
 / ___ \ V / ___ \| . \ | |  | |   | |_| | |_| | |___ 
/_/   \_\_/_/   \_\_|\_\___| |_|   |____/ \___/ \____|
                                                      
    _    ____ _____ _   _ _____ 
   / \  / ___| ____| \ | |_   _|
  / _ \| |  _|  _| |  \| | | |  
 / ___ \ |_| | |___| |\  | | |  
/_/   \_\____|_____|_| \_| |_|   

--------------------------------------------------------------

Extensão multiplataforma para capturar documentações web, converter o conteúdo para Markdown e organizar tudo em `docs/<tecnologia>/` para uso com agentes de código.

O projeto foi desenvolvido como entrega prática do **Módulo 04 do curso de Engenharia de Software com foco em Inteligência Artificial**, a partir da proposta de construção de um miniprojeto com IA generativa. **“Laboratório Introdutório: Construindo um Miniprojeto com Inteligência Artificial Generativa”**, de Leon Sólon da Silva, publicado pelo AKCIT/Cegraf UFG em 2026.

## Objetivo

O objetivo do Docs Agent é reduzir o trabalho manual de preparar documentação técnica para agentes como Codex, Claude Code, Cursor e Gemini CLI.

Em vez de copiar páginas manualmente, o usuário informa uma URL de documentação e a extensão:

- procura fontes já otimizadas para LLMs;
- descobre páginas por `llms.txt`, `llms-full.txt`, Markdown nativo, sitemap e crawl escopado;
- converte HTML para Markdown quando necessário;
- organiza os arquivos em uma estrutura local previsível;
- gera um `manifest.json` com rastreabilidade da captura.

## Contexto Acadêmico

Este repositório representa um miniprojeto aplicado do curso de Engenharia de Software com foco em IA. A proposta segue a linha do módulo de construir uma solução útil com Inteligência Artificial Generativa, integrando engenharia de software, automação, agentes e distribuição de ferramenta.

O projeto exercita conceitos como:

- levantamento de problema e solução;
- automação de fluxo técnico real;
- empacotamento de ferramenta via npm;
- integração com múltiplos clientes de IA;
- uso de MCP para expor capacidades reutilizáveis;
- documentação e validação de software.

## Funcionalidades

- CLI executável via `npx`.
- Instalador estilo `npx skills add`, por meio do comando `add`.
- Plugin para Codex.
- Skill repo-scoped para Codex CLI em `.agents/skills/docs`.
- Skill e comando para Claude Code em `.claude`.
- Comando e MCP config para Cursor.
- Extensão para Gemini CLI.
- Servidor MCP com tool `capture_docs`.
- Priorização de `llms-full.txt`, `llms.txt`, `.md` e `.mdx`.
- Fallback para `sitemap.xml`, `robots.txt`, navegação/sidebar e crawl escopado.
- Fallback opcional com Playwright para documentações SPA.
- Manifest com páginas capturadas, falhas, hashes e fonte usada.

## Como Funciona

O fluxo de captura segue esta ordem:

1. Verifica `llms-full.txt` no domínio e no path base.
2. Verifica `llms.txt` e extrai links Markdown.
3. Detecta links nativos `.md` e `.mdx`.
4. Procura `sitemap.xml`, `sitemap_index.xml` e sitemaps declarados em `robots.txt`.
5. Faz crawl escopado ao domínio/path da documentação.
6. Converte HTML para Markdown quando não existe fonte Markdown nativa.
7. Salva o conteúdo em `docs/<tecnologia>/`.

Exemplo de saída:

```text
docs/react/
├── index.md
├── manifest.json
└── reference/
    └── hooks/
        └── use-state.md
```

## Instalação via npx

Depois que o pacote estiver publicado no npm, instale em todos os clientes suportados:

```bash
npx -y @avakit/docs-agent add
```

O comando `add` foi criado para oferecer uma experiência parecida com o fluxo do ecossistema skills.sh:

```bash
npx skills add <skill-name>
```

Neste projeto, o equivalente é:

```bash
npx -y @avakit/docs-agent add
```

Instalar apenas clientes específicos:

```bash
npx -y @avakit/docs-agent add --clients codex
npx -y @avakit/docs-agent add --clients claude
npx -y @avakit/docs-agent add --clients cursor,gemini
```

Também existe o comando detalhado:

```bash
npx -y @avakit/docs-agent install --clients codex,claude,cursor,gemini
```

## O Que o Instalador Cria

Para Codex:

```text
~/.codex/plugins/docs-agent/
~/.agents/plugins/marketplace.json
```

Para Codex CLI dentro deste repositório:

```text
.agents/skills/docs/SKILL.md
```

Para Claude Code:

```text
~/.claude/skills/docs/SKILL.md
~/.claude/commands/docs.md
```

Para Cursor:

```text
~/.cursor/commands/docs.md
~/.cursor/mcp.json
```

Para Gemini CLI:

```text
~/.gemini/extensions/docs-agent/
```

Depois da instalação, reinicie o cliente para que ele detecte novas skills, comandos, plugins e servidores MCP.

## Uso Direto

Capturar uma documentação:

```bash
npx -y @avakit/docs-agent capture https://example.com/docs
```

Informar o nome da tecnologia:

```bash
npx -y @avakit/docs-agent capture https://example.com/docs --name minha-tecnologia
```

Definir limite de páginas:

```bash
npx -y @avakit/docs-agent capture https://example.com/docs --max-pages 100
```

Permitir capturas grandes:

```bash
npx -y @avakit/docs-agent capture https://example.com/docs --max-pages 1000 --force-large-crawl
```

Desativar fallback com navegador headless:

```bash
npx -y @avakit/docs-agent capture https://example.com/docs --no-headless
```

Rodar o servidor MCP:

```bash
npx -y @avakit/docs-agent mcp
```

Verificar o ambiente:

```bash
npx -y @avakit/docs-agent doctor
```

## Uso no Codex CLI

Para usar como pacote instalado:

```bash
npx -y @avakit/docs-agent add --clients codex
```

Para usar durante o desenvolvimento neste repositório, o Codex CLI consegue descobrir a skill repo-scoped em:

```text
.agents/skills/docs/SKILL.md
```

O plugin distribuível do Codex fica em:

```text
.codex-plugin/plugin.json
skills/docs/SKILL.md
.mcp.json
```

## Uso no Claude Code

O projeto inclui a estrutura `.claude`:

```text
.claude/skills/docs/SKILL.md
.claude/commands/docs.md
```

Depois de instalado, a intenção é chamar o comando `/docs` com uma URL de documentação. A skill orienta o agente a executar:

```bash
npx -y @avakit/docs-agent capture <url>
```

## Arquitetura

```text
.
├── src/
│   ├── cli.ts          # CLI principal
│   ├── capture.ts      # descoberta, crawl e escrita dos arquivos
│   ├── markdown.ts     # normalização/conversão para Markdown
│   ├── mcp.ts          # servidor MCP
│   ├── install.ts      # instalador para clientes
│   └── templates.ts    # templates de integração
├── .codex-plugin/      # manifesto do plugin Codex
├── .agents/skills/     # skill repo-scoped para Codex CLI
├── .claude/            # skill e comando para Claude Code
├── skills/             # skill empacotada no plugin Codex
├── commands/           # comandos para clientes compatíveis
└── gemini-extension.json
```

## Desenvolvimento Local

Instalar dependências:

```bash
npm install
```

Rodar validações:

```bash
npm run typecheck
npm test
npm run build
```

Testar o instalador sem alterar seu diretório home real:

```bash
node dist/cli.js add --home /tmp/docs-agent-home
```

Testar captura localmente depois do build:

```bash
node dist/cli.js capture https://example.com/docs --name exemplo
```

Verificar empacotamento npm:

```bash
npm pack --dry-run --cache /tmp/avakit-docs-agent-npm-cache
```

## Estado Atual

O pacote está estruturado para rodar como:

```bash
npx -y @avakit/docs-agent add
npx -y @avakit/docs-agent capture <url>
```

Antes de funcionar publicamente via `npx`, o pacote precisa ser publicado no npm com o nome `@avakit/docs-agent`. Enquanto não estiver publicado, use os comandos locais com `node dist/cli.js`.

## Referência do Módulo


Este projeto aplica a proposta do módulo em um caso prático: construir uma ferramenta útil para agentes de IA consumirem documentação técnica com menos atrito.
# avakit-docs-agent
