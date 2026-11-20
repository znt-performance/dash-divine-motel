# Dashboard de Controle de Tráfego Pago — Divine Motel / Captação de Leads

Publicado em https://vitorfrazato.github.io/dash-divine-motel/

## Visão geral

Dashboard de BI estática (HTML/CSS/JS + Chart.js) publicada no **GitHub Pages**,
que cruza o **Google Ads** com a planilha de **Leads** e se atualiza sozinha a
cada ~30 min (build 100% na nuvem via GitHub Actions, disparado pelo
cron-job.org). **Somente leitura** das planilhas.

Funil: **Anúncio → Página → Lead** (sem VSL) — Gasto · CPM · Cliques · CPC · CTR ·
Leads · CPL · Tx Conversão (Leads/Cliques).

Como funciona:
1. `build/build.py` lê as abas **Google Ads** e **Leads** (CSV público) e
   emite os registros brutos dentro do HTML.
2. Toda a lógica (KPIs, filtros, gráficos, heatmap, tema) roda no navegador
   (`build/template.html` + `build/app.js`).
3. Push na `main` ou `workflow_dispatch` (cron-job.org a cada 30 min) →
   `.github/workflows/deploy.yml` → GitHub Pages.

## Configuração
- Planilhas, sigla do funil (`DM_`), rótulos e metas: `build/config.py`.
- As planilhas precisam estar como "Qualquer pessoa com o link → Leitor".
- cron-job.org: `SETUP-CRON.md`.
- IA Insights (opcional, desativada): `SETUP-IA.md`.

## Teste local
```bash
python build/build.py --meta-file ads.csv --sales-file leads.csv --out dist/index.html
```
