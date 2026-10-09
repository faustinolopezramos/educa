"""Cada academia numera sus matrículas y comprobantes por su cuenta, por año.

Con una secuencia compartida, la serie de una academia saltaba los números que
se llevaban las demás y dejaba ver cuánto emitían.
"""

from app.models import Tenant
from app.services.sequences import next_enrollment_code, next_invoice_code


def _tenant(db, slug):
    t = Tenant(name=slug, slug=slug, max_active_students=10)
    db.add(t)
    db.flush()
    return t


def test_each_academy_has_its_own_series(db):
    a, b = _tenant(db, "serie-a"), _tenant(db, "serie-b")

    assert next_enrollment_code(db, year=2031, tenant_id=a.id) == "2031-00001"
    assert next_enrollment_code(db, year=2031, tenant_id=b.id) == "2031-00001"
    assert next_enrollment_code(db, year=2031, tenant_id=b.id) == "2031-00002"
    # La de A no saltó por las altas de B.
    assert next_enrollment_code(db, year=2031, tenant_id=a.id) == "2031-00002"


def test_the_series_restarts_every_year(db):
    a = _tenant(db, "serie-anual")
    next_invoice_code(db, year=2031, tenant_id=a.id)
    next_invoice_code(db, year=2031, tenant_id=a.id)
    assert next_invoice_code(db, year=2032, tenant_id=a.id) == "FAC-2032-00001"


def test_invoices_and_enrollments_do_not_share_a_counter(db):
    a = _tenant(db, "serie-tipos")
    next_enrollment_code(db, year=2031, tenant_id=a.id)
    assert next_invoice_code(db, year=2031, tenant_id=a.id) == "FAC-2031-00001"
