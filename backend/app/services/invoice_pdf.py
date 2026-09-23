"""A print-ready internal invoice/receipt (reportlab).

Portrait A4 — student, course, enrollment code, amount, and a verification
code in the footer. No fiscal integration (DTE/factura electrónica); this is
an internal comprobante, mirroring `certificate_pdf.py`'s shape.
"""

from __future__ import annotations

import io
from datetime import datetime
from decimal import Decimal

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas as pdfcanvas

BRAND = colors.HexColor("#4f46e5")
BRAND_DARK = colors.HexColor("#4338ca")
INK = colors.HexColor("#1e293b")
MUTED = colors.HexColor("#64748b")
GOLD = colors.HexColor("#b45309")


def build_invoice_pdf(
    *,
    student_name: str,
    course_name: str,
    enrollment_code: str,
    total_amount: Decimal,
    code: str,
    issued_at: datetime,
) -> bytes:
    buffer = io.BytesIO()
    width, height = A4
    c = pdfcanvas.Canvas(buffer, pagesize=A4)
    c.setTitle(f"Factura — {student_name}")

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
    centered(height - 52 * mm, "COMPROBANTE DE PAGO", "Helvetica", 13, MUTED)

    centered(
        height - 78 * mm, "Se extiende el presente comprobante a", "Helvetica", 12, INK
    )
    centered(height - 96 * mm, student_name, "Helvetica-Bold", 24, BRAND_DARK)

    centered(
        height - 116 * mm,
        f"por su matrícula «{course_name}» (código {enrollment_code})",
        "Helvetica",
        12,
        INK,
    )
    centered(
        height - 130 * mm,
        f"Monto: Q{total_amount:.2f}",
        "Helvetica-Bold",
        14,
        GOLD,
    )

    c.setFillColor(MUTED)
    c.setFont("Helvetica", 9)
    c.drawString(28 * mm, 26 * mm, f"Emitido el {issued_at.strftime('%d/%m/%Y')}")
    c.drawRightString(width - 28 * mm, 26 * mm, f"Número de factura: {code}")

    c.showPage()
    c.save()
    return buffer.getvalue()
