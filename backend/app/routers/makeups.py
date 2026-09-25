from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.clock import academy_today
from app.core.database import get_db
from app.core.deps import (
    apply_tenant,
    enrollment_in_scope_or_404,
    get_current_user,
    has_user_permission,
    in_tenant,
    is_admin,
    teacher_teaches_course,
)
from app.models import (
    ClassSession,
    Course,
    ENROLLMENT_HAS_ACCESS,
    ENROLLMENT_OCCUPIES_SEAT,
    Enrollment,
    Level,
    MakeUpCredit,
    MakeUpStatus,
    Permission,
    Room,
    Schedule,
    SessionStatus,
    User,
    UserRole,
)
from app.schemas.makeup import (
    CandidateSessionRead,
    MakeUpBookRequest,
    MakeUpCreditCreate,
    MakeUpCreditRead,
)
from app.services.audit import record as record_audit, snapshot
from app.services.sessions import session_course_id

router = APIRouter(prefix="/makeups", tags=["makeups"])

_DEFAULT_VALIDITY = timedelta(days=60)


# ---------------- Alcance y permisos ----------------
#
# Un pase de recuperación pertenece a una academia (la de su curso) y a un
# alumno. Todo endpoint que reciba un `credit_id` pasa por aquí: antes sólo se
# comprobaba el caso del alumno, así que cualquier profesor o administrativo
# —incluido el de otra academia— podía ver, reservar o cancelar el pase de
# cualquiera con sólo acertar el número.


def _course_of_credit(db: Session, credit: MakeUpCredit) -> Course | None:
    enrollment = db.get(Enrollment, credit.enrollment_id)
    return db.get(Course, enrollment.course_id) if enrollment else None


def _may_manage(db: Session, user: User, credit: MakeUpCredit, course: Course | None) -> bool:
    """Si este usuario puede operar sobre este pase."""
    if user.role == UserRole.student:
        return credit.student_id == user.id
    if user.role == UserRole.teacher:
        # El profesor del curso de origen: es quien justificó la falta y quien
        # responde de la recuperación.
        return course is not None and teacher_teaches_course(db, user.id, course.id)
    return has_user_permission(user, Permission.manage_enrollments)


def _credit_in_scope_or_404(db: Session, user: User, credit_id: int) -> MakeUpCredit:
    """El pase, si es de la academia del usuario y éste puede tocarlo.

    404 —y no 403— cuando es de otra academia: contestar "prohibido" ya confirma
    que ese pase existe en alguna, que es justo lo que una academia no debe
    poder averiguar de otra.
    """
    credit = db.get(MakeUpCredit, credit_id)
    if credit is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Make-up credit not found")

    course = _course_of_credit(db, credit)
    # El pase lleva su propio `tenant_id`, pero la verdad está en el curso: es de
    # donde cuelga la matrícula que lo originó.
    if not in_tenant(user, course) or not in_tenant(user, credit):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Make-up credit not found")

    if not _may_manage(db, user, credit, course):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "No puedes gestionar este pase de recuperación"
        )
    return credit


def _expire_if_due(credit: MakeUpCredit) -> MakeUpCredit:
    """Marca como caducado un pase cuya fecha ya pasó.

    Nada cerraba nunca este ciclo: un pase seguía figurando como disponible años
    después de vencer, y podía reservarse. Se hace al leerlo, de modo que la
    caducidad no dependa de que alguien acuerde ejecutar la tarea programada
    (`python -m app.cli expire-makeups`, que hace lo mismo en bloque).
    """
    if (
        credit.status in (MakeUpStatus.available, MakeUpStatus.booked)
        and credit.expires_at < academy_today()
    ):
        credit.status = MakeUpStatus.expired
        credit.target_session_id = None
    return credit


def _enrich_credit(db: Session, credit: MakeUpCredit) -> MakeUpCreditRead:
    enrollment = db.get(Enrollment, credit.enrollment_id)
    student = db.get(User, credit.student_id)
    course = db.get(Course, enrollment.course_id) if enrollment else None
    level = db.get(Level, course.level_id) if course else None

    origin_sess = (
        db.get(ClassSession, credit.origin_session_id) if credit.origin_session_id else None
    )
    target_sess = (
        db.get(ClassSession, credit.target_session_id) if credit.target_session_id else None
    )

    target_course_name = None
    target_time_str = None
    if target_sess and target_sess.schedule:
        target_course = db.get(Course, target_sess.schedule.course_id)
        if target_course:
            target_course_name = target_course.name
        target_time_str = (
            f"{target_sess.start_time.strftime('%H:%M')}–"
            f"{target_sess.end_time.strftime('%H:%M')}"
        )

    return MakeUpCreditRead(
        id=credit.id,
        student_id=credit.student_id,
        enrollment_id=credit.enrollment_id,
        origin_session_id=credit.origin_session_id,
        target_session_id=credit.target_session_id,
        status=credit.status,
        issued_at=credit.issued_at,
        expires_at=credit.expires_at,
        notes=credit.notes,
        student_name=student.full_name if student else None,
        course_name=course.name if course else None,
        level_name=level.name if level else None,
        origin_session_date=origin_sess.date if origin_sess else None,
        target_session_date=target_sess.date if target_sess else None,
        target_session_time=target_time_str,
        target_course_name=target_course_name,
    )


# ---------------- Endpoints ----------------
@router.get("", response_model=list[MakeUpCreditRead])
def list_makeups(
    student_id: int | None = None,
    status_filter: MakeUpStatus | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[MakeUpCreditRead]:
    stmt = select(MakeUpCredit).order_by(MakeUpCredit.issued_at.desc())

    if current_user.role == UserRole.student:
        stmt = stmt.where(MakeUpCredit.student_id == current_user.id)
    elif current_user.role == UserRole.teacher:
        course_ids = list(
            db.scalars(
                select(Enrollment.course_id)
                .join(MakeUpCredit, MakeUpCredit.enrollment_id == Enrollment.id)
                .distinct()
            ).all()
        )
        teaching = [c for c in course_ids if teacher_teaches_course(db, current_user.id, c)]
        stmt = stmt.join(Enrollment, MakeUpCredit.enrollment_id == Enrollment.id).where(
            Enrollment.course_id.in_(teaching or [-1])
        )
    elif has_user_permission(current_user, Permission.manage_enrollments):
        stmt = apply_tenant(stmt, MakeUpCredit.tenant_id, current_user)
    else:
        # Un asistente sin ese permiso no gestiona matrículas, así que tampoco
        # los pases que salen de ellas.
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            f"Permiso insuficiente: requiere '{Permission.manage_enrollments.value}'",
        )

    if student_id is not None and current_user.role != UserRole.student:
        stmt = stmt.where(MakeUpCredit.student_id == student_id)

    credits = [_expire_if_due(c) for c in db.scalars(stmt).all()]
    db.commit()

    if status_filter is not None:
        # Se filtra después de caducar, para que "disponibles" no siga
        # devolviendo pases que acaban de vencer.
        credits = [c for c in credits if c.status == status_filter]
    return [_enrich_credit(db, c) for c in credits]


@router.post("", response_model=MakeUpCreditRead, status_code=status.HTTP_201_CREATED)
def create_makeup_credit(
    payload: MakeUpCreditCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MakeUpCreditRead:
    # La matrícula manda: fija la academia y el curso, y de ahí sale todo lo
    # demás. Sin esta comprobación se podían emitir pases sobre matrículas de
    # otra academia.
    enrollment = enrollment_in_scope_or_404(db, current_user, payload.enrollment_id)
    course = db.get(Course, enrollment.course_id)

    if current_user.role == UserRole.teacher:
        if not teacher_teaches_course(db, current_user.id, enrollment.course_id):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "No enseñas este curso")
    elif not has_user_permission(current_user, Permission.manage_enrollments):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            f"Permiso insuficiente: requiere '{Permission.manage_enrollments.value}'",
        )

    if enrollment.student_id != payload.student_id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Enrollment does not belong to student"
        )

    if payload.origin_session_id is not None:
        origin = db.get(ClassSession, payload.origin_session_id)
        if origin is None or session_course_id(db, origin) != enrollment.course_id:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "La sesión de origen no pertenece al curso de esta matrícula",
            )

    today = academy_today()
    expires = payload.expires_at or (today + _DEFAULT_VALIDITY)
    if expires < today:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "La fecha de vencimiento ya pasó"
        )

    credit = MakeUpCredit(
        tenant_id=course.tenant_id if course else current_user.tenant_id,
        student_id=payload.student_id,
        enrollment_id=payload.enrollment_id,
        origin_session_id=payload.origin_session_id,
        expires_at=expires,
        notes=payload.notes,
        status=MakeUpStatus.available,
    )
    db.add(credit)
    db.flush()

    record_audit(db, current_user, "create", "make_up_credits", credit.id, after=snapshot(credit))
    db.commit()
    db.refresh(credit)
    return _enrich_credit(db, credit)


def _seat_counts(
    db: Session, course_ids: list[int], session_ids: list[int]
) -> tuple[dict[int, int], dict[int, int]]:
    """Plazas ocupadas por curso y reservas de recuperación por sesión.

    Dos consultas agrupadas en lugar de dos por cada sesión candidata: con un
    trimestre por delante eran cientos de idas y vueltas a una base que, en
    producción, está al otro lado de la red.
    """
    enrolled: dict[int, int] = {}
    if course_ids:
        rows = db.execute(
            select(Enrollment.course_id, func.count(Enrollment.id))
            .where(
                Enrollment.course_id.in_(course_ids),
                Enrollment.status.in_(ENROLLMENT_OCCUPIES_SEAT),
            )
            .group_by(Enrollment.course_id)
        ).all()
        enrolled = {course_id: count for course_id, count in rows}

    booked: dict[int, int] = {}
    if session_ids:
        rows = db.execute(
            select(MakeUpCredit.target_session_id, func.count(MakeUpCredit.id))
            .where(
                MakeUpCredit.target_session_id.in_(session_ids),
                MakeUpCredit.status == MakeUpStatus.booked,
            )
            .group_by(MakeUpCredit.target_session_id)
        ).all()
        booked = {session_id: count for session_id, count in rows}

    return enrolled, booked


@router.get("/{credit_id}/candidates", response_model=list[CandidateSessionRead])
def get_candidate_sessions(
    credit_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[CandidateSessionRead]:
    credit = _credit_in_scope_or_404(db, current_user, credit_id)
    _expire_if_due(credit)
    db.commit()
    if credit.status == MakeUpStatus.expired:
        return []

    enrollment = db.get(Enrollment, credit.enrollment_id)
    if enrollment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Enrollment not found")
    source_course = db.get(Course, enrollment.course_id)
    if source_course is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Source course not found")

    today = academy_today()

    # Los cursos donde el alumno ya tiene plaza no son una recuperación: iría a
    # una clase suya.
    own_course_ids = set(
        db.scalars(
            select(Enrollment.course_id).where(Enrollment.student_id == credit.student_id)
        ).all()
    )

    stmt = (
        select(ClassSession, Course, Schedule, User, Level)
        .join(Schedule, ClassSession.schedule_id == Schedule.id)
        .join(Course, Schedule.course_id == Course.id)
        .join(Level, Course.level_id == Level.id)
        .join(User, ClassSession.teacher_id == User.id)
        .where(
            Course.level_id == source_course.level_id,
            ClassSession.date >= today,
            # Más allá del vencimiento el pase ya no vale, así que ofrecer esas
            # fechas sólo lleva a un 409 al reservar.
            ClassSession.date <= credit.expires_at,
            ClassSession.status != SessionStatus.cancelled,
            Course.tenant_id == source_course.tenant_id,
        )
        .order_by(ClassSession.date.asc(), ClassSession.start_time.asc())
    )
    rows = [
        row
        for row in db.execute(stmt).all()
        if row[1].id not in own_course_ids and row[0].id != credit.origin_session_id
    ]

    enrolled, booked = _seat_counts(
        db, [r[1].id for r in rows], [r[0].id for r in rows]
    )
    room_ids = {r[2].room_id for r in rows if r[2].room_id}
    rooms = (
        {r.id: r for r in db.scalars(select(Room).where(Room.id.in_(room_ids))).all()}
        if room_ids
        else {}
    )

    candidates: list[CandidateSessionRead] = []
    for sess, course, sched, teacher, lvl in rows:
        occupied = enrolled.get(course.id, 0) + booked.get(sess.id, 0)
        available = max(0, course.max_students - occupied)
        if available <= 0:
            continue

        room = rooms.get(sched.room_id) if sched.room_id else None
        candidates.append(
            CandidateSessionRead(
                session_id=sess.id,
                course_id=course.id,
                course_name=course.name,
                level_id=lvl.id,
                level_name=lvl.name,
                date=sess.date,
                start_time=sess.start_time,
                end_time=sess.end_time,
                teacher_name=teacher.full_name,
                modality=sched.modality,
                room_name=room.name if room else None,
                max_students=course.max_students,
                occupied_seats=occupied,
                available_seats=available,
            )
        )

    return candidates


@router.post("/{credit_id}/book", response_model=MakeUpCreditRead)
def book_candidate_session(
    credit_id: int,
    payload: MakeUpBookRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MakeUpCreditRead:
    credit = _credit_in_scope_or_404(db, current_user, credit_id)
    _expire_if_due(credit)

    if credit.status not in (MakeUpStatus.available, MakeUpStatus.booked):
        db.commit()
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"El pase de recuperación no se puede reservar en estado '{credit.status.value}'",
        )

    enrollment = db.get(Enrollment, credit.enrollment_id)
    if enrollment is None or enrollment.status not in ENROLLMENT_HAS_ACCESS:
        # Una matrícula retirada, pausada o ya graduada no da derecho a
        # sentarse en otra clase.
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "La matrícula de origen ya no está activa",
        )

    # El bloqueo serializa dos reservas simultáneas sobre la misma sesión: sin
    # él, ambas leían el mismo aforo libre y las dos entraban.
    target_session = db.scalar(
        select(ClassSession).where(ClassSession.id == payload.target_session_id).with_for_update()
    )
    if target_session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Target session not found")
    if target_session.status == SessionStatus.cancelled:
        raise HTTPException(status.HTTP_409_CONFLICT, "La sesión seleccionada fue cancelada")

    today = academy_today()
    if target_session.date < today:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "No se puede reservar una sesión en el pasado"
        )
    if target_session.date > credit.expires_at:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"El pase vence el {credit.expires_at.isoformat()}; elige una fecha anterior",
        )

    source_course = db.get(Course, enrollment.course_id)
    target_course_id = session_course_id(db, target_session)
    target_course = db.get(Course, target_course_id) if target_course_id else None

    if not source_course or not target_course:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Target course not found")
    if target_course.tenant_id != source_course.tenant_id:
        # Cruzar academias haría que un alumno apareciera en la lista de una
        # institución que no es la suya.
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Target session not found")
    if source_course.level_id != target_course.level_id:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "La sesión destino debe pertenecer al mismo nivel pedagógico (MCER) del curso original",
        )

    enrolled, booked = _seat_counts(db, [target_course.id], [target_session.id])
    occupied = enrolled.get(target_course.id, 0) + booked.get(target_session.id, 0)
    if credit.status == MakeUpStatus.booked and credit.target_session_id == target_session.id:
        # Ya contaba como reservado en esta misma sesión; no se cuenta dos veces.
        occupied -= 1
    if occupied >= target_course.max_students:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Aforo completo: esta sesión ya alcanzó el número máximo de alumnos permitidos",
        )

    before = snapshot(credit)
    credit.target_session_id = target_session.id
    credit.status = MakeUpStatus.booked

    record_audit(
        db, current_user, "update", "make_up_credits", credit.id, before=before, after=snapshot(credit)
    )
    db.commit()
    db.refresh(credit)
    return _enrich_credit(db, credit)


@router.post("/{credit_id}/cancel-booking", response_model=MakeUpCreditRead)
def cancel_makeup_booking(
    credit_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MakeUpCreditRead:
    credit = _credit_in_scope_or_404(db, current_user, credit_id)

    if credit.status != MakeUpStatus.booked:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "El crédito no tiene una reserva activa para cancelar",
        )

    before = snapshot(credit)
    credit.target_session_id = None
    credit.status = MakeUpStatus.available
    _expire_if_due(credit)

    record_audit(
        db, current_user, "update", "make_up_credits", credit.id, before=before, after=snapshot(credit)
    )
    db.commit()
    db.refresh(credit)
    return _enrich_credit(db, credit)
