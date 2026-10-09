"""Sequential, human-readable correlativos (enrollment codes, invoice numbers).

Each academy numbers its own documents, starting again every year: the counter
lives in `document_counters`, keyed by academy, kind and year. It is advanced
with a single `INSERT … ON CONFLICT DO UPDATE … RETURNING`, which takes the
row lock, so two concurrent requests never get the same number; and because it
runs inside the caller's transaction, a rolled-back enrollment gives its number
back instead of leaving a gap.

The numbers used to come from one Postgres sequence for the whole
installation, so every academy's series skipped whatever the others had used.
"""

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models.document_counter import DocumentCounter

_ENROLLMENT = "enrollment"
_INVOICE = "invoice"


def _next(db: Session, kind: str, tenant_id: int | None, year: int) -> int:
    stmt = (
        insert(DocumentCounter)
        .values(tenant_key=tenant_id or 0, kind=kind, year=year, value=1)
        .on_conflict_do_update(
            index_elements=["tenant_key", "kind", "year"],
            set_={"value": DocumentCounter.value + 1},
        )
        .returning(DocumentCounter.value)
    )
    return db.execute(stmt).scalar_one()


def next_enrollment_code(db: Session, *, year: int, tenant_id: int | None = None) -> str:
    return f"{year}-{_next(db, _ENROLLMENT, tenant_id, year):05d}"


def next_invoice_code(db: Session, *, year: int, tenant_id: int | None = None) -> str:
    return f"FAC-{year}-{_next(db, _INVOICE, tenant_id, year):05d}"
