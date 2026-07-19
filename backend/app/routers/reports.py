"""Daily / weekly / monthly reports, scoped to what the caller may see."""

import csv
import io
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, student_is_solvent
from app.models import User, UserRole
from app.schemas.report import ReportRead
from app.services.report_pdf import build_report_pdf
from app.services.reports import build_report

router = APIRouter(prefix="/reports", tags=["reports"])

Period = Query(pattern="^(day|week|month)$")
Format = Query(default="csv", pattern="^(csv|pdf)$")


def _report(
    db: Session,
    user: User,
    period: str,
    anchor: date | None,
    course_id: int | None,
    teacher_id: int | None,
):
    # A student must be up to date on payments to see their progress report.
    if user.role == UserRole.student and not student_is_solvent(db, user.id):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Regulariza tu pago para ver tu reporte de avance.",
        )
    try:
        return build_report(
            db, user, period, anchor or date.today(), course_id, teacher_id
        )
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))


@router.get("", response_model=ReportRead)
def get_report(
    period: str = Period,
    anchor: date | None = None,
    course_id: int | None = None,
    teacher_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ReportRead:
    """A period's sessions, attendance, grades and at-risk students.

    `anchor` is any date inside the period (defaults to today); the backend
    widens it to the day/week/month. Scope follows the caller's role.
    """
    return _report(db, current_user, period, anchor, course_id, teacher_id)


@router.get("/export")
def export_report(
    period: str = Period,
    format: str = Format,
    anchor: date | None = None,
    course_id: int | None = None,
    teacher_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    """The same report as a download — CSV (default) or a print-ready PDF."""
    report = _report(db, current_user, period, anchor, course_id, teacher_id)

    if format == "pdf":
        pdf = build_report_pdf(report)
        filename = f"reporte_{report.period}_{report.date_from}.pdf"
        return StreamingResponse(
            iter([pdf]),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["Reporte", report.period, str(report.date_from), str(report.date_to)])
    writer.writerow([])
    writer.writerow(["Sesiones (total / realizadas / canceladas)"])
    writer.writerow([report.sessions_total, report.sessions_held, report.sessions_cancelled])
    writer.writerow([])
    writer.writerow(["Asistencia por curso"])
    writer.writerow(["Curso", "Presentes", "Total", "Tasa"])
    for c in report.attendance_by_course:
        writer.writerow([c.course_name, c.present, c.total, c.rate if c.rate is not None else ""])
    writer.writerow([])
    writer.writerow(["Alumnos en riesgo"])
    writer.writerow(["Alumno", "Curso", "Asistencia", "Promedio", "Motivos"])
    for r in report.at_risk:
        writer.writerow(
            [
                r.student_name,
                r.course_name,
                r.attendance_rate if r.attendance_rate is not None else "",
                r.average if r.average is not None else "",
                "; ".join(r.reasons),
            ]
        )

    buffer.seek(0)
    filename = f"reporte_{report.period}_{report.date_from}.csv"
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
