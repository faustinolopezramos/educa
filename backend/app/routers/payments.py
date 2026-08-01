"""Finanzas: a single charge/payment ledger per enrollment, plus internal
invoices (comprobantes) issued against it. Admin-only, like audit — it
exposes financial detail across the whole academy."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import (
    apply_tenant,
    in_tenant,
    require_permission,
)
from app.models import Course, Enrollment, Invoice, Payment, PaymentKind, Permission, User, UserRole
from app.schemas.base import PaginatedResponse
from app.schemas.invoice import InvoiceRead
from app.schemas.payment import (
    EnrollmentLedger,
    PaymentCreate,
    PaymentRead,
    PaymentStatusRefresh,
)
from app.services.audit import record, snapshot
from app.services.finance import refresh_all_payment_statuses, refresh_payment_status
from app.services.invoice_pdf import build_invoice_pdf
from app.services.sequences import next_invoice_code

router = APIRouter(tags=["payments"])

admin_only = require_permission(Permission.manage_finance)


def _get_enrollment(db: Session, actor: User, enrollment_id: int) -> Enrollment:
    """The enrollment, if it belongs to the caller's academy.

    Every finance endpoint resolves through here, so scoping it once covers the
    whole ledger — balances, receipts and their PDFs alike.
    """
    enrollment = db.get(Enrollment, enrollment_id)
    if enrollment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Enrollment not found")
    if not in_tenant(actor, db.get(Course, enrollment.course_id)):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Enrollment not found")
    return enrollment


@router.get("/payments", response_model=PaginatedResponse[PaymentRead])
def list_payments(
    enrollment_id: int | None = None,
    offset: int = 0,
    limit: int = Query(default=100, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> PaginatedResponse[PaymentRead]:
    # A payment reaches its academy through enrollment → course.
    def _scoped(base):
        return apply_tenant(
            base.join(Enrollment, Payment.enrollment_id == Enrollment.id).join(
                Course, Enrollment.course_id == Course.id
            ),
            Course.tenant_id,
            current_user,
        )

    stmt = _scoped(select(Payment)).order_by(Payment.id.desc())
    count_stmt = _scoped(select(func.count(Payment.id)))
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
    enrollment = _get_enrollment(db, current_user, payload.enrollment_id)
    payment = Payment(**payload.model_dump(), recorded_by=current_user.id)
    db.add(payment)
    db.flush()
    # Money moving is exactly the kind of change an academy has to be able to
    # explain months later, so a cobro or a pago leaves the same trail a grade
    # change does.
    record(db, current_user, "create", "payment", payment.id, after=snapshot(payment))
    # One place decides what paid/pending/overdue mean; see services.finance.
    refresh_payment_status(db, enrollment)
    db.commit()
    db.refresh(payment)
    return payment


@router.post("/payments/refresh-statuses", response_model=PaymentStatusRefresh)
def refresh_payment_statuses(
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> PaymentStatusRefresh:
    """Re-derive every live enrollment's payment status.

    Delinquency arrives by the calendar, not by anyone touching the record, so
    a charge that quietly went past its due date needs a sweep to be noticed.
    Safe to run as often as you like — it only ever recomputes.
    """
    changed = refresh_all_payment_statuses(db)
    # A sweep touches many enrollments at once and belongs to no single one, so
    # it records one summary row (`entity_id` 0 — there is no one record this is
    # "about") rather than flooding the trail with a line per enrollment.
    if changed:
        record(
            db,
            current_user,
            "update",
            "payment_status_sweep",
            0,
            after={"updated": changed},
        )
    db.commit()
    return PaymentStatusRefresh(updated=changed)


@router.get("/enrollments/{enrollment_id}/ledger", response_model=EnrollmentLedger)
def enrollment_ledger(
    enrollment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> EnrollmentLedger:
    _get_enrollment(db, current_user, enrollment_id)
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
    enrollment = _get_enrollment(db, current_user, enrollment_id)
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
    db.flush()
    record(db, current_user, "create", "invoice", invoice.id, after=snapshot(invoice))
    db.commit()
    db.refresh(invoice)
    return invoice


@router.get("/enrollments/{enrollment_id}/invoices", response_model=list[InvoiceRead])
def list_enrollment_invoices(
    enrollment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
) -> list[Invoice]:
    _get_enrollment(db, current_user, enrollment_id)
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
    current_user: User = Depends(admin_only),
) -> StreamingResponse:
    invoice = db.get(Invoice, invoice_id)
    if invoice is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")
    enrollment = db.get(Enrollment, invoice.enrollment_id)
    if enrollment is not None and not in_tenant(
        current_user, db.get(Course, enrollment.course_id)
    ):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")
    student = db.get(User, enrollment.student_id) if enrollment else None
    course = db.get(Course, enrollment.course_id) if enrollment else None
    # An invoice whose enrolment, student or course has since been removed can
    # no longer be rendered — a 404 says so, where the attribute access this
    # replaces raised an unattributed 500.
    if enrollment is None or student is None or course is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            "La matrícula asociada a esta factura ya no existe",
        )
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
