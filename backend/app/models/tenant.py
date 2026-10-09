from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Integer, String

from app.core.database import Base


class Tenant(Base):
    __tablename__ = "tenants"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    slug = Column(String(50), nullable=False, unique=True, index=True)
    logo_url = Column(String(500), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    max_active_students = Column(Integer, nullable=False, default=100)
    timezone = Column(String(50), nullable=False, default="America/Guatemala")
    # La moneda en que la academia cobra a sus alumnos (código ISO 4217, ver
    # app.services.currencies). La elige el director al crear la academia y
    # rige cómo se muestran cuotas, pagos, saldos, comprobantes y nómina.
    currency = Column(String(10), nullable=False, default="GTQ")
    primary_color = Column(String(20), nullable=True)
    secondary_color = Column(String(20), nullable=True)
    custom_domain = Column(String(255), nullable=True, unique=True, index=True)
    tax_id = Column(String(50), nullable=True)
    phone = Column(String(50), nullable=True)
    address = Column(String(255), nullable=True)
    # El plan contratado (`app.services.plans`), o NULL si el cupo es a medida.
    # `max_active_students` sigue siendo la cifra que se hace cumplir.
    plan_tier = Column(String(20), nullable=True)
    # Un cambio de plan que la academia pidió y el superadmin aún no resolvió.
    requested_plan = Column(String(20), nullable=True)
    plan_requested_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

