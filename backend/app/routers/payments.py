"""Finanzas: a single charge/payment ledger per enrollment, plus internal
invoices (comprobantes) issued against it. Admin-only, like audit — it
exposes financial detail across the whole academy."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_role
from app.models import Course, Enrollment, Invoice, Payment, PaymentKind, User, UserRole
from app.schemas.base import PaginatedResponse
from app.schemas.invoice import InvoiceRead
from app.schemas.payment import EnrollmentLedger, PaymentCreate, PaymentRead
from app.services.invoice_pdf import build_invoice_pdf
from app.services.sequences import next_invoice_code

router = APIRouter(tags=["payments"])

admin_only = require_role(UserRole.admin)


def _get_enrollment(db: Session, enrollment_id: int) -> Enrollment:
    enrollment = db.get(Enrollment, enrollment_id)
    if enrollment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Enrollment not found")
    return enrollment


@router.get("/payments", response_model=PaginatedResponse[PaymentRead])
def list_payments(
    enrollment_id: int | None = None,
    offset: int = 0,
    limit: int = Query(default=100, le=500),
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
) -> PaginatedResponse[PaymentRead]:
    stmt = select(Payment).order_by(Payment.id.desc())
    count_stmt = select(func.count(Payment.id))
    if enrollment_id is not None:
        stmt = stmt.where(Payment.enrollment_id == enrollment_id)
        count_stmt = count_stmt.where(Payment.enrollment_id == enrollment_id)
    total = db.scalar(count_stmt) or 0
    rows = db.scalars(stmt.offset(offset).limit(limit)).all()
    return PaginatedResponse(
        items=[PaymentRead.model_validate(r) for r in rows],
        total=total,
        offset=offset,
        limit=limit,
    )


@router.post(
    "/payments", response_model=PaymentRead, status_code=status.HTTP_201_CREATED
)
def create_payment(
    payload: PaymentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> Payment:
    _get_enrollment(db, payload.enrollment_id)
    payment = Payment(**payload.model_dump(), recorded_by=current_user.id)
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return payment


@router.get("/enrollments/{enrollment_id}/ledger", response_model=EnrollmentLedger)
def enrollment_ledger(
    enrollment_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
) -> EnrollmentLedger:
    _get_enrollment(db, enrollment_id)
    rows = list(
        db.scalars(
            select(Payment)
            .where(Payment.enrollment_id == enrollment_id)
            .order_by(Payment.id.desc())
        ).all()
    )
    charged = sum(p.amount for p in rows if p.kind == PaymentKind.charge)
    paid = sum(p.amount for p in rows if p.kind == PaymentKind.payment)
    return EnrollmentLedger(
        enrollment_id=enrollment_id,
        charged=charged,
        paid=paid,
        balance=charged - paid,
        movements=[PaymentRead.model_validate(r) for r in rows],
    )


@router.post(
    "/enrollments/{enrollment_id}/invoice",
    response_model=InvoiceRead,
    status_code=status.HTTP_201_CREATED,
)
def issue_invoice(
    enrollment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> Invoice:
    """Issue a receipt for everything paid so far on this enrollment."""
    enrollment = _get_enrollment(db, enrollment_id)
    total_paid = sum(
        p.amount
        for p in db.scalars(
            select(Payment).where(
                Payment.enrollment_id == enrollment_id,
                Payment.kind == PaymentKind.payment,
            )
        ).all()
    )
    if total_paid <= 0:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "No hay pagos registrados para facturar"
        )
    invoice = Invoice(
        enrollment_id=enrollment.id,
        code=next_invoice_code(db, year=datetime.now(timezone.utc).year),
        total_amount=total_paid,
        issued_by=current_user.id,
    )
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice


@router.get("/enrollments/{enrollment_id}/invoices", response_model=list[InvoiceRead])
def list_enrollment_invoices(
    enrollment_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
) -> list[Invoice]:
    _get_enrollment(db, enrollment_id)
    return list(
        db.scalars(
            select(Invoice)
            .where(Invoice.enrollment_id == enrollment_id)
            .order_by(Invoice.id.desc())
        ).all()
    )


@router.get("/invoices/{invoice_id}/pdf")
def invoice_pdf(
    invoice_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
) -> StreamingResponse:
    invoice = db.get(Invoice, invoice_id)
    if invoice is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")
    enrollment = db.get(Enrollment, invoice.enrollment_id)
    student = db.get(User, enrollment.student_id)
    course = db.get(Course, enrollment.course_id)
    pdf = build_invoice_pdf(
        student_name=student.full_name,
        course_name=course.name,
        enrollment_code=enrollment.enrollment_code,
        total_amount=invoice.total_amount,
        code=invoice.code,
        issued_at=invoice.issued_at,
    )
    return StreamingResponse(
        iter([pdf]),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="factura_{invoice.code}.pdf"'
        },
    )
