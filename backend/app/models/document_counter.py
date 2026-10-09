from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class DocumentCounter(Base):
    """El último correlativo emitido de cada tipo de documento, por academia y año.

    Los códigos de matrícula y de comprobante salían de una sola secuencia de
    Postgres para toda la instalación, así que la numeración de cada academia
    tenía huecos (los números que se llevaban las demás) y dejaba ver cuánto
    emitían. Este contador avanza dentro de la misma transacción que crea el
    documento: si ésta se revierte, el número no se pierde.

    `tenant_key` es el `tenant_id`, o 0 para las cuentas sin academia de las
    instalaciones de una sola sede (una clave primaria no admite NULL).
    """

    __tablename__ = "document_counters"

    tenant_key: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String(32), primary_key=True)
    year: Mapped[int] = mapped_column(Integer, primary_key=True)
    value: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
