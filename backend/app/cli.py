"""CLI maintenance tasks for Educa.

Usage:
    python -m app.cli refresh-payments [--tenant-slug SLUG] [--on YYYY-MM-DD]
    python -m app.cli expire-makeups [--tenant-slug SLUG] [--on YYYY-MM-DD]
    python -m app.cli dispatch-notifications [--limit N]
    python -m app.cli at-risk-sweep [--force]
    python -m app.cli generate-vapid-keys
    python -m app.cli bootstrap --email EMAIL [--name NOMBRE] [--reset-password]
"""

from __future__ import annotations

import argparse
import getpass
import os
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


def cmd_dispatch_notifications(
    args: argparse.Namespace, session_factory: Callable[[], Session] = SessionLocal
) -> int:
    """Envía ya los avisos por correo/WhatsApp pendientes y resume la cola.

    La API los envía sola cada pocos segundos; esto sirve para vaciar la cola a
    mano y, sobre todo, para ver qué está fallando (plantilla sin aprobar,
    credenciales SMTP malas) sin buscar en los logs.
    """
    from sqlalchemy import func

    from app.models import NotificationDelivery
    from app.services.delivery import dispatch_pending

    db = session_factory()
    try:
        results = dispatch_pending(db, limit=args.limit)
        print(f"Procesados: {dict(results) or 'nada pendiente'}")
        rows = db.execute(
            select(
                NotificationDelivery.channel,
                NotificationDelivery.status,
                func.count(),
            ).group_by(NotificationDelivery.channel, NotificationDelivery.status)
        ).all()
        for channel, st, n in sorted(rows):
            print(f"  {channel:<9} {st:<8} {n}")
        errors = db.execute(
            select(NotificationDelivery.channel, NotificationDelivery.last_error)
            .where(NotificationDelivery.last_error.is_not(None))
            .order_by(NotificationDelivery.id.desc())
            .limit(5)
        ).all()
        if errors:
            print("Últimos errores:")
            for channel, err in errors:
                print(f"  [{channel}] {err}")
        return 0
    finally:
        db.close()


def cmd_at_risk_sweep(
    args: argparse.Namespace, session_factory: Callable[[], Session] = SessionLocal
) -> int:
    """Lanza el barrido semanal de alumnos en riesgo de las academias a las que les toca.

    La API lo lanza sola; esto sirve para adelantarlo (`--force` no espera al día
    y la hora configurados). En ningún caso se repite en la misma semana.
    """
    from app.services.risk_sweep import run_due_sweeps

    db = session_factory()
    try:
        done = run_due_sweeps(db, force=args.force)
        print(f"Barridos realizados: {done} academia(s).")
        return 0
    finally:
        db.close()


def cmd_generate_vapid_keys(args: argparse.Namespace) -> int:
    """Imprime un par de claves VAPID nuevo para los avisos push.

    Se generan una sola vez por instalación. Cambiarlas después deja inservibles
    todas las suscripciones: cada dispositivo tendría que volver a activarlas.
    """
    from app.services.push import generate_vapid_keys

    public, private = generate_vapid_keys()
    print(f"VAPID_PUBLIC_KEY={public}")
    print(f"VAPID_PRIVATE_KEY={private}")
    return 0


def cmd_bootstrap(
    args: argparse.Namespace, session_factory: Callable[[], Session] = SessionLocal
) -> int:
    """Prepara una instalación nueva: nacionalidades y superadmin, sin demo.

    La contraseña se lee de `EDUCA_SUPERADMIN_PASSWORD` o se pregunta sin eco;
    nunca de un argumento, que quedaría en el historial de la terminal.
    Con `--reset-password` cambia la de un superadmin existente y cierra sus
    sesiones: es la forma de cerrar una instalación hecha con el seed de demo.
    """
    from app.bootstrap import ensure_nationalities, ensure_superadmin

    password = os.environ.get("EDUCA_SUPERADMIN_PASSWORD")
    if password is None:
        if not sys.stdin.isatty():
            print(
                "Define EDUCA_SUPERADMIN_PASSWORD o ejecuta el comando en una terminal "
                "interactiva para escribir la contraseña.",
                file=sys.stderr,
            )
            return 2
        password = getpass.getpass("Contraseña del superadmin: ")
        if getpass.getpass("Repítela: ") != password:
            print("Las contraseñas no coinciden.", file=sys.stderr)
            return 2

    db = session_factory()
    try:
        added = ensure_nationalities(db)
        outcome = ensure_superadmin(
            db,
            email=args.email,
            full_name=args.name,
            password=password,
            reset_password=args.reset_password,
        )
        db.commit()
    except ValueError as exc:
        db.rollback()
        print(f"No se hizo nada: {exc}", file=sys.stderr)
        return 1
    finally:
        db.close()

    print(f"Nacionalidades añadidas: {added}.")
    print(
        {
            "created": f"Superadmin {args.email} creado.",
            "password_reset": f"Contraseña de {args.email} cambiada; sus sesiones abiertas se cerraron.",
            "exists": f"{args.email} ya existía; no se tocó (usa --reset-password para cambiarla).",
        }[outcome]
    )
    print("Siguiente paso: entra como superadmin y crea la primera academia en «Academias».")
    return 0


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

    parser_dispatch = subparsers.add_parser(
        "dispatch-notifications",
        help="Enviar los avisos por correo/WhatsApp pendientes y mostrar el estado de la cola",
    )
    parser_dispatch.add_argument("--limit", type=int, default=500)
    parser_dispatch.set_defaults(func=cmd_dispatch_notifications)

    parser_sweep = subparsers.add_parser(
        "at-risk-sweep",
        help="Avisar de los alumnos en riesgo (una vez por semana y academia)",
    )
    parser_sweep.add_argument(
        "--force", action="store_true", help="No esperar al día y hora configurados"
    )
    parser_sweep.set_defaults(func=cmd_at_risk_sweep)

    parser_vapid = subparsers.add_parser(
        "generate-vapid-keys", help="Generar las claves VAPID de los avisos push (una vez)"
    )
    parser_vapid.set_defaults(func=cmd_generate_vapid_keys)

    parser_bootstrap = subparsers.add_parser(
        "bootstrap",
        help="Preparar una instalación nueva (nacionalidades y superadmin), sin datos de demo",
    )
    parser_bootstrap.add_argument("--email", required=True, help="Correo del superadmin")
    parser_bootstrap.add_argument("--name", default="Administrador de la plataforma")
    parser_bootstrap.add_argument(
        "--reset-password",
        action="store_true",
        help="Si el superadmin ya existe, cambiar su contraseña y cerrar sus sesiones",
    )
    parser_bootstrap.set_defaults(func=cmd_bootstrap)

    args = parser.parse_args()
    exit_code = args.func(args)
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
