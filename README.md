```text
 █████╗ ██╗  ██╗ ██████╗██╗████████╗
██╔══██╗██║ ██╔╝██╔════╝██║╚══██╔══╝
███████║█████╔╝ ██║     ██║   ██║   
██╔══██║██╔═██╗ ██║     ██║   ██║   
██║  ██║██║  ██╗╚██████╗██║   ██║   
╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝╚═╝   ╚═╝   
CENTRO DE COMPETÊNCIA EMBRAPII EM TECNOLOGIAS IMERSIVAS
```

[![npm version](https://img.shields.io/npm/v/@akcit/docs-agent.svg)](https://www.npmjs.com/package/@akcit/docs-agent)
[![npm downloads](https://img.shields.io/npm/dm/@akcit/docs-agent.svg)](https://www.npmjs.com/package/@akcit/docs-agent)
[![license](https://img.shields.io/npm/l/@akcit/docs-agent.svg)](./LICENSE)
[![node](https://img.shields.io/node/v/@akcit/docs-agent.svg)](https://nodejs.org)
[![provenance](https://img.shields.io/badge/provenance-signed-brightgreen.svg)](https://www.npmjs.com/package/@akcit/docs-agent)

**`@akcit/docs-agent`** — captura documentações web, converte em Markdown organizado em `docs/<tecnologia>/`, **e gera automaticamente uma skill por tecnologia capturada** (formato compatível com Claude Code, Codex CLI, Cursor e Gemini CLI). O agente que rodar no projeto descobre a knowledge base e a usa como contexto na hora — sem configuração manual.

📦 Disponível no npm: **[npmjs.com/package/@akcit/docs-agent](https://www.npmjs.com/package/@akcit/docs-agent)** — assinado com [provenance attestation](https://docs.npmjs.com/generating-provenance-statements) via GitHub Actions OIDC + sigstore.

Miniprojeto do **curso de Engenharia de Software com foco em Inteligência Artificial** (AKCIT/Cegraf UFG - Universidade Federal de Goiás, 2026).

---

## Instalação

Distribuído via npm como [`@akcit/docs-agent`](https://www.npmjs.com/package/@akcit/docs-agent). Não precisa instalar — use direto via `npx`:

```bash
npx -y @akcit/docs-agent <comando>
```

Ou instale globalmente (uso recorrente):

```bash
npm install -g @akcit/docs-agent
akcit-docs <comando>
```

Requer **Node.js 20+**.

## Quickstart

```bash
# 1. Capturar uma documentação (gera docs/<tech>/ + skill auto-instalada nos 4 clients no projeto atual)
npx -y @akcit/docs-agent capture https://adk.dev

# 2. Captura + instalação global em HOME (para qualquer projeto descobrir a skill)
npx -y @akcit/docs-agent capture https://adk.dev --install
```

Após isso, abrir o projeto no Claude Code / Codex CLI / Cursor / Gemini CLI: a skill `docs-adk` está disponível e o agente sabe quando ativá-la.

### `/prompt` com framework COSTAR-A

O pacote também inclui uma skill/comando **`/prompt`** e um agente especialista em prompt engineering. Use para transformar perguntas simples em prompts mais fortes usando **COSTAR-A**, framework descrito no artigo [COSTAR-A: A prompting framework for enhancing Large Language Model performance on Point-of-View questions](./references/costar.pdf).

O COSTAR original organiza um prompt em seis blocos: **Context** (contexto da tarefa), **Objective** (o objetivo), **Style** (estilo de escrita ou raciocínio), **Tone** (tom), **Audience** (público-alvo) e **Response** (formato esperado). O COSTAR-A acrescenta o bloco **Answer**, uma diretiva explícita para o modelo produzir a resposta final. Esse último bloco é útil quando a pergunta é simples demais, ambígua ou quando o modelo tende a responder de forma incompleta, indecisa ou sem seguir o formato pedido.

Na prática, `/prompt` pega uma solicitação curta e reorganiza em uma instrução completa:

- preserva a intenção original do usuário;
- infere defaults razoáveis para contexto, audiência, estilo, tom e formato;
- adiciona restrições de saída quando elas ajudam;
- usa o bloco **Answer** para deixar claro que o modelo deve entregar o resultado final.

```bash
/prompt explique hooks do React para um dev júnior
```

Exemplo de estrutura gerada:

```text
# Context #
Você está ajudando um desenvolvedor júnior a entender React.
#############
# Objective #
Explique o que são hooks, por que existem e quando usar.
#############
# Style #
Didático, com exemplos curtos.
#############
# Tone #
Claro, direto e encorajador.
#############
# Audience #
Desenvolvedor júnior com conhecimento básico de JavaScript.
#############
# Response #
Responda em português, com tópicos e um exemplo simples de código.
#############
# Answer #
Produza a explicação final seguindo exatamente o formato solicitado.
```

### `/prompt-code` para código guiado por documentação local

Depois de capturar uma documentação, o Docs Agent também gera índices para ajudar agentes a escrever e revisar código com base nas markdowns locais:

- `api-index.md` — símbolos, imports, comandos e endpoints detectados por heurísticas leves.
- `examples-index.md` — lista dos exemplos de código encontrados e suas páginas de origem.
- `snippets.json` — blocos de código estruturados com linguagem, página, seção e conteúdo.

Use **`/prompt-code`** para transformar um pedido simples de implementação ou revisão em um prompt COSTAR-A orientado por esses arquivos. O prompt gerado força o agente de código a consultar `manifest.json`, os índices e as páginas Markdown originais antes de implementar.

```bash
/prompt-code crie um agente ADK com uma tool customizada usando as docs locais
```

O resultado esperado é um prompt que define:

- qual documentação local consultar;
- quais APIs e exemplos confirmar antes de usar;
- critérios de aceite da implementação;
- comandos de verificação, como testes, typecheck ou build;
- obrigação de citar os arquivos locais usados.

Também funciona para revisão:

```bash
/prompt-code revise este código contra as docs locais do Next.js e aponte APIs incorretas
```

Nesse modo, o prompt pede achados objetivos: API inexistente, import errado, configuração faltante, padrão desatualizado e ausência de testes.

---

## Instalação do CLI nos clientes

Instala plugin/skill/comando/MCP server para o próprio docs-agent (separado das skills auto-geradas por captura):

```bash
# Todos os 4 clientes
npx -y @akcit/docs-agent add

# Subset
npx -y @akcit/docs-agent add --clients codex,claude
npx -y @akcit/docs-agent add --clients cursor,gemini
```

Reinicie o cliente para detectar as novidades.

---

## Comandos principais

| Comando | Função |
|---|---|
| `capture <url>` | Captura docs em `docs/<tech>/`, gera SKILL.md, instala project-scoped |
| `add` | Instala o CLI docs-agent nos clientes (Codex/Claude/Cursor/Gemini) |
| `install-skill <tech>` | Instala skill de tech já capturada em HOME (ou `--local` para project-scoped) |
| `/prompt <texto>` | Melhora uma pergunta ou prompt simples usando COSTAR-A |
| `/prompt-code <texto>` | Cria prompts de implementação/revisão guiados por docs locais |
| `mcp` | Inicia o servidor MCP (stdio) com tool `capture_docs` |
| `doctor` | Verifica Node, Playwright e diretório HOME |

Para a referência completa de flags: `npx -y @akcit/docs-agent capture --help` (ou veja [ARCHITECTURE.md](./ARCHITECTURE.md#uso-direto)).

---

## Defaults importantes

- **Polite por default** — `concurrency=2`, `rate-limit-ms=750`, `max-retries=5`, jitter on. Use `--aggressive` para sites tolerantes (CDN-backed).
- **Retry automático** em HTTP 408/425/429/5xx com backoff exponencial e respeito ao header `Retry-After`.
- **SSRF guard** bloqueia loopback/RFC-1918/link-local/multicast/IPv6 ULA antes de cada `fetch`.
- **Resume automático** — re-rodar `capture` pula URLs já no manifest. `--force` recaptura tudo.

---

## Documentação técnica completa

Para detalhes de **arquitetura, segurança, todas as flags, geração de skills, e desenvolvimento local**, veja **[ARCHITECTURE.md](./ARCHITECTURE.md)**:

- Pipeline de descoberta em cascade (llms.txt → sitemap → crawl)
- Polidez/anti-ban (defaults table, retry, throttle adaptativo)
- UX TTY (barra de progresso, verbose, json, quiet)
- Skills auto-geradas em 3 escopos (co-located, project, HOME)
- Tabela de paths por client × escopo
- Estrutura de arquivos do projeto
- Workflow de desenvolvimento (typecheck, tests, build, pack)

---

## Contexto Acadêmico

Entrega prática do **Módulo de Engenharia de Software com foco em IA** (AKCIT/Cegraf UFG, 2026), seguindo a proposta do **"Laboratório Introdutório: Construindo um Miniprojeto com Inteligência Artificial Generativa"** de Leon Sólon da Silva. Exercita problema/solução, automação, empacotamento npm, integração com múltiplos clientes de IA, MCP e validação de software.

---

## Licença

MIT.
