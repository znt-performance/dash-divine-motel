#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Dashboard de Controle de Tráfego Pago — Funil de CAPTAÇÃO DE LEADS
(Google Ads × Leads). Os valores do cliente ficam em `build/config.py`.

Lê duas abas (export CSV público, SOMENTE LEITURA — nunca escreve nas
planilhas) e emite os REGISTROS BRUTOS dentro do HTML:
    meta[]  = linhas do Google Ads (dia × campanha × grupo de anúncios)
    sales[] = leads (1 linha = 1 lead)
Todo o cálculo/filtro/gráfico roda no navegador (build/app.js).

Funil:  Anúncio → Página → Lead
    Gasto · CPM · Cliques · CPC · CTR · Leads · CPL · Tx Conversão (Leads/Cliques)

Teste local:
    python build/build.py --meta-file ads.csv --sales-file leads.csv --out dist/index.html
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import os
import re
import sys
import unicodedata
import urllib.parse
import urllib.request
from datetime import datetime, timezone, timedelta

try:
    import config as cfg
except ImportError:
    sys.exit(
        "ERRO: build/config.py não encontrado.\n"
        "Copie o modelo e preencha os valores do cliente:\n"
        "    cp build/config.example.py build/config.py"
    )

_REQUIRED = ("SPREADSHEET_ID", "CLIENT_NAME")
_missing = [name for name in _REQUIRED if not getattr(cfg, name, "")]
if _missing:
    sys.exit(
        "ERRO: build/config.py está com campo(s) obrigatório(s) vazio(s): "
        + ", ".join(_missing) + "."
    )

# Template: qualquer campo de texto que ainda tenha marcador <<PREENCHA ...>> (modelo)
# interrompe o build com uma mensagem clara (em vez de um 404 da planilha).
_pendentes = [name for name in dir(cfg)
              if name.isupper() and isinstance(getattr(cfg, name), str)
              and "<<PREENCH" in getattr(cfg, name)]
if _pendentes:
    sys.exit(
        "ERRO: build/config.py ainda tem marcador(es) de preenchimento em: "
        + ", ".join(sorted(_pendentes)) + ".\n"
        "Preencha build/config.py (modelo: build/config.example.py)."
    )

SPREADSHEET_ID = cfg.SPREADSHEET_ID
SPREADSHEET_ID_SALES = getattr(cfg, "SPREADSHEET_ID_SALES", "") or SPREADSHEET_ID
SHEET_META = getattr(cfg, "SHEET_META", "")
SHEET_SALES = getattr(cfg, "SHEET_SALES", "")
GID_META = getattr(cfg, "GID_META", "")
GID_SALES = getattr(cfg, "GID_SALES", "")
FUNNEL_PREFIX = getattr(cfg, "FUNNEL_PREFIX", "")
TAX_FACTOR = getattr(cfg, "TAX_FACTOR", 1.0) or 1.0
CLIENT_NAME = cfg.CLIENT_NAME
CLIENT_SUB = getattr(cfg, "CLIENT_SUB", "")
PLATFORM_NAME = getattr(cfg, "PLATFORM_NAME", "Google Ads")
TAX_LABEL = getattr(cfg, "TAX_LABEL", "Imposto")
CPL_TARGET = getattr(cfg, "CPL_TARGET", 0.0)
CONV_TARGET = getattr(cfg, "CONV_TARGET", 0.0)
REPORT_BAND_LOW = getattr(cfg, "REPORT_BAND_LOW", 0.70)
REPORT_BAND_HIGH = getattr(cfg, "REPORT_BAND_HIGH", 1.30)
IA_WORKER_URL = getattr(cfg, "IA_WORKER_URL", "")


def sheet_url(sid: str, gid: str, name: str) -> str:
    """gid preenchido -> export CSV pelo gid; senão -> gviz CSV pelo NOME da aba."""
    if gid:
        return f"https://docs.google.com/spreadsheets/d/{sid}/export?format=csv&gid={gid}"
    if not name:
        sys.exit("ERRO: informe SHEET_META/SHEET_SALES (nome da aba) ou GID_META/GID_SALES em build/config.py.")
    return (f"https://docs.google.com/spreadsheets/d/{sid}/gviz/tq?tqx=out:csv&headers=1"
            f"&sheet={urllib.parse.quote(name)}")


META_CSV_URL = sheet_url(SPREADSHEET_ID, GID_META, SHEET_META)
SALES_CSV_URL = sheet_url(SPREADSHEET_ID_SALES, GID_SALES, SHEET_SALES)
BRT = timezone(timedelta(hours=-3))   # horário de Brasília (exibição)


# --------------------------------------------------------------------------- #
# Leitura (só leitura das planilhas)
# --------------------------------------------------------------------------- #
def fetch_csv(url: str) -> list[list[str]]:
    req = urllib.request.Request(url, headers={"User-Agent": "dash-leads-bot/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
    if raw.lstrip().lower().startswith(("<!doctype", "<html")):
        sys.exit(f"ERRO: a planilha não devolveu CSV (está pública 'qualquer pessoa com o link'?): {url}")
    return list(csv.reader(io.StringIO(raw)))


def read_csv_file(path: str) -> list[list[str]]:
    with open(path, "r", encoding="utf-8", errors="replace", newline="") as f:
        return list(csv.reader(f))


def load_rows(url: str, local: str | None) -> list[list[str]]:
    return read_csv_file(local) if local else fetch_csv(url)


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def strip_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def norm(s: str | None) -> str:
    return strip_accents((s or "").strip().lower())


def slug(s: str | None) -> str:
    """'Moteis perto de mim' -> 'moteis-perto-de-mim' (casa Ad Group Name com utm_medium)."""
    return re.sub(r"[^a-z0-9]+", "-", norm(s)).strip("-")


def to_float(v) -> float:
    if v is None:
        return 0.0
    if isinstance(v, (int, float)):
        return float(v)
    s = re.sub(r"[^\d,.\-]", "", str(v).strip())
    if not s:
        return 0.0
    if "," in s and "." in s:
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif "," in s:
        s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return 0.0


def parse_date(v: str) -> str | None:
    """Aceita 'AAAA-MM-DD', 'DD/MM/AAAA' e 'DD/MM/AAAA HH:MM[:SS]' (planilhas pt-BR)."""
    if not v:
        return None
    s = str(v).strip()
    if not s:
        return None
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    m = re.match(r"(\d{1,2})/(\d{1,2})/(\d{4})", s)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        try:
            return datetime(y, mo, d).strftime("%Y-%m-%d")
        except ValueError:
            return None
    for fmt in ("%d/%m/%y", "%b %d, %Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(s.split(" ")[0] if fmt != "%b %d, %Y" else s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def is_test_row(rowtext: str) -> bool:
    return "<test lead" in rowtext.lower()


def is_test_name(name: str) -> bool:
    return bool(re.search(r"\bteste?\b", norm(name)))


# ----- Máscara de PII (a página publicada é pública) ----- #
def first_last_initial(name: str) -> str:
    parts = (name or "").strip().split()
    if not parts:
        return "—"
    first = parts[0].capitalize()
    return first if len(parts) == 1 else f"{first} {parts[-1][:1].upper()}."


# --------------------------------------------------------------------------- #
# Indexação de colunas (por nome, com fallback posicional)
# --------------------------------------------------------------------------- #
def header_index(header, wanted, fallback):
    idx = {}
    hn = [norm(h) for h in header]
    for key, aliases in wanted.items():
        found = None
        for a in aliases:
            a = norm(a)
            for i, h in enumerate(hn):
                if h == a or (a and a in h):
                    found = i
                    break
            if found is not None:
                break
        idx[key] = found if found is not None else fallback.get(key)
    return idx


def cell(row, i):
    if i is None or i < 0 or i >= len(row):
        return ""
    return (row[i] or "").strip()


# --------------------------------------------------------------------------- #
# Processamento -> registros brutos
# --------------------------------------------------------------------------- #
def process(meta_rows, sales_rows):
    # ---------------- Aba GOOGLE ADS ----------------
    # Colunas reais: Day · Campaign Name · Ad Group Name · Cost (Spend) · Impressions · Clicks
    mheader = meta_rows[0] if meta_rows else []
    midx = header_index(
        mheader,
        {"day": ["day", "data", "dia"], "campaign": ["campaign name", "campaign", "campanha"],
         "adset": ["ad group name", "ad group", "grupo de anuncios", "ad set name"],
         "spent": ["cost (spend)", "cost", "spend", "custo", "gasto", "amount spent"],
         "impr": ["impressions", "impress"],
         "clicks": ["clicks", "cliques", "link clicks"]},
        {"day": 0, "campaign": 1, "adset": 2, "spent": 3, "impr": 4, "clicks": 5},
    )

    meta = []
    camp_map = {}    # campanha normalizada -> nome real
    group_map = {}   # (campanha normalizada, slug do grupo) -> nome real do grupo
    for row in meta_rows[1:]:
        if not any((c or "").strip() for c in row):
            continue
        if is_test_row(" ".join(str(c) for c in row)):
            continue
        camp = cell(row, midx["campaign"])
        if not camp:
            continue
        if FUNNEL_PREFIX and not norm(camp).startswith(norm(FUNNEL_PREFIX)):
            continue
        adset = cell(row, midx["adset"]) or "(sem grupo)"
        camp_map.setdefault(norm(camp), camp)
        group_map.setdefault((norm(camp), slug(adset)), adset)
        meta.append({
            "d": parse_date(cell(row, midx["day"])),
            "camp": camp, "adset": adset,
            "sp": round(to_float(cell(row, midx["spent"])), 4),
            "im": to_float(cell(row, midx["impr"])),
            "cl": to_float(cell(row, midx["clicks"])),
        })

    # ---------------- Aba LEADS ----------------
    # Colunas reais: Data e hora · Nome · Telefone · Plataforma · Captura · Quando precisa ·
    #   Pessoas · Motivo · utm_source · utm_medium · utm_campaign · utm_content · utm_term ·
    #   Click ID · Status · Data do pernoite · Valor · Responsável · Observações
    sheader = sales_rows[0] if sales_rows else []
    sidx = header_index(
        sheader,
        {"created": ["data e hora", "data", "created"],
         "name": ["nome", "name"],
         "plat": ["plataforma"],
         "status": ["status"],
         "utm_source": ["utm_source", "utm source"],
         "utm_medium": ["utm_medium", "utm medium"],
         "utm_campaign": ["utm_campaign", "utm campaign"]},
        {"created": 0, "name": 1},
    )

    sales = []
    for row in sales_rows[1:]:
        if not any((c or "").strip() for c in row):
            continue
        if is_test_row(" ".join(str(c) for c in row)):
            continue
        name = cell(row, sidx["name"])
        if is_test_name(name):
            continue
        d = parse_date(cell(row, sidx["created"]))
        if not d:
            continue
        ucamp = cell(row, sidx["utm_campaign"])
        umed = cell(row, sidx["utm_medium"])
        usrc = cell(row, sidx["utm_source"])
        real_camp = camp_map.get(norm(ucamp)) if ucamp else None
        if real_camp:
            # Lead atribuído ao Google Ads: herda campanha/grupo REAIS (mesma linha do gasto)
            camp = real_camp
            adset = group_map.get((norm(ucamp), slug(umed)), umed or "(sem grupo)")
            ads = 1
        else:
            camp = ucamp or "(sem campanha)"
            adset = umed or "(sem grupo)"
            ads = 0
        origem = usrc or cell(row, sidx["plat"]) or "Orgânico / direto"
        sales.append({
            "d": d, "camp": camp, "adset": adset,
            "meta": ads,
            "src": origem,
            "st": cell(row, sidx["status"]) or "—",
            "nm": first_last_initial(name),
        })

    dates = sorted({x["d"] for x in meta + sales if x["d"]})
    now_brt = datetime.now(BRT)
    return {
        "build": {
            "generated_at_brt": now_brt.strftime("%d/%m/%Y %H:%M"),
            "build_id": datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S"),
            "today": now_brt.strftime("%Y-%m-%d"),
            "date_min": dates[0] if dates else None,
            "date_max": dates[-1] if dates else None,
            "tax_factor": TAX_FACTOR,
            "client_name": CLIENT_NAME,
            "client_sub": CLIENT_SUB,
            "platform": PLATFORM_NAME,
            "tax_label": TAX_LABEL,
            "ia_worker_url": IA_WORKER_URL,
            "cpl_target": CPL_TARGET,
            "conv_target": CONV_TARGET,
            "report_band_low": REPORT_BAND_LOW,
            "report_band_high": REPORT_BAND_HIGH,
        },
        "meta": meta,
        "sales": sales,
        "briefings": {},
    }


# --------------------------------------------------------------------------- #
# Briefings do Gestor (aba Relatórios) — texto gerado por IA 1x/dia
# --------------------------------------------------------------------------- #
def load_briefings(path: str) -> dict:
    """Lê build/relatorios.json (gerado pela Routine diária). Estrutura:
        {"generated_at": "...", "periodos": {"<preset>": {...}, ...}}
    Retorna o dict de períodos (ou {} se o arquivo não existir/for inválido).
    A geração NÃO acontece aqui — este build só lê o texto já pronto, sem
    chamar nenhuma API (custo zero no build/no navegador)."""
    if not path or not os.path.exists(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            obj = json.load(f)
        return obj if isinstance(obj, dict) else {}
    except (ValueError, OSError):
        return {}


# --------------------------------------------------------------------------- #
# Render
# --------------------------------------------------------------------------- #
def render(data, template_path):
    # A dashboard é montada a partir de arquivos separados (visual x lógica):
    #   template.html          -> esqueleto HTML (com placeholders __STYLES__/__APP_JS__)
    #   identidade-visual.css  -> TODAS as cores (edite aqui p/ mexer só em cor)
    #   estilos.css            -> layout/componentes
    #   app.js                 -> lógica + renderização
    # Esta função só COSTURA os arquivos e injeta os dados; não altera nada deles.
    base = os.path.dirname(os.path.abspath(template_path))
    def readf(name):
        with open(os.path.join(base, name), "r", encoding="utf-8") as f:
            return f.read()
    with open(template_path, "r", encoding="utf-8") as f:
        tpl = f.read()
    styles = readf("identidade-visual.css") + "\n" + readf("estilos.css")
    tpl = tpl.replace("__STYLES__", styles)
    tpl = tpl.replace("__APP_JS__", readf("app.js"))
    tpl = tpl.replace("__DATA_JSON__", json.dumps(data, ensure_ascii=False))
    tpl = tpl.replace("__BUILD_ID__", data["build"]["build_id"])
    tpl = tpl.replace("__GENERATED_BRT__", data["build"]["generated_at_brt"])
    return tpl


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--meta-file", help="CSV da aba Google Ads (teste local)")
    ap.add_argument("--sales-file", help="CSV da aba Leads (teste local)")
    ap.add_argument("--template", default="build/template.html")
    ap.add_argument("--out", default="dist/index.html")
    args = ap.parse_args()

    meta_rows = load_rows(META_CSV_URL, args.meta_file)
    sales_rows = load_rows(SALES_CSV_URL, args.sales_file)
    data = process(meta_rows, sales_rows)

    # Proteção: não publica uma dashboard vazia se a leitura da planilha falhar.
    if not data["meta"]:
        sys.exit("ERRO: nenhuma linha do Google Ads lida (aba/colunas/sigla do funil?). Build abortado.")

    briefings_path = os.path.join(os.path.dirname(os.path.abspath(args.template)), "relatorios.json")
    data["briefings"] = load_briefings(briefings_path)

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        f.write(render(data, args.template))

    b = data["build"]
    leads = len(data["sales"])
    leads_ads = sum(s["meta"] for s in data["sales"])
    gasto = sum(m["sp"] for m in data["meta"])
    print("== build ok ==", file=sys.stderr)
    print(f"  periodo : {b['date_min']} -> {b['date_max']}", file=sys.stderr)
    print(f"  ads     : {len(data['meta'])} linhas · Gasto R$ {gasto:,.2f}", file=sys.stderr)
    print(f"  leads   : {leads} total · {leads_ads} atribuídos ao {PLATFORM_NAME}", file=sys.stderr)
    print(f"  out     : {args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
