#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Dashboard de Controle de Tráfego Pago — Funil de CAPTAÇÃO DE LEADS
(Google Ads + Meta Ads × Leads). Os valores do cliente ficam em `build/config.py`.

Lê três abas (CSV público, SOMENTE LEITURA — nunca escreve nas planilhas) e
emite os REGISTROS BRUTOS dentro do HTML:
    ads[]   = linhas de mídia, p="g" (Google: dia × campanha × grupo) ou
              p="m" (Meta: dia × campanha × conjunto × anúncio; cv = conversas)
    leads[] = leads da planilha (1 linha = 1 lead; p="g" se atribuído ao Google)
Todo o cálculo/filtro/gráfico roda no navegador (build/app.js).

Funil:  Anúncio → Clique → Lead
    Google: lead = linha da aba Leads com UTM da campanha (formulário da página)
    Meta:   lead = "Messaging Conversations Started" (conversa iniciada no WhatsApp)
    Gasto · CPM · Cliques · CPC · CTR · Leads · CPL · Tx Conversão (Leads/Cliques)

Teste local:
    python build/build.py --google-file google.csv --meta-file meta.csv --leads-file leads.csv --out dist/index.html
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
SPREADSHEET_ID_LEADS = getattr(cfg, "SPREADSHEET_ID_LEADS", "") or SPREADSHEET_ID
SHEET_GOOGLE = getattr(cfg, "SHEET_GOOGLE", "")
SHEET_META = getattr(cfg, "SHEET_META", "")
SHEET_LEADS = getattr(cfg, "SHEET_LEADS", "")
GID_GOOGLE = getattr(cfg, "GID_GOOGLE", "")
GID_META = getattr(cfg, "GID_META", "")
GID_LEADS = getattr(cfg, "GID_LEADS", "")
FUNNEL_SIGLA = getattr(cfg, "FUNNEL_SIGLA", "")
META_TAX_FACTOR = getattr(cfg, "META_TAX_FACTOR", 1.0) or 1.0
CLIENT_NAME = cfg.CLIENT_NAME
CLIENT_SUB = getattr(cfg, "CLIENT_SUB", "")
TAX_LABEL = getattr(cfg, "TAX_LABEL", "Imposto")
CPL_TARGET = getattr(cfg, "CPL_TARGET", 0.0)
CONV_TARGET = getattr(cfg, "CONV_TARGET", 0.0)
REPORT_BAND_LOW = getattr(cfg, "REPORT_BAND_LOW", 0.70)
REPORT_BAND_HIGH = getattr(cfg, "REPORT_BAND_HIGH", 1.30)
IA_WORKER_URL = getattr(cfg, "IA_WORKER_URL", "")


def sheet_url(sid: str, gid: str, name: str) -> str | None:
    """gid preenchido -> export CSV pelo gid; senão -> gviz CSV pelo NOME da aba.
    Sem gid e sem nome -> None (fonte desligada)."""
    if gid:
        return f"https://docs.google.com/spreadsheets/d/{sid}/export?format=csv&gid={gid}"
    if not name:
        return None
    return (f"https://docs.google.com/spreadsheets/d/{sid}/gviz/tq?tqx=out:csv&headers=1"
            f"&sheet={urllib.parse.quote(name)}")


GOOGLE_CSV_URL = sheet_url(SPREADSHEET_ID, GID_GOOGLE, SHEET_GOOGLE)
META_CSV_URL = sheet_url(SPREADSHEET_ID, GID_META, SHEET_META)
LEADS_CSV_URL = sheet_url(SPREADSHEET_ID_LEADS, GID_LEADS, SHEET_LEADS)
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


def load_rows(url: str | None, local: str | None) -> list[list[str]]:
    if local:
        return read_csv_file(local)
    return fetch_csv(url) if url else []


def in_funnel(camp: str) -> bool:
    """Campanha da sigla do funil: começa com a SIGLA seguida de separador
    (DM_SEARCH_..., DM | E2-CAP | ..., DM-..., DM ...)."""
    if not FUNNEL_SIGLA:
        return True
    return re.match(rf"\s*{re.escape(norm(FUNNEL_SIGLA))}(?:[\s_|\-]|$)", norm(camp)) is not None


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
def process(google_rows, meta_rows, lead_rows):
    ads = []
    ad_links = {}   # anúncio do Meta -> permalink do criativo (Instagram)

    # ---------------- Aba GOOGLE ADS ----------------
    # Colunas reais: Day · Campaign Name · Ad Group Name · Cost (Spend) · Impressions · Clicks
    gheader = google_rows[0] if google_rows else []
    gidx = header_index(
        gheader,
        {"day": ["day", "data", "dia"], "campaign": ["campaign name", "campaign", "campanha"],
         "adset": ["ad group name", "ad group", "grupo de anuncios"],
         "spent": ["cost (spend)", "cost", "spend", "custo", "gasto"],
         "impr": ["impressions", "impress"],
         "clicks": ["clicks", "cliques"]},
        {"day": 0, "campaign": 1, "adset": 2, "spent": 3, "impr": 4, "clicks": 5},
    )
    camp_map = {}    # campanha Google normalizada -> nome real
    group_map = {}   # (campanha normalizada, slug do grupo) -> nome real do grupo
    for row in google_rows[1:]:
        if not any((c or "").strip() for c in row):
            continue
        camp = cell(row, gidx["campaign"])
        if not camp or not in_funnel(camp):
            continue
        adset = cell(row, gidx["adset"]) or "(sem grupo)"
        camp_map.setdefault(norm(camp), camp)
        group_map.setdefault((norm(camp), slug(adset)), adset)
        ads.append({
            "p": "g", "d": parse_date(cell(row, gidx["day"])),
            "camp": camp, "adset": adset, "ad": "",
            "sp": round(to_float(cell(row, gidx["spent"])), 4),
            "im": to_float(cell(row, gidx["impr"])),
            "cl": to_float(cell(row, gidx["clicks"])),
            "cv": 0,
        })

    # ---------------- Aba META ADS ----------------
    # Colunas reais: Day · Campaign Name · Ad Set Name · Ad Name · Impressions · Link Clicks ·
    #   Messaging Conversations Started · Amount Spent · Creative Instagram Permalink
    mheader = meta_rows[0] if meta_rows else []
    midx = header_index(
        mheader,
        {"day": ["day", "data", "dia"], "campaign": ["campaign name", "campaign", "campanha"],
         "adset": ["ad set name", "adset", "conjunto"], "ad": ["ad name", "anuncio"],
         "spent": ["amount spent", "valor gasto", "gasto", "spend"],
         "impr": ["impressions", "impress"],
         "clicks": ["link clicks", "cliques no link", "clicks"],
         "conv": ["messaging conversations started", "conversas por mensagem iniciadas",
                  "conversations started", "conversas"],
         "link": ["creative instagram permalink", "instagram permalink", "permalink"]},
        {"day": 0, "campaign": 1, "adset": 2, "ad": 3, "impr": 4, "clicks": 5, "conv": 6, "spent": 7},
    )
    for row in meta_rows[1:]:
        if not any((c or "").strip() for c in row):
            continue
        camp = cell(row, midx["campaign"])
        if not camp or not in_funnel(camp):
            continue
        ad = cell(row, midx["ad"]) or "(sem anúncio)"
        link = cell(row, midx["link"])
        if link.startswith(("http://", "https://")) and ad not in ad_links:
            ad_links[ad] = link
        ads.append({
            "p": "m", "d": parse_date(cell(row, midx["day"])),
            "camp": camp, "adset": cell(row, midx["adset"]) or "(sem conjunto)", "ad": ad,
            "sp": round(to_float(cell(row, midx["spent"])), 4),
            "im": to_float(cell(row, midx["impr"])),
            "cl": to_float(cell(row, midx["clicks"])),
            "cv": to_float(cell(row, midx["conv"])),
        })

    # ---------------- Aba LEADS ----------------
    # Colunas reais: Data e hora · Nome · Telefone · Plataforma · Captura · Quando precisa ·
    #   Pessoas · Motivo · utm_source · utm_medium · utm_campaign · utm_content · utm_term ·
    #   Click ID · Status · Data do pernoite · Valor · Responsável · Observações
    lheader = lead_rows[0] if lead_rows else []
    lidx = header_index(
        lheader,
        {"created": ["data e hora", "data", "created"],
         "name": ["nome", "name"],
         "plat": ["plataforma"],
         "status": ["status"],
         "utm_source": ["utm_source", "utm source"],
         "utm_medium": ["utm_medium", "utm medium"],
         "utm_campaign": ["utm_campaign", "utm campaign"]},
        {"created": 0, "name": 1},
    )
    leads = []
    for row in lead_rows[1:]:
        if not any((c or "").strip() for c in row):
            continue
        if is_test_row(" ".join(str(c) for c in row)):
            continue
        name = cell(row, lidx["name"])
        if is_test_name(name):
            continue
        d = parse_date(cell(row, lidx["created"]))
        if not d:
            continue
        ucamp = cell(row, lidx["utm_campaign"])
        umed = cell(row, lidx["utm_medium"])
        usrc = cell(row, lidx["utm_source"])
        real_camp = camp_map.get(norm(ucamp)) if ucamp else None
        if real_camp:
            # Lead atribuído ao Google Ads: herda campanha/grupo REAIS (mesma linha do gasto)
            camp, adset, plat = real_camp, group_map.get((norm(ucamp), slug(umed)), umed or "(sem grupo)"), "g"
        else:
            camp, adset, plat = ucamp or "(sem campanha)", umed or "(sem grupo)", ""
        leads.append({
            "p": plat, "d": d, "camp": camp, "adset": adset,
            "src": usrc or cell(row, lidx["plat"]) or "Orgânico / direto",
            "st": cell(row, lidx["status"]) or "—",
            "nm": first_last_initial(name),
        })

    dates = sorted({x["d"] for x in ads + leads if x["d"]})
    now_brt = datetime.now(BRT)
    return {
        "build": {
            "generated_at_brt": now_brt.strftime("%d/%m/%Y %H:%M"),
            "build_id": datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S"),
            "today": now_brt.strftime("%Y-%m-%d"),
            "date_min": dates[0] if dates else None,
            "date_max": dates[-1] if dates else None,
            "meta_tax_factor": META_TAX_FACTOR,
            "client_name": CLIENT_NAME,
            "client_sub": CLIENT_SUB,
            "tax_label": TAX_LABEL,
            "ia_worker_url": IA_WORKER_URL,
            "cpl_target": CPL_TARGET,
            "conv_target": CONV_TARGET,
            "report_band_low": REPORT_BAND_LOW,
            "report_band_high": REPORT_BAND_HIGH,
        },
        "ads": ads,
        "leads": leads,
        "ad_links": ad_links,
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
    ap.add_argument("--google-file", help="CSV da aba Google Ads (teste local)")
    ap.add_argument("--meta-file", help="CSV da aba Meta Ads (teste local)")
    ap.add_argument("--leads-file", help="CSV da aba Leads (teste local)")
    ap.add_argument("--template", default="build/template.html")
    ap.add_argument("--out", default="dist/index.html")
    args = ap.parse_args()

    google_rows = load_rows(GOOGLE_CSV_URL, args.google_file)
    meta_rows = load_rows(META_CSV_URL, args.meta_file)
    lead_rows = load_rows(LEADS_CSV_URL, args.leads_file)
    data = process(google_rows, meta_rows, lead_rows)

    # Proteção: não publica uma dashboard vazia se a leitura falhar.
    n_g = sum(1 for a in data["ads"] if a["p"] == "g")
    n_m = sum(1 for a in data["ads"] if a["p"] == "m")
    if GOOGLE_CSV_URL and not n_g:
        sys.exit("ERRO: nenhuma linha do Google Ads lida (aba/colunas/sigla do funil?). Build abortado.")
    if META_CSV_URL and not n_m:
        sys.exit("ERRO: nenhuma linha do Meta Ads lida (aba/colunas/sigla do funil?). Build abortado.")

    briefings_path = os.path.join(os.path.dirname(os.path.abspath(args.template)), "relatorios.json")
    data["briefings"] = load_briefings(briefings_path)

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        f.write(render(data, args.template))

    b = data["build"]
    sp = lambda p: sum(a["sp"] for a in data["ads"] if a["p"] == p)
    conv_m = sum(a["cv"] for a in data["ads"] if a["p"] == "m")
    leads_g = sum(1 for l in data["leads"] if l["p"] == "g")
    print("== build ok ==", file=sys.stderr)
    print(f"  periodo : {b['date_min']} -> {b['date_max']}", file=sys.stderr)
    print(f"  google  : {n_g} linhas · Gasto R$ {sp('g'):,.2f} · {leads_g} leads atribuídos", file=sys.stderr)
    print(f"  meta    : {n_m} linhas · Gasto R$ {sp('m'):,.2f} (c/ imposto ×{META_TAX_FACTOR}: R$ {sp('m')*META_TAX_FACTOR:,.2f}) · {conv_m:.0f} conversas", file=sys.stderr)
    print(f"  leads   : {len(data['leads'])} na planilha de Leads", file=sys.stderr)
    print(f"  out     : {args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
