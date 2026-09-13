"""CLI maintenance tasks for Educa.

Usage:
    python -m app.cli refresh-payments [--tenant-slug SLUG] [--on YYYY-MM-DD]
"""

from __future__ import annotations

import argparse
import sys
from datetime import date, datetime

from sqlalchemy import select

from app.core.database import SessionLocal
from app.models import Tenant, User, UserRole
from app.services.audit import record
from app.services.finance import refresh_all_payment_statuses


def cmd_refresh_payments(args: argparse.Namespace) -> int:
    target_date: date | None = None
    if args.on:
        try:
            target_date = datetime.strptime(args.on, "%Y-%m-%d").date()
        except ValueError:
            print(f"Error: Fecha inválida '{args.on}', use YYYY-MM-DD", file=sys.stderr)
            return 1

    db = SessionLocal()
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

    args = parser.parse_args()
    exit_code = args.func(args)
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
