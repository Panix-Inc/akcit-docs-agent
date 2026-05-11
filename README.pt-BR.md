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

**Português do Brasil** | [English](./README.md)

**`@akcit/docs-agent`** entrega três capacidades em um único pacote npm:

1. **Captura de documentação** — baixa qualquer site de docs e organiza em Markdown sob `docs/<tecnologia>/`, gerando automaticamente uma skill por tecnologia para Claude Code, Codex CLI, Cursor e Gemini CLI. O agente descobre a knowledge base e a usa como contexto na hora, sem configuração manual.
2. **`/prompt`** — transforma perguntas vagas em prompts estruturados pelo framework **COSTAR-A** (ver [seção dedicada abaixo](#prompt--engenheiro-de-prompt-no-terminal-costar-a)).
3. **`/prompt-code`** — gera prompts de implementação ou revisão de código guiados pelas documentações locais que o próprio Docs Agent capturou.

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
akcit-docs add        # implanta /docs, /prompt, /prompt-code nos 4 clients
```

> **Por que dois passos?** `npm install -g` apenas adiciona o binário ao PATH. Os arquivos de integração (skills, comandos, MCP) são escritos no seu `$HOME` por `akcit-docs add` — uma escolha intencional para evitar `postinstall` modificando o seu HOME silenciosamente (anti-pattern do npm). Rodar `akcit-docs` sem argumentos imprime um relatório de status indicando o que falta:
>
> ```bash
> akcit-docs           # status: o que está instalado, faltando, ou desatualizado
> akcit-docs status    # mesmo relatório (subcomando explícito)
> akcit-docs add       # aplicar templates atuais em todos os clientes
> akcit-docs add --force   # sobrescreve arquivos modificados localmente (.bak preservado)
> ```

Requer **Node.js 20+**.

## Quickstart

```bash
# 1. Capturar uma documentação (gera docs/<tech>/ + skill auto-instalada nos 4 clients no projeto atual)
npx -y @akcit/docs-agent capture https://adk.dev

# 2. Captura + instalação global em HOME (para qualquer projeto descobrir a skill)
npx -y @akcit/docs-agent capture https://adk.dev --install
```

Após isso, abrir o projeto no Claude Code / Codex CLI / Cursor / Gemini CLI: a skill `docs-adk` está disponível e o agente sabe quando ativá-la.

### `/prompt` — engenheiro de prompt no terminal (COSTAR-A)

Comando que **reescreve um pedido vago como um prompt completo** seguindo o framework **COSTAR-A**, descrito no artigo [COSTAR-A: A prompting framework for enhancing Large Language Model performance on Point-of-View questions](./references/costar.pdf). Funciona em qualquer cliente (Claude Code, Codex CLI, Cursor, Gemini CLI) após `npx -y @akcit/docs-agent add`.

#### O que é COSTAR-A

COSTAR é um esqueleto de prompt em seis blocos. **COSTAR-A** acrescenta um sétimo, **Answer**, que é uma diretiva explícita para o modelo entregar a resposta final em vez de parar na análise — útil quando a pergunta é ambígua, simples demais, ou quando o modelo costuma responder sem seguir o formato.

| Bloco | Função | Pergunta que ele responde |
|---|---|---|
| **C**ontext | Cenário, restrições, fatos relevantes | Em que situação isso está acontecendo? |
| **O**bjective | A tarefa concreta | O que o modelo deve fazer? |
| **S**tyle | Estilo de escrita ou raciocínio | Como o texto deve soar? |
| **T**one | Atitude da resposta | Formal? Direto? Acolhedor? |
| **A**udience | Quem vai ler | Qual o nível de expertise? |
| **R**esponse | Formato, idioma, tamanho, validação | Como entregar? |
| **A**nswer | Diretiva final | "Produza agora a resposta final em &lt;formato&gt;" |

`/prompt` preserva a intenção do usuário, infere defaults razoáveis para os blocos não fornecidos e só pergunta de volta quando algo realmente muda o resultado.

#### Exemplo 1 — pergunta conceitual

**Antes** (pedido cru):

```bash
/prompt explique hooks do React para um dev júnior
```

**Depois** (prompt gerado pelo `/prompt`):

```text
# Context #
Você está ajudando um desenvolvedor júnior a entender React hooks como parte do aprendizado da biblioteca.
#############
# Objective #
Explique o que são hooks, por que existem (problema dos componentes de classe) e quando usar useState, useEffect e useContext.
#############
# Style #
Didático, com exemplos curtos de código antes da explicação.
#############
# Tone #
Claro, direto e encorajador.
#############
# Audience #
Desenvolvedor júnior com conhecimento básico de JavaScript ES6 e componentes funcionais.
#############
# Response #
Responda em português, em até 400 palavras, com 3 tópicos e um exemplo de código por tópico.
#############
# Answer #
Produza a explicação final agora, seguindo exatamente os tópicos e o limite de palavras.
```

#### Exemplo 2 — saída executiva

**Antes:**

```bash
/prompt resuma as decisões da reunião de produto pra mandar pro CEO
```

**Depois:**

```text
# Context #
Resumo de uma reunião de produto que precisa subir para o CEO. Foco em decisões, donos e riscos — não em discussão.
#############
# Objective #
Produzir um resumo executivo das decisões tomadas, com responsável e prazo quando informados.
#############
# Style #
Bullet points; uma decisão por linha; sem adjetivos.
#############
# Tone #
Direto, neutro, executivo.
#############
# Audience #
CEO sem contexto da reunião; tem 60 segundos para ler.
#############
# Response #
Português, máximo 8 bullets. Cada bullet: <decisão> — <responsável>, <prazo>. Liste riscos no final em itálico.
#############
# Answer #
Entregue agora o resumo final pronto para colar no e-mail.
```

#### Quando o `Answer` faz diferença

O bloco extra é especialmente útil quando o pedido é simples e o modelo tende a "pensar alto" em vez de entregar o resultado, ou quando você quer forçar um formato específico (JSON, tabela, código). Sem `Answer`, modelos menores costumam parar no esqueleto; com `Answer`, eles produzem a saída final.

```bash
/prompt traduza isso para inglês mantendo o tom de marketing brasileiro
```

Aqui o `Answer` força "entregue a tradução pronta", evitando que o modelo descreva o que faria.

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
