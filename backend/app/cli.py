"""CLI maintenance tasks for Educa.

Usage:
    python -m app.cli refresh-payments [--tenant-slug SLUG] [--on YYYY-MM-DD]
    python -m app.cli expire-makeups [--tenant-slug SLUG] [--on YYYY-MM-DD]
"""

from __future__ import annotations

import argparse
import sys
from collections.abc import Callable
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import academy_today
from app.core.database import SessionLocal
from app.models import MakeUpCredit, MakeUpStatus, Tenant, User, UserRole
from app.services.audit import record
from app.services.finance import refresh_all_payment_statuses


def cmd_refresh_payments(
    args: argparse.Namespace, session_factory: Callable[[], Session] = SessionLocal
) -> int:
    """Recalcula el estado de pago de las matrículas.

    `session_factory` existe para las pruebas: con `SessionLocal` fijo, el
    comando abría su propia conexión y no veía los datos que la prueba acababa
    de montar dentro de su transacción, así que no había forma de ejercitarlo.
    """
    target_date: date | None = None
    if args.on:
        try:
            target_date = datetime.strptime(args.on, "%Y-%m-%d").date()
        except ValueError:
            print(f"Error: Fecha inválida '{args.on}', use YYYY-MM-DD", file=sys.stderr)
            return 1

    db = session_factory()
    try:
        # Find or construct an actor
        actor: User | None = None
        if args.tenant_slug:
            tenant = db.scalar(select(Tenant).where(Tenant.slug == args.tenant_slug))
            if not tenant:
                print(f"Error: Academia '{args.tenant_slug}' no encontrada", file=sys.stderr)
                return 1
            actor = db.scalar(
                select(User).where(User.tenant_id == tenant.id, User.role == UserRole.admin)
            )
            if not actor:
                actor = User(
                    id=0,
                    role=UserRole.admin,
                    tenant_id=tenant.id,
                    email=f"system@{tenant.slug}.local",
                    full_name="Sistema Automático",
                )
        else:
            # Superadmin / system-wide actor
            actor = db.scalar(select(User).where(User.role == UserRole.superadmin))
            if not actor:
                actor = User(
                    id=0,
                    role=UserRole.superadmin,
                    tenant_id=None,
                    email="system@educa.local",
                    full_name="Sistema Automático",
                )

        updated_count = refresh_all_payment_statuses(db, actor, on=target_date)
        if updated_count > 0:
            record(
                db,
                actor if actor.id != 0 else None,
                "update",
                "payment_status_sweep_cli",
                0,
                after={"updated": updated_count, "on": str(target_date or date.today())},
            )
        db.commit()
        print(f"Éxito: Se actualizaron los estados de pago de {updated_count} matrícula(s).")
        return 0
    finally:
        db.close()


def cmd_expire_makeups(
    args: argparse.Namespace, session_factory: Callable[[], Session] = SessionLocal
) -> int:
    """Marca como caducados los pases de recuperación cuya fecha ya pasó.

    Los endpoints caducan también al leer cada pase, así que esto no es la única
    red: sirve para que los informes y los recuentos no dependan de que alguien
    abra la pantalla. Pensado para una máquina programada diaria.
    """
    target_date: date | None = None
    if args.on:
        try:
            target_date = datetime.strptime(args.on, "%Y-%m-%d").date()
        except ValueError:
            print(f"Error: Fecha inválida '{args.on}', use YYYY-MM-DD", file=sys.stderr)
            return 1

    db = session_factory()
    try:
        on = target_date or academy_today()
        stmt = select(MakeUpCredit).where(
            MakeUpCredit.status.in_([MakeUpStatus.available, MakeUpStatus.booked]),
            MakeUpCredit.expires_at < on,
        )
        if args.tenant_slug:
            tenant = db.scalar(select(Tenant).where(Tenant.slug == args.tenant_slug))
            if not tenant:
                print(f"Error: Academia '{args.tenant_slug}' no encontrada", file=sys.stderr)
                return 1
            stmt = stmt.where(MakeUpCredit.tenant_id == tenant.id)

        expired = list(db.scalars(stmt).all())
        for credit in expired:
            credit.status = MakeUpStatus.expired
            credit.target_session_id = None

        db.commit()
        print(f"Éxito: Se marcaron como vencidos {len(expired)} pase(s) de recuperación.")
        return 0
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Herramientas de línea de comandos de Educa")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # Subcomando refresh-payments
    parser_refresh = subparsers.add_parser(
        "refresh-payments",
        help="Recalcular estados de pago vencidos (overdue) para todas las matrículas activas",
    )
    parser_refresh.add_argument(
        "--tenant-slug",
        type=str,
        default=None,
        help="Slug de la academia a actualizar (opcional, por defecto todas las academias)",
    )
    parser_refresh.add_argument(
        "--on",
        type=str,
        default=None,
        help="Fecha de referencia en formato YYYY-MM-DD (opcional, por defecto hoy)",
    )
    parser_refresh.set_defaults(func=cmd_refresh_payments)

    # Subcomando expire-makeups
    parser_expire = subparsers.add_parser(
        "expire-makeups",
        help="Marcar como vencidos los pases de recuperación cuya fecha ya pasó",
    )
    parser_expire.add_argument(
        "--tenant-slug",
        type=str,
        default=None,
        help="Slug de la academia a procesar (opcional, por defecto todas)",
    )
    parser_expire.add_argument(
        "--on",
        type=str,
        default=None,
        help="Fecha de referencia en formato YYYY-MM-DD (opcional, por defecto hoy)",
    )
    parser_expire.set_defaults(func=cmd_expire_makeups)

    args = parser.parse_args()
    exit_code = args.func(args)
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
