# -*- coding: utf-8 -*-
"""
Configuração do cliente — MODELO (copie para build/config.py e preencha).

Funil de CAPTAÇÃO DE LEADS (sem VSL, sem vendas):
    Anúncio (Google Ads) → Página → Lead

Fontes (somente leitura, nunca escrever nas planilhas):
  • Google Ads  -> planilha "Divine Motel - Extração Dashboard", aba "Google Ads"
  • Meta Ads    -> planilha "Divine Motel - Extração Dashboard", aba "Meta Ads"
  • Leads       -> planilha "Divine Motel - Leads com UTMs",     aba "Leads"

Teste local:

    python build/build.py --google-file google.csv --meta-file meta.csv --leads-file leads.csv --out dist/index.html
"""
from __future__ import annotations

# ==========================================================================
# 1) PLANILHAS (Google Sheets) — leitura via export CSV público
# ==========================================================================
# Planilha de mídia (abas Google Ads e Meta Ads) — trecho entre /d/ e /edit
SPREADSHEET_ID = "<<PREENCHA: ID da planilha de mídia>>"
# Planilha de Leads (arquivo separado)
SPREADSHEET_ID_LEADS = "<<PREENCHA: ID da planilha de Leads (ou o mesmo ID)>>"

# As abas são lidas pelo NOME (não precisa do gid). Se preferir fixar pelo
# gid, preencha o GID_* — quando preenchido, o gid tem prioridade.
# Nome vazio = plataforma desligada.
SHEET_GOOGLE = "Google Ads"
SHEET_META = "Meta Ads"
SHEET_LEADS = "Leads"
GID_GOOGLE = ""
GID_META = ""
GID_LEADS = ""

# ==========================================================================
# 2) REGRAS DE NEGÓCIO
# ==========================================================================
# Sigla do funil: início do Campaign Name das campanhas deste funil, seguida
# de separador (_ | - ou espaço). Ex.: Google "DM_SEARCH_09-11-2026_Teste-inicial",
# Meta "DM | E2-CAP | P2-FRIO | ...". Campanhas sem a sigla são ignoradas.
FUNNEL_SIGLA = "<<PREENCHA: sigla do funil, ex.: DM>>"

# Imposto sobre o gasto do META ADS (só linhas do Meta; 1.0 = sem imposto).
META_TAX_FACTOR = 1.0

# ==========================================================================
# 3) RÓTULOS EXIBIDOS NA INTERFACE
# ==========================================================================
CLIENT_NAME = "<<PREENCHA: nome do cliente>>"
CLIENT_SUB = "Captação de Leads"
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
