from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import Certificate, Course, Enrollment, Level, Tenant, User

router = APIRouter(prefix="/public", tags=["public"])


class PublicCertificateVerification(BaseModel):
    valid: bool
    verification_code: str
    student_name: str
    course_name: str
    level_name: str
    final_score: float
    issued_at: datetime
    academy_name: str
    academy_logo_url: str | None = None
    academy_currency: str = "USD"


@router.get(
    "/certificates/verify/{code}",
    response_model=PublicCertificateVerification,
    summary="Verificar la autenticidad pública de un certificado",
)
def verify_certificate_public(
    code: str,
    db: Session = Depends(get_db),
) -> PublicCertificateVerification:
    """Verifica públicamente un certificado por su código único (ej. EDUCA-A1B2C3D4).

    Endpoint de acceso público sin requerir inicio de sesión ni token de autenticación.
    """
    clean_code = code.strip().upper()
    cert = db.scalar(select(Certificate).where(Certificate.code == clean_code))
    if cert is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Código de certificado no encontrado o no válido",
        )

    enrollment = db.get(Enrollment, cert.enrollment_id)
    if enrollment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Información de matrícula no disponible",
        )

    student = db.get(User, enrollment.student_id)
    course = db.get(Course, enrollment.course_id)
    level = db.get(Level, cert.level_id)
    tenant = db.get(Tenant, course.tenant_id) if course else None

    student_name = student.full_name if student else "Estudiante Desconocido"
    course_name = course.title if course else "Curso Desconocido"
    level_name = level.name if level else "Nivel General"
    academy_name = tenant.name if tenant else "Educa Academy"
    academy_logo = tenant.logo_url if tenant else None
    academy_currency = tenant.currency if tenant else "USD"

    return PublicCertificateVerification(
        valid=True,
        verification_code=cert.code,
        student_name=student_name,
        course_name=course_name,
        level_name=level_name,
        final_score=cert.final_score,
        issued_at=cert.issued_at,
        academy_name=academy_name,
        academy_logo_url=academy_logo,
        academy_currency=academy_currency,
    )
