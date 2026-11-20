# -*- coding: utf-8 -*-
"""
Configuração do cliente — Divine Motel · Captação de Leads.

Funil de CAPTAÇÃO DE LEADS (sem VSL, sem vendas):
    Anúncio (Google Ads) → Página → Lead

Fontes (somente leitura, nunca escrever nas planilhas):
  • Google Ads  -> planilha "Divine Motel - Extração Dashboard", aba "Google Ads"
  • Leads       -> planilha "Divine Motel - Leads com UTMs",     aba "Leads"

Teste local:

    python build/build.py --meta-file ads.csv --sales-file leads.csv --out dist/index.html

(--meta-file = CSV da aba Google Ads · --sales-file = CSV da aba Leads)
"""
from __future__ import annotations

# ==========================================================================
# 1) PLANILHAS (Google Sheets) — leitura via export CSV público
# ==========================================================================
# Planilha do Google Ads (trecho entre /d/ e /edit na URL)
SPREADSHEET_ID = "1kLt35kM8fqIaLe8-EuySsuriKgWP7NuxzM7U0oU-Ld0"
# Planilha de Leads (arquivo separado)
SPREADSHEET_ID_SALES = "1EauNuu3Mh79S9Eo0cGQ-HYFXNkWpsvqE-iZVJ8q0Ws4"

# As abas são lidas pelo NOME (não precisa do gid). Se preferir fixar pelo
# gid, preencha GID_META / GID_SALES — quando preenchido, o gid tem prioridade.
SHEET_META = "Google Ads"
SHEET_SALES = "Leads"
GID_META = ""
GID_SALES = ""

# ==========================================================================
# 2) REGRAS DE NEGÓCIO
# ==========================================================================
# Sigla do funil: prefixo do Campaign Name das campanhas deste funil
# (ex.: DM_SEARCH_09-11-2026_Teste-inicial). Linhas do Google Ads de
# campanhas sem essa sigla são ignoradas.
FUNNEL_PREFIX = "DM_"

# Fator de imposto sobre o gasto de mídia (1.0 = sem imposto; toggle oculto).
TAX_FACTOR = 1.0

# ==========================================================================
# 3) RÓTULOS EXIBIDOS NA INTERFACE
# ==========================================================================
CLIENT_NAME = "Divine Motel"
CLIENT_SUB = "Captação de Leads"
PLATFORM_NAME = "Google Ads"
TAX_LABEL = "Imposto"

# ==========================================================================
# 4) METAS (aba Relatórios) — código de cor de CPL e Tx Conversão
# ==========================================================================
#   • CPL : quanto MENOR, melhor -> desempenho = CPL_TARGET / cpl
#   • Conv: quanto MAIOR, melhor -> desempenho = conv / CONV_TARGET
# 0 = sem meta (sem código de cor).
CPL_TARGET = 0.0
CONV_TARGET = 0.0
REPORT_BAND_LOW = 0.70
REPORT_BAND_HIGH = 1.30

# ==========================================================================
# 5) IA INSIGHTS (Cloudflare Worker) — ver SETUP-IA.md
# ==========================================================================
# Vazio = aba IA Insights oculta.
IA_WORKER_URL = ""
