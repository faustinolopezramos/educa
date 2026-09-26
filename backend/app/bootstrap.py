"""Lo mínimo que una instalación nueva necesita, sin datos de demostración.

Antes la única forma de preparar una base vacía era `python -m app.seed`, que
además de las nacionalidades creaba una «Academia Demo» con alumnos y profesores
de prueba y un superadmin con una contraseña fija escrita en el código
(`superadmin123`). En producción eso dejaba la cuenta que administra todas las
academias abierta a cualquiera que hubiera leído el repositorio.

Esto crea sólo lo compartido por todas las academias —la lista de
nacionalidades y el superadmin— con una contraseña que elige quien instala.
Las academias se crean después desde la pantalla «Academias».
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models import Nationality, User, UserRole
from app.schemas.user import _validate_password

NATIONALITIES = [
    "Guatemala",
    "El Salvador",
    "Honduras",
    "Nicaragua",
    "Costa Rica",
    "Panamá",
    "México",
    "Colombia",
    "Venezuela",
    "Perú",
    "Ecuador",
    "Bolivia",
    "Chile",
    "Argentina",
    "Uruguay",
    "Paraguay",
    "Brasil",
    "Cuba",
    "República Dominicana",
    "Puerto Rico",
    "España",
    "Estados Unidos",
    "Canadá",
    "Egipto",
    "Siria",
    "Líbano",
    "China",
    "Taiwán",
]

#: Contraseñas que aparecen en el código o en la documentación. Aceptarlas para
#: el superadmin sería volver a dejar la puerta abierta.
KNOWN_PASSWORDS = {"superadmin123", "admin123", "teacher123", "student123"}


def ensure_nationalities(db: Session) -> int:
    """Crea las nacionalidades que falten. Devuelve cuántas creó."""
    existing = set(db.scalars(select(Nationality.name)).all())
    missing = [name for name in NATIONALITIES if name not in existing]
    db.add_all(Nationality(name=name) for name in missing)
    db.flush()
    return len(missing)


def check_superadmin_password(password: str) -> None:
    """Las reglas de cualquier contraseña, y además ninguna de las publicadas."""
    _validate_password(password)
    if password in KNOWN_PASSWORDS:
        raise ValueError("Esa contraseña aparece en el código de Educa; elige otra")


def ensure_superadmin(
    db: Session,
    *,
    email: str,
    full_name: str,
    password: str,
    reset_password: bool = False,
) -> str:
    """Crea el superadmin, o cambia su contraseña si se pide.

    Devuelve qué hizo: ``"created"``, ``"password_reset"`` o ``"exists"``.
    Cambiar la contraseña también cierra todas sus sesiones abiertas: si la
    anterior estaba comprometida, quien la usó no debe seguir dentro.
    """
    check_superadmin_password(password)
    user = db.scalar(
        select(User).where(User.email == email, User.tenant_id.is_(None))
    )
    if user is None:
        db.add(
            User(
                email=email,
                full_name=full_name,
                role=UserRole.superadmin,
                password_hash=hash_password(password),
                tenant_id=None,
            )
        )
        db.flush()
        return "created"
    if user.role is not UserRole.superadmin:
        raise ValueError(f"{email} ya existe y no es superadmin")
    if not reset_password:
        return "exists"
    user.password_hash = hash_password(password)
    user.token_version = (user.token_version or 0) + 1
    user.is_active = True
    db.flush()
    return "password_reset"
