"""A print-ready level-completion certificate (reportlab).

Landscape A4 with a branded border, the student's name centered, the course /
level achieved, the final score, and a verification code in the footer.
"""

from __future__ import annotations

import io
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas as pdfcanvas

BRAND = colors.HexColor("#4f46e5")
BRAND_DARK = colors.HexColor("#4338ca")
INK = colors.HexColor("#1e293b")
MUTED = colors.HexColor("#64748b")
GOLD = colors.HexColor("#b45309")


def build_certificate_pdf(
    *,
    student_name: str,
    course_name: str,
    level_label: str,
    final_score: float,
    code: str,
    issued_at: datetime,
) -> bytes:
    buffer = io.BytesIO()
    width, height = landscape(A4)
    c = pdfcanvas.Canvas(buffer, pagesize=landscape(A4))
    c.setTitle(f"Certificado — {student_name}")

    # Double border.
    c.setStrokeColor(BRAND)
    c.setLineWidth(3)
    c.rect(12 * mm, 12 * mm, width - 24 * mm, height - 24 * mm)
    c.setStrokeColor(colors.HexColor("#c7d2fe"))
    c.setLineWidth(1)
    c.rect(16 * mm, 16 * mm, width - 32 * mm, height - 32 * mm)

    cx = width / 2

    def centered(y: float, text: str, font: str, size: int, color) -> None:
        c.setFillColor(color)
        c.setFont(font, size)
        c.drawCentredString(cx, y, text)

    centered(height - 40 * mm, "Educa", "Helvetica-Bold", 22, BRAND)
    centered(height - 52 * mm, "CERTIFICADO DE APROVECHAMIENTO", "Helvetica", 13, MUTED)

    centered(height - 78 * mm, "Se otorga el presente certificado a", "Helvetica", 12, INK)
    centered(height - 96 * mm, student_name, "Helvetica-Bold", 26, BRAND_DARK)

    centered(
        height - 116 * mm,
        f"por haber completado y aprobado el curso «{course_name}»",
        "Helvetica",
        13,
        INK,
    )
    centered(height - 126 * mm, f"Nivel: {level_label}", "Helvetica", 12, INK)
    centered(
        height - 138 * mm,
        f"Calificación final: {final_score:.2f} / 10",
        "Helvetica-Bold",
        13,
        GOLD,
    )

    # Footer: date (left) and verification code (right).
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 9)
    c.drawString(28 * mm, 26 * mm, f"Emitido el {issued_at.strftime('%d/%m/%Y')}")
    c.drawRightString(width - 28 * mm, 26 * mm, f"Código de verificación: {code}")

    c.showPage()
    c.save()
    return buffer.getvalue()
