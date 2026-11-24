# CLAUDE.md — Dashboard de Controle de Tráfego Pago · Divine Motel

> Lido automaticamente pelo Claude Code. Cliente **Divine Motel** — funil
> "Captação de Leads", sigla `DM`.
> Valores do cliente: **`build/config.py`** (funil) e **`config.js`** (publicação).
> Engine adaptada para funil de leads: `build/build.py`, `build/app.js`,
> `build/template.html`.

Checagem de marcadores (não pode retornar nada):

```bash
grep -rn "PREENCHE[R]" --exclude-dir=.git .
```

## O que é

Dashboard de **Controle de Tráfego Pago** — BI estático (HTML/CSS/JS + Chart.js
via CDN) no **GitHub Pages**, cruzando **Google Ads** e **Meta Ads** com a lista de **Leads**.
Atualiza a cada ~30 min (GitHub Actions disparado pelo cron-job.org).

- **URL pública:** `https://znt-performance.github.io/dash-divine-motel/`
- **Cliente/projeto:** Divine Motel — Captação de Leads
- **Sigla do funil:** `DM` (`FUNNEL_SIGLA = "DM"`; casa `DM_...` no Google e `DM | ...` no Meta)

## Fontes de dados (Google Sheets) — somente leitura

Leitura via CSV público (gviz, **pelo nome da aba**; se `GID_*` for preenchido em
`build/config.py`, usa `export?format=csv&gid=`). **Nunca escrever nas planilhas.**

| Fonte | Planilha (`SPREADSHEET_ID*`) | Aba |
|-------|------------------------------|-----|
| **Google Ads** | `1kLt35kM8fqIaLe8-EuySsuriKgWP7NuxzM7U0oU-Ld0` ("Divine Motel - Extração Dashboard") | Google Ads |
| **Meta Ads** | `1kLt35kM8fqIaLe8-EuySsuriKgWP7NuxzM7U0oU-Ld0` (mesma planilha) | Meta Ads |
| **Leads** | `1EauNuu3Mh79S9Eo0cGQ-HYFXNkWpsvqE-iZVJ8q0Ws4` ("Divine Motel - Leads com UTMs") | Leads |

Usar **apenas** essas três abas.

**Colunas reais — Google Ads:**
Day · Campaign Name · Ad Group Name · Cost (Spend) · Impressions · Clicks

**Colunas reais — Meta Ads:**
Day · Campaign Name · Ad Set Name · Ad Name · Impressions · Link Clicks ·
Messaging Conversations Started · Amount Spent · Creative Instagram Permalink

**Colunas reais — Leads:**
Data e hora · Nome · Telefone · Plataforma · Captura · Quando precisa · Pessoas ·
Motivo · utm_source · utm_medium · utm_campaign · utm_content · utm_term ·
Click ID · Status · Data do pernoite · Valor · Responsável · Observações
(usadas pelo build: Data e hora, Nome, Plataforma, Status, utm_source, utm_medium, utm_campaign).

### Pontos de atenção (verificado em 20/11/2026)
- Não há coluna de anúncio no Google Ads → hierarquia vai até **Grupo de anúncios**.
- Meta Ads (verificado em 24/11/2026): campanha de mensagem/WhatsApp — os leads do Meta
  **não** entram na aba Leads (nenhuma UTM de Meta lá). Lead do Meta = `Messaging
  Conversations Started`. Hierarquia Campanha → Conjunto → Anúncio, com link do criativo.
- **Imposto do Meta:** `META_TAX_FACTOR = 1.1385`, aplicado **só ao gasto do Meta** quando o
  toggle "Imposto Meta" está ligado (padrão). Google sem imposto.
- `Cost (Spend)` vem com vírgula decimal (`8,82`); o `to_float` trata.
- `utm_medium` = Ad Group Name em minúsculas com hífen (`Moteis perto de mim` →
  `moteis-perto-de-mim`); os 3 grupos atuais casam 100%.
- `utm_content`/`utm_term` vazios; `Valor`/`Data do pernoite` ainda não preenchidos.
- Leads orgânicos/diretos (sem UTM) entram só no total; linhas com "teste" no
  Nome são descartadas.
- Telefone **nunca** vai para a página (pública); nome sai abreviado.

### Critério de MQL
Não há etapa de MQL nesta dashboard (lead = qualquer linha válida da aba Leads).

## Funil e métricas
`Anúncio → Clique → Lead` (sem VSL, sem vendas/faturamento)
- Google: lead = linha da aba Leads atribuída à campanha (formulário/WhatsApp do site).
- Meta: lead = conversa iniciada (Messaging Conversations Started); cliques = Link Clicks.

Gasto · Impressões · CPM · Cliques · CPC · CTR · Leads · CPL (Gasto/Leads) ·
Tx Conversão (Leads/Cliques).
- Visão Geral: **Google + Meta**. Leads = todos os leads da planilha + conversas do Meta;
  CPL e Tx Conversão = só leads de mídia paga (Google atribuído + conversas Meta).
  Tabela "Por plataforma" separa Google / Meta / Orgânico.
- Abas Google Ads e Meta Ads: cada uma só com a sua plataforma.

### Atribuição
Lead é do Google Ads quando `utm_campaign` = `Campaign Name` (normalizado) de
uma campanha da sigla do funil; o grupo vem de `slug(utm_medium)` =
`slug(Ad Group Name)`. Quando casa, o lead herda os nomes **reais** do Google Ads
(mesma linha do gasto nas tabelas).

### Convenções de campanha
- Nomenclatura de campanha: `SIGLA_REDE_DD-MM-AAAA_Descrição` (ex.: `DM_SEARCH_09-11-2026_Teste-inicial`)
- Nomenclatura de grupo: nome livre do grupo de anúncios (ex.: `Moteis perto de mim`, `Branding Terms`, `Concorrentes`)
- Nomenclatura de anúncio: não exportada na planilha (sem nível de anúncio)
- Mapeamento UTM → Google Ads: `utm_campaign → Campaign Name` · `utm_medium → Ad Group Name (slug)` · `utm_source = google-ads`.

## Abas da dashboard
- **Visão Geral** — Google + Meta: funil, evolução diária, tabela diária (heatmap), tabela Por plataforma, CPM/CTR, CPC/CPL, Tx Conversão.
- **Google Ads** — mesmo funil só Google Ads + tabelas Campanha → Grupo (clicáveis/filtro) + lista de leads.
- **Meta Ads** — funil só Meta (conversas) + Campanha → Conjunto → Anúncio (com link do criativo).
- **Relatórios** — cards Total × Tráfego (Google + Meta), dia a dia, campanhas, melhores/piores grupos/conjuntos.
  Metas opcionais `CPL_TARGET`/`CONV_TARGET` em `build/config.py` (0 = sem cor).
  Briefing do Gestor só aparece se existir `build/relatorios.json` (não configurado).
- **IA Insights** — oculta enquanto `IA_WORKER_URL` estiver vazio (ver `SETUP-IA.md`).
  `build/gerar_relatorios.py` e `ia-worker/worker.js` vieram do template de vendas e
  **não foram adaptados** ao funil de leads; adaptar antes de ativar.

## Arquitetura / arquivos

```
build/build.py             # lê as 3 abas (read-only), emite ads[] (p=g Google / p=m Meta) e leads[]
build/config.py            # CONFIG DO CLIENTE
build/config.example.py    # modelo com marcadores
build/template.html        # esqueleto HTML
build/app.js               # lógica + renderização (no navegador)
build/identidade-visual.css / estilos.css
.github/workflows/deploy.yml  # push na main + workflow_dispatch -> build -> Pages
SETUP-CRON.md              # valores do cron-job.org
```

Teste local (CSVs exportados, não commitar):
`python build/build.py --google-file google.csv --meta-file meta.csv --leads-file leads.csv --out dist/index.html`

### Cache-bust
`<meta name="build">` com o `build_id` de cada build + `dist/version.json`; o
`app.js` consulta a página com `cache:'no-store'` e mostra "Novos dados
publicados · Atualizar agora" (recarrega com `?t=<timestamp>`).

## Publicação — problemas conhecidos e soluções

1. **Push com integração somente‑leitura:** se `git push`/MCP derem `403 Resource not
   accessible by integration`, faça push com o **PAT do usuário** direto ao github.com
   (`git push https://x-access-token:<TOKEN>@github.com/<owner>/<repo>.git main:main`).
   **Nunca** grave o token no `.git/config` (use a URL efêmera).
2. **cron-job.org só funciona na `main`:** `workflow_dispatch` só existe na branch padrão.
3. **Pages liga sozinho:** `actions/configure-pages@v5` com `enablement: true`
   (+ `permissions: {pages: write, id-token: write}`).
4. **Proxy do sandbox:** o agente NÃO alcança `docs.google.com`, `*.github.io` nem a API
   REST de Actions/Pages e nem `api.cloudflare.com` — mas o runner do Actions alcança
   tudo. Teste dados com CSV local; deploys da Cloudflare passam pelo GitHub Actions.
5. **Token exposto no chat:** revogar e gerar um novo (fine‑grained, só Actions: r/w no repo).
6. **"Senha incorreta" na aba IA Insights após um deploy:** normalmente indica que os
   secrets `ANTHROPIC_API_KEY`/`INSIGHTS_PASSWORD` não estão cadastrados como Secrets
   do repositório no GitHub — o workflow `deploy-worker.yml` os reaplica no Worker a
   cada deploy; sem eles cadastrados, o Worker fica sem senha válida.
7. **Insights "somem":** se estiverem salvos só no navegador (versões antigas do
   template), limpar dados do navegador apaga tudo. A partir desta versão a
   persistência é no Worker (KV) — ver seção "IA Insights" acima; confirme que
   `IA_WORKER_URL` está preenchido em `build/config.py` e que o log do deploy do Worker
   não mostrou o aviso de KV sem permissão.
9. **"A dash trava" / "não atualiza":** o build roda a cada 30 min e publica normalmente
   — confira em Actions antes de suspeitar do pipeline. Duas causas reais, ambas já
   corrigidas em `build/app.js`:
   - *Travar*: a versão antiga fazia `location.href=...` a cada 30 min, recarregando a
     página por cima do usuário. Filtros, seleção de campanha/anúncio e rolagem eram
     perdidos no meio da análise (parece travamento) e cada recarga empilhava uma
     entrada no histórico. Agora a página **não recarrega sozinha**: ela consulta a
     versão publicada e mostra um aviso "Novos dados publicados · Atualizar agora".
   - *Não atualizar*: as metatags `http-equiv="Cache-Control"` do `<head>` **não
     controlam o cache HTTP** — quem decide são os cabeçalhos da resposta, e no GitHub
     Pages não dá para defini-los. Abrir a URL "pelada" podia entregar uma cópia de
     cache mesmo com build novo publicado. O checador resolve isso comparando
     `<meta name="build">` (buscado com `cache:'no-store'`) com o `build_id` carregado.
   Para conferir qual build está na tela: rodapé do menu lateral (`build ...`) e
   "Última atualização" na topbar.
