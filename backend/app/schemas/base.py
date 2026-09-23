"""Shared shapes for request payloads."""

from decimal import Decimal
from typing import Annotated, Any, ClassVar, Generic, TypeVar

from pydantic import BaseModel, PlainSerializer, model_validator

T = TypeVar("T")

# El dinero se guarda y se opera como Decimal: con `float`, sumar cuotas de
# 0.1 y 0.2 no daba exactamente 0.3, y esa diferencia acaba en un saldo que no
# cuadra con lo que el alumno pagó.
#
# Hacia fuera sigue viajando como número JSON, no como cadena, que es lo que
# Pydantic haría con un Decimal: el frontend ya consume estos campos como
# números y no tiene por qué enterarse del cambio.
Money = Annotated[
    Decimal,
    PlainSerializer(lambda v: float(v) if v is not None else None, return_type=float, when_used="json"),
]


class PaginationParams(BaseModel):
    offset: int = 0
    limit: int = 100


class PaginatedResponse(BaseModel, Generic[T]):
    items: list[T]
    total: int
    offset: int
    limit: int


class PatchModel(BaseModel):
    """Base for PATCH payloads, where `null` and "omitted" are different asks.

    Every field of a patch is optional, which makes `X | None = None` the
    natural annotation — but that also accepts an explicit `null` from the
    client, and for a column the database declares NOT NULL that request can
    only end in a constraint violation. Coming out of the ORM, that violation
    is unattributed: it surfaces as a 500, or as whichever 409 the endpoint
    happens to wrap its commit in, naming a cause that has nothing to do with
    the field at fault.

    Subclasses list the fields backed by non-nullable columns; sending `null`
    for one is then a 422 that names it.
    """

    NON_NULLABLE: ClassVar[tuple[str, ...]] = ()

    @model_validator(mode="before")
    @classmethod
    def _reject_explicit_nulls(cls, data: Any) -> Any:
        if isinstance(data, dict):
            for field in cls.NON_NULLABLE:
                if field in data and data[field] is None:
                    raise ValueError(
                        f"'{field}' no puede ser null; omítelo para dejarlo sin cambios"
                    )
        return data
