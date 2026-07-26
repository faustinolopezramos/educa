"""Sequential, human-readable correlativos (enrollment codes, invoice numbers).

Backed by real Postgres sequences (`enrollment_code_seq`, `invoice_code_seq`)
so concurrent requests never race for the same number — the same guarantee a
serial primary key gives, just formatted for people instead of the database.
"""

from sqlalchemy import Sequence, select
from sqlalchemy.orm import Session

_ENROLLMENT_SEQ = Sequence("enrollment_code_seq")
_INVOICE_SEQ = Sequence("invoice_code_seq")


def next_enrollment_code(db: Session, *, year: int) -> str:
    n = db.scalar(select(_ENROLLMENT_SEQ.next_value()))
    return f"{year}-{n:05d}"


def next_invoice_code(db: Session, *, year: int) -> str:
    n = db.scalar(select(_INVOICE_SEQ.next_value()))
    return f"FAC-{year}-{n:05d}"
