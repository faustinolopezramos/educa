"""Render a report as a professional-looking PDF (reportlab / platypus).

The layout mirrors the on-screen report — KPI row, attendance by course,
students at risk — in a print-ready A4 document with a branded header and a
page footer. Colours match the app's indigo brand palette.
"""

from __future__ import annotations

import io
from datetime import date, datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.lib.enums import TA_CENTER
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

from app.services.reports import Report

# Brand palette (Tailwind "brand" indigo used across the app).
BRAND = colors.HexColor("#4f46e5")
BRAND_DARK = colors.HexColor("#4338ca")
BRAND_TINT = colors.HexColor("#eef2ff")
INK = colors.HexColor("#1e293b")
MUTED = colors.HexColor("#64748b")
DANGER = colors.HexColor("#dc2626")
DANGER_TINT = colors.HexColor("#fef2f2")
LINE = colors.HexColor("#e2e8f0")

PERIOD_LABEL = {"day": "Reporte diario", "week": "Reporte semanal", "month": "Reporte mensual"}


def _pct(rate: float | None) -> str:
    return "—" if rate is None else f"{round(rate * 100)}%"


def _num(value: object) -> str:
    return "—" if value is None else str(value)


def _styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "h2": ParagraphStyle(
            "h2", parent=base["Heading2"], textColor=INK, fontSize=12, spaceBefore=6,
            spaceAfter=6,
        ),
        "kpi_value": ParagraphStyle(
            "kpi_value", alignment=TA_CENTER, fontName="Helvetica-Bold", fontSize=18,
            textColor=BRAND_DARK, leading=20,
        ),
        "kpi_label": ParagraphStyle(
            "kpi_label", alignment=TA_CENTER, fontName="Helvetica", fontSize=8,
            textColor=MUTED, leading=10,
        ),
        "cell": ParagraphStyle("cell", fontName="Helvetica", fontSize=9, textColor=INK),
        "muted": ParagraphStyle("muted", fontName="Helvetica", fontSize=9, textColor=MUTED),
    }


def _kpi_row(report: Report, st: dict[str, ParagraphStyle]) -> Table:
    cells = [
        (f"{report.sessions_held}/{report.sessions_total}", "Sesiones realizadas"),
        (_pct(report.attendance_rate), "Asistencia"),
        (_num(report.grades_recorded), "Notas del día"),
        (_num(report.grade_average), "Promedio"),
    ]
    row_values = [Paragraph(v, st["kpi_value"]) for v, _ in cells]
    row_labels = [Paragraph(lbl, st["kpi_label"]) for _, lbl in cells]
    table = Table([row_values, row_labels], colWidths=[42 * mm] * 4)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), BRAND_TINT),
                ("BOX", (0, 0), (-1, -1), 0.5, LINE),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.white),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, 0), 10),
                ("BOTTOMPADDING", (0, 1), (-1, 1), 10),
            ]
        )
    )
    return table


def _data_table(headers: list[str], rows: list[list[str]], header_bg, widths) -> Table:
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), header_bg),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("TEXTCOLOR", (0, 1), (-1, -1), INK),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ]
    # Zebra striping on the body rows.
    for i in range(1, len(rows) + 1):
        if i % 2 == 0:
            style.append(("BACKGROUND", (0, i), (-1, i), colors.HexColor("#f8fafc")))
    table = Table([headers, *rows], colWidths=widths, repeatRows=1)
    table.setStyle(TableStyle(style))
    return table


def build_report_pdf(report: Report) -> bytes:
    buffer = io.BytesIO()
    st = _styles()
    generated = datetime.now().strftime("%d/%m/%Y %H:%M")
    title = PERIOD_LABEL.get(report.period, "Reporte")

    def _decorate(canvas, doc) -> None:
        canvas.saveState()
        width, height = A4
        # Header band.
        canvas.setFillColor(BRAND)
        canvas.rect(0, height - 26 * mm, width, 26 * mm, stroke=0, fill=1)
        canvas.setFillColor(colors.white)
        canvas.setFont("Helvetica-Bold", 16)
        canvas.drawString(18 * mm, height - 15 * mm, "Educa")
        canvas.setFont("Helvetica", 11)
        canvas.drawString(18 * mm, height - 21 * mm, title)
        canvas.setFont("Helvetica", 9)
        canvas.drawRightString(
            width - 18 * mm,
            height - 15 * mm,
            f"{report.date_from.isoformat()}  a  {report.date_to.isoformat()}",
        )
        # Footer.
        canvas.setFillColor(MUTED)
        canvas.setFont("Helvetica", 8)
        canvas.drawString(18 * mm, 12 * mm, f"Generado el {generated}")
        canvas.drawRightString(width - 18 * mm, 12 * mm, f"Página {doc.page}")
        canvas.setStrokeColor(LINE)
        canvas.line(18 * mm, 15 * mm, width - 18 * mm, 15 * mm)
        canvas.restoreState()

    doc = BaseDocTemplate(
        buffer,
        pagesize=A4,
        topMargin=34 * mm,
        bottomMargin=20 * mm,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        title=f"Educa — {title}",
    )
    frame = Frame(
        doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="body"
    )
    doc.addPageTemplates([PageTemplate(id="main", frames=[frame], onPage=_decorate)])

    story: list = [_kpi_row(report, st), Spacer(1, 8 * mm)]

    story.append(Paragraph("Asistencia por curso", st["h2"]))
    if report.attendance_by_course:
        rows = [
            [c.course_name, str(c.present), str(c.total), _pct(c.rate)]
            for c in report.attendance_by_course
        ]
        story.append(
            _data_table(
                ["Curso", "Presentes", "Total", "Tasa"],
                rows,
                BRAND,
                [80 * mm, 28 * mm, 28 * mm, 28 * mm],
            )
        )
    else:
        story.append(Paragraph("Sin registros en el periodo.", st["muted"]))
    story.append(Spacer(1, 8 * mm))

    story.append(Paragraph("Alumnos en riesgo", st["h2"]))
    if report.at_risk:
        rows = [
            [
                r.student_name,
                r.course_name,
                _pct(r.attendance_rate),
                _num(r.average),
                ", ".join(r.reasons),
            ]
            for r in report.at_risk
        ]
        story.append(
            _data_table(
                ["Alumno", "Curso", "Asistencia", "Promedio", "Motivos"],
                rows,
                DANGER,
                [42 * mm, 42 * mm, 22 * mm, 22 * mm, 36 * mm],
            )
        )
    else:
        story.append(Paragraph("Nadie en riesgo este periodo.", st["muted"]))

    doc.build(story)
    return buffer.getvalue()
