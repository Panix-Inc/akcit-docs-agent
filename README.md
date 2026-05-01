```text
 █████╗ ██╗  ██╗ ██████╗██╗████████╗
██╔══██╗██║ ██╔╝██╔════╝██║╚══██╔══╝
███████║█████╔╝ ██║     ██║   ██║   
██╔══██║██╔═██╗ ██║     ██║   ██║   
██║  ██║██║  ██╗╚██████╗██║   ██║   
╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝╚═╝   ╚═╝   
CENTRO DE COMPETÊNCIA EMBRAPII EM TECNOLOGIAS IMERSIVAS
```

**`@akcit/docs-agent`** — captura documentações web, converte em Markdown organizado em `docs/<tecnologia>/`, **e gera automaticamente uma skill por tecnologia capturada** (formato compatível com Claude Code, Codex CLI, Cursor e Gemini CLI). O agente que rodar no projeto descobre a knowledge base e a usa como contexto na hora — sem configuração manual.

Miniprojeto do **curso de Engenharia de Software com foco em Inteligência Artificial** (AKCIT/Cegraf UFG - Universidade Federal de Goiás, 2026).

---

## Quickstart

```bash
# 1. Capturar uma documentação (gera docs/<tech>/ + skill auto-instalada nos 4 clients no projeto atual)
npx -y @akcit/docs-agent capture https://adk.dev

# 2. Captura + instalação global em HOME (para qualquer projeto descobrir a skill)
npx -y @akcit/docs-agent capture https://adk.dev --install
```

Após isso, abrir o projeto no Claude Code / Codex CLI / Cursor / Gemini CLI: a skill `docs-adk` está disponível e o agente sabe quando ativá-la.

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
