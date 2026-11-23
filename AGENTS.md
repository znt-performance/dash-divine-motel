# AGENTS.md — Dashboard de Controle de Tráfego Pago · Divine Motel

> Instruções para agentes de código. Contexto completo em **`CLAUDE.md`**.

## Projeto

- **Cliente/funil:** Divine Motel — Captação de Leads (sigla `DM`)
- **URL pública:** `https://znt-performance.github.io/dash-divine-motel/`
- **Tipo de funil:** captação de leads — `Anúncio (Google Ads) → Página → Lead`
  (Gasto · CPM · Cliques · CPC · CTR · Leads · CPL · Tx Conversão)

Checagem de marcadores (não pode retornar nada):

```bash
grep -rn "PREENCHE[R]" --exclude-dir=.git .
```

## Regras para agentes

- Valores do cliente em `build/config.py` e `config.js`.
- **Somente leitura** das planilhas (abas "Google Ads" e "Leads" apenas).
- **Nunca** grave tokens/chaves/senhas em arquivos do repositório — só em
  GitHub Secrets / cron-job.org.
- Nunca publique telefone ou nome completo de leads (página pública).
- Não commite `dist/` nem CSVs de teste (`.gitignore`).
- Teste local antes de commitar na `main`:
  `python build/build.py --meta-file ads.csv --sales-file leads.csv --out dist/index.html`
- Se `git push` der `403 Resource not accessible by integration`, avise o
  usuário antes de tentar qualquer contorno (ver `CLAUDE.md`).
