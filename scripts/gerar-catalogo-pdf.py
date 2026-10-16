"""Gera o PDF privado da coleção a partir do cadastro e da pesquisa existentes."""
from __future__ import annotations

import io
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tmp/pdfs/deps"))

from PIL import Image as PILImage
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    HRFlowable, Image, KeepTogether, PageBreak, Paragraph, SimpleDocTemplate,
    Spacer, Table, TableStyle,
)
from reportlab.pdfgen import canvas
from pypdf import PdfReader
import pymupdf as fitz

OUT = ROOT / "output/pdf/catalogo-up-personaliza-precos-descricoes.pdf"
PREVIEW = ROOT / "tmp/pdfs/preview"
OUT.parent.mkdir(parents=True, exist_ok=True)
PREVIEW.mkdir(parents=True, exist_ok=True)
catalog = json.loads((ROOT / "catalog/personalizados.json").read_text(encoding="utf-8"))
models = list(catalog["models"])
groups = {group["id"]: group for group in catalog["groups"]}
assert len(models) > 0
as_of = max(model["pricingResearch"]["asOf"] for model in models)
date_label = datetime.strptime(as_of, "%Y-%m-%d").strftime("%d/%m/%Y")

font, bold = "Helvetica", "Helvetica-Bold"
if Path("C:/Windows/Fonts/arial.ttf").exists():
    pdfmetrics.registerFont(TTFont("UPText", "C:/Windows/Fonts/arial.ttf"))
    pdfmetrics.registerFont(TTFont("UPBold", "C:/Windows/Fonts/arialbd.ttf"))
    font, bold = "UPText", "UPBold"
pdfmetrics.registerFontFamily(font, normal=font, bold=bold, italic=font, boldItalic=bold)

INK = colors.HexColor("#171718")
GREEN = colors.HexColor("#34751b")
PALE = colors.HexColor("#edf5e7")
MUTED = colors.HexColor("#626262")
LINE = colors.HexColor("#d6d6d6")
W, H = A4
# The document frame adds 6 pt of padding on each side of the 42 pt margins.
BODY_WIDTH = W - 96

def style(name, size=9.2, leading=13, **kwargs):
    options = dict(fontName=font, fontSize=size, leading=leading, textColor=INK, spaceAfter=6)
    options.update(kwargs)
    return ParagraphStyle(name, **options)

styles = {
    "title": style("title", 26, 30, fontName=bold, spaceBefore=2),
    "subtitle": style("subtitle", 13, 17, fontName=bold),
    "body": style("body"),
    "small": style("small", 8, 11, textColor=MUTED),
    "tiny": style("tiny", 7.3, 9.5, textColor=MUTED),
    "label": style("label", 8, 11, fontName=bold, textColor=GREEN),
    "product": style("product", 13, 16, fontName=bold),
    "table": style("table", 8.1, 10.4, spaceAfter=0),
    "tableSmall": style("tableSmall", 7.7, 10.2, spaceAfter=0),
    "tableHead": style("tableHead", 7.6, 10, fontName=bold, spaceAfter=0),
    "right": style("right", 8.3, 11, alignment=TA_RIGHT, spaceAfter=0),
}

def clean(value):
    return re.sub(r"[\u2010-\u2015]", "-", str(value))

def p(value, kind="body"):
    return Paragraph(escape(clean(value)).replace("\n", "<br/>"), styles[kind])

def money(cents):
    if cents is None:
        return "A definir"
    return "R$ " + f"{cents / 100:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

def png_image(file, width, height):
    source = PILImage.open(file).convert("RGB")
    source.thumbnail((800, 800), PILImage.Resampling.LANCZOS)
    buffer = io.BytesIO()
    source.save(buffer, format="JPEG", quality=90, subsampling=0, optimize=True)
    buffer.seek(0)
    return Image(buffer, width=width, height=height, kind="proportional")

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.states = []

    def showPage(self):
        self.states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        total = len(self.states)
        for state in self.states:
            self.__dict__.update(state)
            self.setFillColor(MUTED)
            self.setFont(font, 7)
            self.drawString(42, 25, "UP Personaliza | Preços de referência; produção e condições a confirmar")
            self.drawRightString(W - 42, 25, f"{self._pageNumber} / {total}")
            super().showPage()
        super().save()

def page_header(c, doc):
    c.saveState()
    c.drawImage(ImageReader(str(ROOT / "public/assets/branding/up-symbol.png")), 42, H - 38,
                width=43, height=16, preserveAspectRatio=True, mask="auto")
    c.drawImage(ImageReader(str(ROOT / "public/assets/branding/up-wordmark.png")), 90, H - 36,
                width=107, height=17, preserveAspectRatio=True, mask="auto")
    c.setFont(font, 7.5)
    c.setFillColor(MUTED)
    c.drawRightString(W - 42, H - 31, "Pesquisa de " + date_label)
    c.setStrokeColor(LINE)
    c.line(42, H - 47, W - 42, H - 47)
    c.restoreState()

def price_table(model, width):
    research = model["pricingResearch"]
    unit = "kit" if groups[model["familyId"]]["unit"] == "kit" else "unidade"
    tiers = [(1, research["retailTargetCents"])] + [
        (tier["minimumQuantity"], tier["unitTargetCents"]) for tier in research["bulkTargets"]
    ]
    rows = [[p("Quantidade de referência", "tableHead"), p("Preço por " + unit, "tableHead"), p("Total do lote", "tableHead")]]
    for quantity, cents in tiers:
        quantity_label = f"1 {unit} (varejo)" if quantity == 1 else ("Acima de 10 unidades\n(11 ou mais)" if model.get("providedPricing") else f"{quantity} unidades")
        rows.append([p(quantity_label, "tableSmall"), p(money(cents), "right"),
                     p(money(cents * quantity if cents is not None else None), "right")])
    table = Table(rows, colWidths=[width * .39, width * .30, width * .31], hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), PALE),
        ("GRID", (0, 0), (-1, -1), .4, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return table

def product_card(model):
    image_path = ROOT / "public" / model["images"][-1]["src"].lstrip("/")
    image_col = 145
    text_col = BODY_WIDTH - image_col - 20
    left = [png_image(image_path, 133, 133), Spacer(1, 7),
            p("Imagem de conceito gerada por IA.", "tiny"),
            p("Produção, medidas e disponibilidade a confirmar.", "tiny")]
    right = [p(model["sku"] + " | " + groups[model["familyId"]]["name"], "label"),
             p(model["title"], "product"), p(model["description"]), Spacer(1, 3),
             price_table(model, text_col)]
    if model["pricingResearch"]["retailTargetCents"] is None:
        note = "Preço pendente: confirmar quantidade de mexedores, marcadores, caixa e acabamento por kit."
    elif model.get("providedPricing"):
        note = "Preços informados na atualização. Acima de 10 unidades significa 11 ou mais do mesmo modelo. Não combinar modelos diferentes; produção e entrega a confirmar."
    elif model["pricingResearch"]["confidence"] == "low":
        note = "Equivalência de mercado baixa: validar protótipo, materiais e custos antes de aprovar estes valores."
    else:
        note = "Sugestões condicionadas à confirmação de materiais, medidas, produção e custos."
    right.extend([Spacer(1, 5), p(note, "tiny")])
    table = Table([[left, right]], colWidths=[image_col, BODY_WIDTH - image_col], hAlign="LEFT")
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (0, -1), 12),
        ("LEFTPADDING", (1, 0), (1, -1), 8),
        ("RIGHTPADDING", (1, 0), (1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return KeepTogether([table])

story = [p("NOVA COLEÇÃO | VAREJO E VOLUME", "label"), p("Preços e descrições", "title"),
         p(f"{len(models)} modelos de presentes, lembranças e decoração personalizados.", "body"),
         p("Valores em reais. Os modelos MP-001, MX-001 e MT-001 usam os preços informados na atualização de " + date_label + "; os demais valores são sugestões da pesquisa. Produção, personalização, disponibilidade e entrega precisam de confirmação.", "small"), Spacer(1, 6)]

summary = [[p("SKU", "tableHead"), p("Produto", "tableHead"), p("Preço unitário", "tableHead"), p("Quantidade e preço por unidade", "tableHead")]]
for model in models:
    research = model["pricingResearch"]
    lots = "\n".join(f"{tier['minimumQuantity']} un.: {money(tier['unitTargetCents'])}/un." for tier in research["bulkTargets"]) or "A definir após confirmar a composição do kit."
    if model.get("providedPricing"):
        lots = f"Acima de 10 unidades:\n{money(model['providedPricing']['bulkUnitCents'])}/un. (11 ou mais)"
    short_sku = model["sku"].replace("UP-PERS-", "").replace("UP-", "")
    summary.append([p(short_sku, "tableSmall"), p(model["title"], "table"),
                    p(money(research["retailTargetCents"]), "tableSmall"), p(lots, "tableSmall")])
table = Table(summary, colWidths=[42, 199, 77, BODY_WIDTH - 318], repeatRows=1)
table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), PALE), ("GRID", (0, 0), (-1, -1), .4, LINE),
    ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ("RIGHTPADDING", (0, 0), (-1, -1), 6), ("TOPPADDING", (0, 0), (-1, -1), 4),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
]))
story.extend([table, Spacer(1, 9), p("SKU abreviado: 01 = UP-PERS-01; MP-001 = UP-MP-001 (mesmo padrão para MX e MT). Preços por unidade; kit contado como kit. Lotes pressupõem o mesmo modelo e personalização-base. Frete, criação especial e embalagem adicional precisam de condições próprias.", "tiny")])

for index in range(0, len(models), 2):
    story.extend([PageBreak(), p("DESCRIÇÕES E SIMULAÇÕES DE LOTES", "label"),
                  p("Modelos da coleção", "subtitle"), Spacer(1, 9), product_card(models[index])])
    if index + 1 < len(models):
        story.extend([Spacer(1, 20), HRFlowable(width="100%", thickness=.5, color=LINE), Spacer(1, 20), product_card(models[index + 1])])

story.extend([PageBreak(), p("CRITÉRIOS E REFERÊNCIAS", "label"), p("Como usar esta tabela", "title"),
              p("As sugestões servem para comparar varejo e lotes. Preços anunciados por concorrentes não comprovam volume de vendas ou rentabilidade. A pesquisa com Exa reuniu 78 resultados em 13 buscas; foram consultadas 17 páginas de vendedores.", "body"),
              p("Antes de aprovar", "subtitle"),
              p("Confirme material, medidas, acabamento, composição, prazo e entrega. O estoque físico dos modelos não foi informado no material recebido. Os três modelos do ZIP de atualização usam os preços fornecidos; os demais preservam os alvos da pesquisa, sujeitos à validação comercial.", "body"),
              p("Lotes com nomes individuais, artes diferentes, embalagem premium ou criação especial exigem orçamento próprio. As quantidades desta tabela são referências de simulação, e não pedidos mínimos de produção já aprovados. Revenda exige conferir também a margem do parceiro.", "body"),
              p("Fontes consultadas na pesquisa", "subtitle")])
report = (ROOT / "exa-results/catalogo-personalizados-2026-10-15/avaliacao-e-precos.md").read_text(encoding="utf-8")
references = list(dict.fromkeys(re.findall(r"\[([^\]]+)\]\((https://[^)]+)\)", report)))
for number, (name, url) in enumerate(references, 1):
    safe_url = escape(url, {'"': '&quot;'})
    domain = re.sub(r"^https://(?:www\.)?([^/]+).*$", r"\1", url)
    story.append(Paragraph(f'<b>{number:02d}.</b> <link href="{safe_url}" color="#34751b">{escape(name)}</link> - {escape(domain)}', styles["small"]))
story.extend([Spacer(1, 6), p("Os links são clicáveis no PDF. Dados e descrições: cadastro local UP Personaliza. Imagens: conceitos do catálogo fornecido; não são fotografias de produtos fabricados. Este documento não confirma capacidade produtiva nem reserva estoque.", "tiny")])

doc = SimpleDocTemplate(str(OUT), pagesize=A4, leftMargin=42, rightMargin=42, topMargin=62, bottomMargin=44,
                        title="UP Personaliza - Preços de referência e descrições da coleção",
                        author="UP Personaliza", subject=f"{len(models)} modelos com varejo, lotes e descrições", pageCompression=1)
doc.build(story, onFirstPage=page_header, onLaterPages=page_header, canvasmaker=NumberedCanvas)

reader = PdfReader(OUT)
text = "\n".join(page.extract_text() for page in reader.pages)
normalized_text = re.sub(r"\s+", " ", text)
for model in models:
    assert model["sku"] in text, model["sku"]
    assert clean(model["title"]) in normalized_text, model["title"]
    assert re.sub(r"\s+", " ", clean(model["description"])) in normalized_text, model["sku"] + " description"
    for cents in [model["pricingResearch"]["retailTargetCents"], *[tier["unitTargetCents"] for tier in model["pricingResearch"]["bulkTargets"]]]:
        assert money(cents) in text, (model["sku"], cents)
assert "Cartões de visita" not in text
expected_pages = 2 + (len(models) + 1) // 2
assert len(reader.pages) == expected_pages, f"Expected {expected_pages} pages; got {len(reader.pages)}"
for excluded in ['Porta-bombom','Medalha','R$ 4,50','R$ 1,80','R$ 2,80']:
    assert excluded not in text, excluded
assert 'Acima de 10 unidades' in text
assert len(reader.pages[-1].get("/Annots", [])) == len(references)

pdf = fitz.open(OUT)
thumbnails = []
for index, page in enumerate(pdf):
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            for span in line["spans"]:
                x0, y0, x1, y1 = span["bbox"]
                assert x0 >= 40 and x1 <= W - 40 and y0 >= 18 and y1 <= H - 18, (index + 1, span["text"], span["bbox"])
    pixmap = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
    file = PREVIEW / f"pagina-{index + 1:02d}.png"
    pixmap.save(file)
    thumb = PILImage.open(file).convert("RGB")
    thumb.thumbnail((300, 425), PILImage.Resampling.LANCZOS)
    thumbnails.append(thumb.copy())
sheet = PILImage.new("RGB", (3 * 320, ((len(thumbnails)+2)//3) * 450), "#dddddd")
for index, thumb in enumerate(thumbnails):
    sheet.paste(thumb, ((index % 3) * 320 + 10, (index // 3) * 450 + 10))
sheet.save(PREVIEW / "visao-geral.png")
manifest = {"file": str(OUT), "pages": len(reader.pages), "models": len(models), "researchDate": as_of,
            "references": len(references), "retailPrices": sum(model["pricingResearch"]["retailTargetCents"] is not None for model in models),
            "bulkTiers": sum(len(model["pricingResearch"]["bulkTargets"]) for model in models), "bytes": OUT.stat().st_size}
(PREVIEW / "verificacao.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(manifest, ensure_ascii=False, indent=2))
