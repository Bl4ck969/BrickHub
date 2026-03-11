"""
PDF generation service:
- Label sheets (Schilder): 6 labels per A4 page, no gaps, rectangular
- Set list PDF export: A4 landscape with logo, cover images, white headers
"""
import io
import os
from datetime import datetime
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Flowable,
)
from reportlab.platypus import Image as RLImage
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER


class _CloudIcon(Flowable):
    """Kleines Cloud-Icon (3mm) als klickbares Symbol in der PDF-Tabelle."""

    def __init__(self, size=3*mm, color="#2563EB", url=None):
        super().__init__()
        self.width = size
        self.height = size * 0.65
        self.icon_color = color
        self.url = url

    def draw(self):
        c = self.canv
        s = self.width  # Referenzgröße
        col = colors.HexColor(self.icon_color)
        c.setFillColor(col)
        c.setStrokeColor(col)
        c.setLineWidth(0)
        # Drei Kreise + Rechteck-Basis = saubere Wolke
        r1 = s * 0.22
        r2 = s * 0.28
        r3 = s * 0.20
        base_y = self.height * 0.30
        c.circle(s * 0.28, base_y + r1 * 0.6, r1, fill=1, stroke=0)
        c.circle(s * 0.52, base_y + r2 * 0.8, r2, fill=1, stroke=0)
        c.circle(s * 0.76, base_y + r3 * 0.5, r3, fill=1, stroke=0)
        c.rect(s * 0.08, base_y - r1 * 0.3, s * 0.84, r1 * 0.9, fill=1, stroke=0)
        if self.url:
            c.linkURL(self.url, (0, 0, self.width, self.height), relative=1)

from PIL import Image as PILImage
from app.config import settings

# Pfad zum Logo (frontend/public/logo.png – RGBA mit Transparenz)
_LOGO_PATH = Path(__file__).parent.parent.parent.parent / "frontend" / "public" / "logo.png"


def _logo_reader() -> ImageReader | None:
    """Gibt einen ImageReader mit korrektem Alpha-Kanal zurück."""
    if not _LOGO_PATH.exists():
        return None
    try:
        img = PILImage.open(str(_LOGO_PATH)).convert("RGBA")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        return ImageReader(buf)
    except Exception:
        return None

# ─── Label-Dimensionen ────────────────────────────────────────────────────────
# 6 Schilder pro A4 (2 Spalten x 3 Reihen), kein Abstand
# A4: 210 x 297 mm → je 100mm breit, 89mm hoch + 10mm Header
LABEL_WIDTH  = 100 * mm
LABEL_HEIGHT = 89  * mm
PAGE_MARGIN  = 5   * mm
HEADER_H     = 13  * mm


# ─── Einlagerungsschilder ─────────────────────────────────────────────────────

def _draw_label(c: canvas.Canvas, x: float, y: float, label_data: dict):
    """Zeichnet ein einzelnes Schild – rechteckig, kein roundRect."""
    c.setStrokeColor(colors.HexColor("#1E3A5F"))
    c.setLineWidth(0.8)
    c.rect(x, y, LABEL_WIDTH, LABEL_HEIGHT)

    padding = 4 * mm
    inner_x = x + padding
    inner_w  = LABEL_WIDTH - 2 * padding

    # Bild (obere 65% des Schildes)
    img_h  = LABEL_HEIGHT * 0.63
    img_top = y + LABEL_HEIGHT - padding

    thumb_path = label_data.get("thumbnail")
    if thumb_path and os.path.exists(thumb_path):
        try:
            img = ImageReader(thumb_path)
            iw, ih = img.getSize()
            ratio = min(inner_w / iw, img_h / ih)
            dw, dh = iw * ratio, ih * ratio
            img_x = inner_x + (inner_w - dw) / 2
            c.drawImage(img, img_x, img_top - dh,
                        width=dw, height=dh, preserveAspectRatio=True, mask='auto')
        except Exception:
            pass

    # Trennlinie
    sep_y = y + LABEL_HEIGHT * 0.30
    c.setStrokeColor(colors.HexColor("#E5E7EB"))
    c.setLineWidth(0.4)
    c.line(inner_x, sep_y, inner_x + inner_w, sep_y)

    # Text (unterer Bereich, von oben nach unten)
    cy = sep_y - 4.5 * mm

    name = label_data.get("name", "")
    if len(name) > 26:
        name = name[:23] + "…"
    c.setFont("Helvetica-Bold", 8)
    c.setFillColor(colors.HexColor("#1E3A5F"))
    c.drawCentredString(x + LABEL_WIDTH / 2, cy, name)

    cy -= 4.5 * mm
    c.setFont("Helvetica", 7)
    c.setFillColor(colors.HexColor("#444444"))
    c.drawCentredString(x + LABEL_WIDTH / 2, cy, label_data.get("manufacturer", ""))

    cy -= 4 * mm
    c.drawCentredString(x + LABEL_WIDTH / 2, cy, label_data.get("stone_size", ""))

    # Tüten-/Plattenaufschrift (ganz unten)
    c.setFont("Helvetica-Bold", 9)
    c.setFillColor(colors.HexColor("#1E3A5F"))
    c.drawCentredString(x + LABEL_WIDTH / 2, y + 3.5 * mm, label_data.get("bag_label", ""))


def generate_label_pdf(labels_data: list[dict]) -> bytes:
    """Erzeugt Einlagerungsschilder: 6 pro A4-Seite, rechteckig, kein Abstand."""
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    page_w, page_h = A4

    labels_per_page = 6  # 2 x 3
    pages = (len(labels_data) + labels_per_page - 1) // labels_per_page

    for page_idx in range(pages):
        if page_idx > 0:
            c.showPage()

        page_labels = labels_data[page_idx * labels_per_page:(page_idx + 1) * labels_per_page]

        # Header-Streifen
        c.setFillColor(colors.HexColor("#1E3A5F"))
        c.rect(0, page_h - HEADER_H, page_w, HEADER_H, fill=True, stroke=False)

        # Logo-Bild
        logo_img = _logo_reader()
        if logo_img:
            try:
                logo_h = HEADER_H - 2 * mm
                c.drawImage(logo_img, PAGE_MARGIN, page_h - HEADER_H + 1 * mm,
                            width=logo_h, height=logo_h, preserveAspectRatio=True, mask='auto')
            except Exception:
                pass

        c.setFont("Helvetica-Bold", 9)
        c.setFillColor(colors.HexColor("#FFD700"))
        c.drawString(PAGE_MARGIN + 12 * mm, page_h - HEADER_H + 3.5 * mm, "BrickHub")

        c.setFont("Helvetica", 8)
        c.setFillColor(colors.white)
        c.drawCentredString(page_w / 2, page_h - HEADER_H + 3.5 * mm, "Einlagerungsschilder")

        c.setFont("Helvetica", 7)
        c.drawRightString(page_w - PAGE_MARGIN,
                          page_h - HEADER_H + 3.5 * mm,
                          datetime.now().strftime("%d.%m.%Y"))

        # Schilder-Grid (direkt aneinandergrenzend, kein Abstand)
        start_y = page_h - HEADER_H - LABEL_HEIGHT

        for i, label in enumerate(page_labels):
            col = i % 2
            row = i // 2
            lx = PAGE_MARGIN + col * LABEL_WIDTH
            ly = start_y - row * LABEL_HEIGHT
            _draw_label(c, lx, ly, label)

    c.save()
    buffer.seek(0)
    return buffer.read()


# ─── Setliste PDF (Querformat A4) ─────────────────────────────────────────────

def _thumbnail_cell(thumb_path: str, max_w: float, max_h: float):
    """Gibt ein RLImage zurück oder einen Strich-Paragraph."""
    dash = ParagraphStyle("D", fontSize=7, alignment=TA_CENTER)
    if not thumb_path or not os.path.exists(thumb_path):
        return Paragraph("–", dash)
    try:
        from PIL import Image as PILImage
        with PILImage.open(thumb_path) as img:
            iw, ih = img.size
        ratio = min(max_w / iw, max_h / ih)
        return RLImage(thumb_path, width=iw * ratio, height=ih * ratio)
    except Exception:
        return Paragraph("–", dash)


def generate_sets_list_pdf(sets: list, title: str = "BrickHub – Setliste") -> bytes:
    """Setzt-Liste als A4-Querformat mit Logo, Covers, weißen Spaltenköpfen."""
    buffer   = io.BytesIO()
    pagesize = landscape(A4)
    page_w, page_h = pagesize

    MLR = 12 * mm   # linker/rechter Rand
    MT  = 24 * mm   # oben (Platz für Header)
    MB  = 12 * mm   # unten

    doc = SimpleDocTemplate(
        buffer, pagesize=pagesize,
        leftMargin=MLR, rightMargin=MLR,
        topMargin=MT, bottomMargin=MB,
    )

    # ── Seitenheader-Funktion ──────────────────────────────────────────────
    def _header(cv, doc_obj):
        cv.saveState()

        # Navy-Balken
        cv.setFillColor(colors.HexColor("#1E3A5F"))
        cv.rect(0, page_h - 20 * mm, page_w, 20 * mm, fill=True, stroke=False)

        # Logo-Bild (echte Logo.png)
        logo_drawn = False
        logo_img = _logo_reader()
        if logo_img:
            try:
                logo_size = 14 * mm
                cv.drawImage(logo_img,
                             MLR,
                             page_h - 18 * mm,
                             width=logo_size, height=logo_size,
                             preserveAspectRatio=True, mask='auto')
                logo_drawn = True
            except Exception:
                pass

        x_text = MLR + (17 * mm if logo_drawn else 0)

        # "BrickHub" in Gelb
        cv.setFont("Helvetica-Bold", 13)
        cv.setFillColor(colors.HexColor("#FFD700"))
        cv.drawString(x_text, page_h - 12 * mm, "BrickHub")

        # Titel in Weiß
        cv.setFont("Helvetica", 10)
        cv.setFillColor(colors.white)
        cv.drawCentredString(page_w / 2, page_h - 12 * mm, title)

        # Datum rechts
        cv.setFont("Helvetica", 8)
        cv.drawRightString(page_w - MLR, page_h - 12 * mm,
                           datetime.now().strftime("%d.%m.%Y %H:%M"))

        cv.restoreState()

    # ── Spalten (Querformat nutzbar: 297-2*12 = 273mm) ────────────────────
    col_widths = [
        16 * mm,   # Front
        16 * mm,   # Back
        48 * mm,   # Name
        30 * mm,   # Hersteller
        16 * mm,   # Nr.
        14 * mm,   # Teile
        26 * mm,   # Steinart
        24 * mm,   # Kategorie
        20 * mm,   # Status
        22 * mm,   # Kiste
        17 * mm,   # Preis
        8  * mm,   # OneDrive
    ]
    headers = ["Front", "Back", "Name", "Hersteller", "Nr.", "Teile",
               "Steinart", "Kategorie", "Status", "Kiste", "Preis (€)", "OD"]

    hdr_s  = ParagraphStyle("H", fontName="Helvetica-Bold", fontSize=7,
                             leading=9, textColor=colors.white)
    cell_s = ParagraphStyle("C", fontSize=6.5, leading=8.5)

    TW, TH = 13 * mm, 17 * mm   # Thumbnail-Maxgröße in der Tabelle

    def _row(s):
        od_url = getattr(s, "onedrive_url", None)
        od_cell = _CloudIcon(size=3*mm, url=od_url) if od_url else Paragraph("–", cell_s)
        return [
            _thumbnail_cell(s.frontcover_thumbnail, TW, TH),
            _thumbnail_cell(s.backcover_thumbnail,  TW, TH),
            Paragraph(s.name or "–", cell_s),
            Paragraph(s.manufacturer or "–", cell_s),
            Paragraph(s.manufacturer_number or "–", cell_s),
            Paragraph(str(s.parts_count or "–"), cell_s),
            Paragraph(s.stone_size or "–", cell_s),
            Paragraph(f"{s.category or '–'} / {s.subcategory or '–'}", cell_s),
            Paragraph(s.status or "–", cell_s),
            Paragraph(s.box.name if s.box else "–", cell_s),
            Paragraph(f"{s.price:.2f} €" if s.price is not None else "–", cell_s),
            od_cell,
        ]

    data = [[Paragraph(h, hdr_s) for h in headers]]
    for s in sets:
        data.append(_row(s))

    table = Table(data, colWidths=col_widths, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND",     (0, 0), (-1, 0),  colors.HexColor("#1E3A5F")),
        ("TEXTCOLOR",      (0, 0), (-1, 0),  colors.white),
        ("GRID",           (0, 0), (-1, -1), 0.4, colors.HexColor("#CCCCCC")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F5F7FA")]),
        ("VALIGN",         (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN",          (0, 0), (1,  -1), "CENTER"),
        ("ALIGN",          (11, 0), (11, -1), "CENTER"),
        ("TOPPADDING",     (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING",  (0, 0), (-1, -1), 2),
        ("LEFTPADDING",    (0, 0), (-1, -1), 3),
        ("RIGHTPADDING",   (0, 0), (-1, -1), 3),
    ]))

    total_price = sum(s.price or 0 for s in sets)
    total_parts = sum(s.parts_count or 0 for s in sets)
    sum_s = ParagraphStyle("S", fontSize=8, fontName="Helvetica-Bold",
                            textColor=colors.HexColor("#1E3A5F"))

    story = [
        table,
        Spacer(1, 4 * mm),
        Paragraph(
            f"Gesamt: {len(sets)} Sets  ·  {total_parts:,} Teile  ·  {total_price:.2f} €",
            sum_s,
        ),
    ]

    doc.build(story, onFirstPage=_header, onLaterPages=_header)
    buffer.seek(0)
    return buffer.read()
