"""Cada academia vive en su propia zona horaria (`Tenant.timezone`).

Casi todo el sistema preguntaba "qué día es hoy" a una zona global, así que una
academia en otra zona veía vencer sus cuotas o caducar sus pases a destiempo.
"""

from datetime import datetime
from zoneinfo import ZoneInfo

from app.core.clock import academy_today, academy_tz
from app.core.config import settings
from app.models import Tenant


def _tenant(db, slug, tz):
    t = Tenant(name=slug, slug=slug, max_active_students=10, timezone=tz)
    db.add(t)
    db.flush()
    return t


def test_the_academy_zone_is_used_when_given(db):
    # UTC+14 y UTC-11: en todo momento caen en días distintos.
    east = _tenant(db, "reloj-este", "Pacific/Kiritimati")
    west = _tenant(db, "reloj-oeste", "Pacific/Pago_Pago")

    assert academy_tz(db, east.id) == ZoneInfo("Pacific/Kiritimati")
    assert academy_today(db, east.id) == datetime.now(ZoneInfo("Pacific/Kiritimati")).date()
    assert academy_today(db, east.id) != academy_today(db, west.id)


def test_without_an_academy_the_installation_zone_applies(db):
    assert academy_tz() == ZoneInfo(settings.academy_timezone)
    assert academy_tz(db, None) == ZoneInfo(settings.academy_timezone)


def test_an_unknown_zone_falls_back_instead_of_failing(db):
    broken = _tenant(db, "reloj-roto", "America/Guatemala")
    broken.timezone = "Nowhere/Atlantis"  # saltándose la validación del esquema
    db.flush()
    assert academy_tz(db, broken.id) == ZoneInfo(settings.academy_timezone)
