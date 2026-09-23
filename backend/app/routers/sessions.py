from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import (
    apply_tenant,
    get_current_user,
    has_user_permission,
    in_tenant,
    is_admin,
    require_staff_permission,
    student_course_ids,
    teacher_course_ids,
    teacher_teaches_course,
)
from app.core.clock import academy_today
from app.models import (
    Attendance,
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
from app.schemas.session import (
    AgendaEntry,
    BoardStudent,
    BoardVisitor,
    ClassBoard,
    ClassSessionRead,
    MakeUpVisitorMark,
    MakeUpVisitorRead,
    SessionCancel,
    SessionEnsure,
    SessionGenerate,
    SessionReschedule,
    SessionUpdate,
)
from app.services.notifications import notify_session_cancelled
from app.services.sessions import (
    cancel_session,
    close_register,
    ensure_session,
    generate_sessions,
    reopen_register,
    reschedule_session,
    roster_coverage,
)

router = APIRouter(prefix="/sessions", tags=["sessions"])

staff_only = require_staff_permission(Permission.manage_schedules)
# Pasar lista es la misma potestad que tomar asistencia, no la de editar la
# franja: el profesor que da la clase marca, aunque no sea el titular.
attendance_staff = require_staff_permission(Permission.manage_grades)


# ---------------- Visibility ----------------
# A session inherits its course from the schedule, so it follows the same
# academic-relationship rule as meetings: staff see the sessions of the courses
# they run, a student sees the sessions of the courses they are enrolled in,
# as well as any make-up sessions they have booked.
def _visible_sessions(db: Session, user: User) -> Select:
    # A session reaches its academy through schedule → course, which also caps
    # what an admin can see: the whole school, never the whole installation.
    stmt = apply_tenant(
        select(ClassSession)
        .join(Schedule)
        .join(Course, Schedule.course_id == Course.id),
        Course.tenant_id,
        user,
    )
    if is_admin(user):
        return stmt
    if user.role == UserRole.teacher:
        return stmt.where(
            Schedule.course_id.in_(teacher_course_ids(db, user.id) or [-1])
        )
    course_ids = student_course_ids(db, user.id) or [-1]
    makeup_session_ids = select(MakeUpCredit.target_session_id).where(
        MakeUpCredit.student_id == user.id,
        MakeUpCredit.target_session_id.isnot(None),
        MakeUpCredit.status.in_([MakeUpStatus.booked, MakeUpStatus.attended]),
    )
    return stmt.where(
        (Schedule.course_id.in_(course_ids)) | (ClassSession.id.in_(makeup_session_ids))
    )


def _owned_schedule_or_404(db: Session, user: User, schedule_id: int) -> Schedule:
    """A schedule the caller may act on, or 404 (never confirm it exists).

    Writing a franja — generarla, cancelarla, reprogramarla — es del profesor
    titular, no de todo el que imparte el curso: cancelar la clase de un colega
    no es lo mismo que calificar en ella.

    Pero la negativa tiene dos públicos distintos. Un profesor asignado al curso
    ya sabe que la franja existe: la ve en su lista de sesiones y califica sobre
    ella, así que un 404 mudo sólo se lee como un fallo del sistema. Uno que no
    está asignado no debe enterarse de nada, y sigue recibiendo 404.
    """
    schedule = db.get(Schedule, schedule_id)
    if schedule is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Schedule not found")
    if not in_tenant(user, db.get(Course, schedule.course_id)):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Schedule not found")
    if user.role == UserRole.teacher and schedule.teacher_id != user.id:
        if teacher_teaches_course(db, user.id, schedule.course_id):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                (
                    "No eres el profesor titular de esta franja; sólo quien la "
                    "imparte puede generar, cancelar o reprogramar sus sesiones."
                ),
            )
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Schedule not found")
    return schedule


def _session_for_attendance_or_404(
    db: Session, user: User, session_id: int
) -> ClassSession:
    """Una sesión en la que el usuario puede pasar lista, o 404.

    Marcar asistencia lo hace quien imparte el curso, no sólo el profesor
    titular de la franja: `_owned_schedule_or_404` es la regla de *editar* el
    horario (generar, cancelar, reprogramar), y usarla aquí dejaba fuera a un
    profesor asignado al curso que sí da esa clase.
    """
    session = db.get(ClassSession, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    schedule = db.get(Schedule, session.schedule_id)
    course = db.get(Course, schedule.course_id) if schedule else None
    if not in_tenant(user, course) or course is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    if user.role == UserRole.teacher and not teacher_teaches_course(
        db, user.id, course.id
    ):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No enseñas este curso")
    return session


@router.get("", response_model=list[ClassSessionRead])
def list_sessions(
    schedule_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ClassSession]:
    stmt = _visible_sessions(db, current_user)
    if schedule_id is not None:
        stmt = stmt.where(ClassSession.schedule_id == schedule_id)
    if date_from is not None:
        stmt = stmt.where(ClassSession.date >= date_from)
    if date_to is not None:
        stmt = stmt.where(ClassSession.date <= date_to)
    return list(db.scalars(stmt.order_by(ClassSession.date)).all())


# ---------------- La jornada ----------------
#
# `GET /sessions` devuelve filas de `class_sessions` y nada más, así que la
# pantalla del profesor tenía que reconstruir su día en el navegador: horarios,
# cursos, aulas y asistencia por separado, y una consulta de conteo por clase.
# Esto responde la pregunta entera —"¿qué tengo hoy y qué me falta?"— con un
# número fijo de consultas.


def _may_close_register(user: User, schedule: Schedule) -> bool:
    """Si este usuario puede dar por cerrada la lista de esa franja.

    Misma regla que `_owned_schedule_or_404` impone al cerrar, pero como
    respuesta en vez de como negativa: la pantalla la usa para no ofrecer un
    botón que terminaría en 403. Un profesor asignado al curso marca asistencia;
    cerrar la lista es del titular.
    """
    if user.role == UserRole.teacher:
        return schedule.teacher_id == user.id
    return is_admin(user) or has_user_permission(user, Permission.manage_schedules)


def _agenda(db: Session, user: User, sessions: list) -> list[AgendaEntry]:
    """Monta las entradas de agenda de unas filas ya cargadas y con permiso.

    `sessions` son tuplas (ClassSession, Schedule, Course, Room|None, User, Level).
    Los conteos van en tres consultas agrupadas, no en tres por clase.
    """
    if not sessions:
        return []

    session_ids = [row[0].id for row in sessions]
    course_ids = list({row[2].id for row in sessions})

    marked_rows = db.execute(
        select(Attendance.session_id, func.count(Attendance.id))
        .where(Attendance.session_id.in_(session_ids))
        .group_by(Attendance.session_id)
    ).all()
    marked = {sid: count for sid, count in marked_rows}

    seat_rows = db.execute(
        select(Enrollment.course_id, func.count(Enrollment.id))
        .where(
            Enrollment.course_id.in_(course_ids),
            Enrollment.status.in_(ENROLLMENT_OCCUPIES_SEAT),
        )
        .group_by(Enrollment.course_id)
    ).all()
    seats = {cid: count for cid, count in seat_rows}

    visitor_rows = db.execute(
        select(MakeUpCredit.target_session_id, func.count(MakeUpCredit.id))
        .where(
            MakeUpCredit.target_session_id.in_(session_ids),
            MakeUpCredit.status.in_([MakeUpStatus.booked, MakeUpStatus.attended]),
        )
        .group_by(MakeUpCredit.target_session_id)
    ).all()
    visitors = {sid: count for sid, count in visitor_rows}

    return [
        AgendaEntry(
            session_id=sess.id,
            schedule_id=sess.schedule_id,
            course_id=course.id,
            course_name=course.name,
            level_name=level.name if level else None,
            date=sess.date,
            start_time=sess.start_time,
            end_time=sess.end_time,
            status=sess.status,
            register_closed=sess.register_closed_at is not None,
            modality=sched.modality,
            room_name=room.name if room else None,
            teacher_id=teacher.id,
            teacher_name=teacher.full_name,
            students_total=seats.get(course.id, 0),
            students_marked=marked.get(sess.id, 0),
            makeup_visitors=visitors.get(sess.id, 0),
            can_close_register=_may_close_register(user, sched),
        )
        for sess, sched, course, room, teacher, level in sessions
    ]


def _agenda_rows(db: Session, user: User) -> Select:
    """Todo lo que la agenda muestra de cada clase, con el alcance de siempre.

    El grafo de joins se declara entero aquí en vez de colgarlo de
    `_visible_sessions`: aquella ya une `schedule` y `course` por su cuenta, y
    encadenar sobre ella dejaba a SQLAlchemy sin saber desde qué tabla unir el
    profesor. El alcance se reutiliza como lo que es, un conjunto de ids.
    """
    visible_ids = _visible_sessions(db, user).with_only_columns(ClassSession.id)
    return (
        select(ClassSession, Schedule, Course, Room, User, Level)
        .select_from(ClassSession)
        .join(Schedule, ClassSession.schedule_id == Schedule.id)
        .join(Course, Schedule.course_id == Course.id)
        .join(Level, Course.level_id == Level.id)
        .join(User, ClassSession.teacher_id == User.id)
        .outerjoin(Room, Schedule.room_id == Room.id)
        .where(ClassSession.id.in_(visible_ids))
    )


@router.get("/agenda", response_model=list[AgendaEntry])
def session_agenda(
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[AgendaEntry]:
    """Las clases del periodo que el usuario puede ver, listas para dibujar.

    Sin fechas devuelve el día de hoy, que es lo que pide la pantalla de inicio
    del profesor.
    """
    today = academy_today()
    start = date_from or today
    end = date_to or start

    stmt = (
        _agenda_rows(db, current_user)
        .where(ClassSession.date >= start, ClassSession.date <= end)
        .order_by(ClassSession.date.asc(), ClassSession.start_time.asc())
    )
    return _agenda(db, current_user, list(db.execute(stmt).all()))


@router.get("/{session_id}/board", response_model=ClassBoard)
def class_board(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(attendance_staff),
) -> ClassBoard:
    """La clase y su lista: alumnos del grupo, visitantes y marcas de hoy."""
    session = _session_for_attendance_or_404(db, current_user, session_id)

    row = db.execute(
        _agenda_rows(db, current_user).where(ClassSession.id == session.id)
    ).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    entry = _agenda(db, current_user, [row])[0]

    marks = {
        enrollment_id: mark
        for enrollment_id, mark in db.execute(
            select(Attendance.enrollment_id, Attendance.status).where(
                Attendance.session_id == session.id
            )
        ).all()
    }

    roster = db.execute(
        select(Enrollment, User)
        .join(User, Enrollment.student_id == User.id)
        .where(
            Enrollment.course_id == entry.course_id,
            Enrollment.status.in_(ENROLLMENT_OCCUPIES_SEAT),
        )
        .order_by(User.full_name.asc())
    ).all()

    visitors = db.execute(
        select(MakeUpCredit, User, Course)
        .join(User, MakeUpCredit.student_id == User.id)
        .join(Enrollment, MakeUpCredit.enrollment_id == Enrollment.id)
        .join(Course, Enrollment.course_id == Course.id)
        .where(
            MakeUpCredit.target_session_id == session.id,
            MakeUpCredit.status.in_([MakeUpStatus.booked, MakeUpStatus.attended]),
        )
        .order_by(User.full_name.asc())
    ).all()

    return ClassBoard(
        session=entry,
        students=[
            BoardStudent(
                enrollment_id=enrollment.id,
                student_id=student.id,
                full_name=student.full_name,
                enrollment_code=enrollment.enrollment_code,
                mark=marks.get(enrollment.id),
            )
            for enrollment, student in roster
        ],
        visitors=[
            BoardVisitor(
                credit_id=credit.id,
                student_id=student.id,
                full_name=student.full_name,
                origin_course_name=course.name if course else None,
                status=credit.status,
            )
            for credit, student, course in visitors
        ],
    )


@router.get("/{session_id}", response_model=ClassSessionRead)
def get_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ClassSession:
    """One session the caller may see, or 404 (never confirm one they can't)."""
    session = db.scalar(
        _visible_sessions(db, current_user).where(ClassSession.id == session_id)
    )
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    if current_user.role == UserRole.student:
        sched = db.get(Schedule, session.schedule_id)
        blocked = sched is not None and db.scalar(
            select(Enrollment.id).where(
                Enrollment.student_id == current_user.id,
                Enrollment.course_id == sched.course_id,
                Enrollment.status.in_(ENROLLMENT_HAS_ACCESS),
                Enrollment.attendance_blocked.is_(True),
            )
        )
        if blocked:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "Tu acceso a clases está restringido. Contacta a administración.",
            )
    return session


@router.post("/generate", response_model=list[ClassSessionRead])
def generate(
    payload: SessionGenerate,
    db: Session = Depends(get_db),
    current_user: User = Depends(staff_only),
) -> list[ClassSession]:
    """Materialize every session of a schedule's term (idempotent)."""
    schedule = _owned_schedule_or_404(db, current_user, payload.schedule_id)
    if schedule.term_start is None or schedule.term_end is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "El curso no tiene fechas de inicio/fin; no se pueden generar sesiones",
        )
    created = generate_sessions(db, schedule)
    db.commit()
    return created


@router.post("/ensure", response_model=ClassSessionRead, status_code=status.HTTP_200_OK)
def ensure(
    payload: SessionEnsure,
    db: Session = Depends(get_db),
    current_user: User = Depends(staff_only),
) -> ClassSession:
    """Get-or-create one session, e.g. the class of today, before marking it."""
    schedule = _owned_schedule_or_404(db, current_user, payload.schedule_id)
    try:
        session = ensure_session(db, schedule, payload.date)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))
    db.commit()
    return session


from app.services.audit import record, snapshot


@router.post("/{session_id}/cancel", response_model=ClassSessionRead)
def cancel(
    session_id: int,
    payload: SessionCancel,
    db: Session = Depends(get_db),
    current_user: User = Depends(staff_only),
) -> ClassSession:
    """Mark a class as not held (holiday, absence…). Keeps the row for the record."""
    session = db.get(ClassSession, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    _owned_schedule_or_404(db, current_user, session.schedule_id)
    before = snapshot(session)
    cancel_session(db, session, payload.reason)
    record(
        db,
        current_user,
        "cancel",
        "class_session",
        session.id,
        before=before,
        after=snapshot(session),
    )
    notify_session_cancelled(db, session)
    db.commit()
    db.refresh(session)
    return session


@router.post("/{session_id}/reschedule", response_model=ClassSessionRead)
def reschedule(
    session_id: int,
    payload: SessionReschedule,
    db: Session = Depends(get_db),
    current_user: User = Depends(staff_only),
) -> ClassSession:
    """Cancel this class and create a make-up on another date (returns the make-up)."""
    session = db.get(ClassSession, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    _owned_schedule_or_404(db, current_user, session.schedule_id)
    before = snapshot(session)
    try:
        makeup = reschedule_session(db, session, payload.new_date)
    except ValueError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc))
    record(
        db,
        current_user,
        "reschedule",
        "class_session",
        session.id,
        before=before,
        after=snapshot(makeup),
    )
    notify_session_cancelled(db, session, rescheduled_to=payload.new_date.isoformat())
    db.commit()
    db.refresh(makeup)
    return makeup


@router.post("/{session_id}/close-register", response_model=ClassSessionRead)
def close_session_register(
    session_id: int,
    force: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(staff_only),
) -> ClassSession:
    """Dar la lista de una sesión por terminada.

    Exige que todos los que ocupan plaza tengan marca: una lista a medias no es
    una lista cerrada, y ese era justamente el hueco — `status = held` lo
    escribía el primer marcaje, así que 3 de 30 ya contaba como registrada.

    `?force=true` la cierra igualmente, para el caso real de un alumno que no
    aparece ni aparecerá y a quien el profesor no quiere marcar. La cifra de
    cobertura viaja en el error para que la interfaz pueda decir cuántos faltan.
    """
    session = db.get(ClassSession, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    _owned_schedule_or_404(db, current_user, session.schedule_id)
    if session.status == SessionStatus.cancelled:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "La clase fue cancelada; no hay lista que cerrar",
        )

    marked, total = roster_coverage(db, session)
    if not force and marked < total:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            {
                "message": (
                    f"Faltan {total - marked} de {total} alumnos por marcar."
                ),
                "reason": "incomplete_register",
                "marked": marked,
                "total": total,
            },
        )

    before = snapshot(session)
    close_register(db, session, current_user.id)
    record(
        db,
        current_user,
        "close_register",
        "class_session",
        session.id,
        before=before,
        after=snapshot(session),
    )
    db.commit()
    db.refresh(session)
    return session


@router.post("/{session_id}/reopen-register", response_model=ClassSessionRead)
def reopen_session_register(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(staff_only),
) -> ClassSession:
    """Reabrir una lista cerrada para corregirla.

    Existe porque cerrar es un gesto humano y equivocarse en él también. Queda
    en la auditoría: una lista que se cierra, se reabre y se vuelve a cerrar es
    exactamente la clase de cambio que hay que poder explicar después.
    """
    session = db.get(ClassSession, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    _owned_schedule_or_404(db, current_user, session.schedule_id)
    if session.register_closed_at is None:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Esta lista no está cerrada"
        )

    before = snapshot(session)
    reopen_register(db, session)
    record(
        db,
        current_user,
        "reopen_register",
        "class_session",
        session.id,
        before=before,
        after=snapshot(session),
    )
    db.commit()
    db.refresh(session)
    return session


@router.patch("/{session_id}", response_model=ClassSessionRead)
def update_session(
    session_id: int,
    payload: SessionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(staff_only),
) -> ClassSession:
    session = db.get(ClassSession, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    _owned_schedule_or_404(db, current_user, session.schedule_id)
    # This patch can set the very fields `cancel`/`reschedule` audit — status and
    # cancel_reason among them — so leaving it untraced was a way to change a
    # class's fate without appearing in the trail.
    before = snapshot(session)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(session, field, value)
    record(
        db,
        current_user,
        "update",
        "class_session",
        session.id,
        before=before,
        after=snapshot(session),
    )
    db.commit()
    db.refresh(session)
    return session


# ---------------- Alumnos en recuperación ----------------
#
# Un alumno que viene a recuperar no tiene matrícula en este curso, así que no
# sale en la lista de asistencia: ésta se construye sobre `enrollments`. Antes,
# su presencia no podía registrarse en ninguna parte y su pase se quedaba en
# "reservado" para siempre. Aquí se le pone al lado de la lista normal, que es
# donde el profesor lo tiene delante.


@router.get("/{session_id}/makeup-visitors", response_model=list[MakeUpVisitorRead])
def list_makeup_visitors(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(attendance_staff),
) -> list[MakeUpVisitorRead]:
    """Quién viene a esta sesión recuperando una clase de otro grupo."""
    session = _session_for_attendance_or_404(db, current_user, session_id)

    rows = db.execute(
        select(MakeUpCredit, User, Course)
        .join(User, MakeUpCredit.student_id == User.id)
        .join(Enrollment, MakeUpCredit.enrollment_id == Enrollment.id)
        .join(Course, Enrollment.course_id == Course.id)
        .where(
            MakeUpCredit.target_session_id == session.id,
            MakeUpCredit.status.in_([MakeUpStatus.booked, MakeUpStatus.attended]),
        )
        .order_by(User.full_name.asc())
    ).all()

    return [
        MakeUpVisitorRead(
            credit_id=credit.id,
            student_id=student.id,
            student_name=student.full_name,
            origin_course_name=course.name if course else None,
            status=credit.status,
        )
        for credit, student, course in rows
    ]


@router.post(
    "/{session_id}/makeup-visitors/{credit_id}/attendance",
    response_model=MakeUpVisitorRead,
)
def mark_makeup_visitor(
    session_id: int,
    credit_id: int,
    payload: MakeUpVisitorMark,
    db: Session = Depends(get_db),
    current_user: User = Depends(attendance_staff),
) -> MakeUpVisitorRead:
    """Marcar si el alumno en recuperación se presentó.

    Presente cierra el pase (`attended`). Ausente lo consume igualmente
    (`cancelled`): la plaza se reservó y se le quitó a otro, así que devolverlo
    sin más convertiría el pase en un derecho ilimitado a no presentarse. Para
    devolverlo hay que emitir uno nuevo, que es una decisión de la academia.
    """
    session = _session_for_attendance_or_404(db, current_user, session_id)
    if session.register_closed_at is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "La lista de esta sesión está cerrada; reábrela para corregirla",
        )

    credit = db.get(MakeUpCredit, credit_id)
    if credit is None or credit.target_session_id != session.id:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "Ese pase no está reservado en esta sesión"
        )
    if credit.status not in (MakeUpStatus.booked, MakeUpStatus.attended):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"El pase está en estado '{credit.status.value}'",
        )

    before = snapshot(credit)
    credit.status = MakeUpStatus.attended if payload.present else MakeUpStatus.cancelled
    if not payload.present:
        credit.notes = ((credit.notes or "") + " · No se presentó").strip(" ·")

    record(
        db,
        current_user,
        "update",
        "make_up_credits",
        credit.id,
        before=before,
        after=snapshot(credit),
    )
    db.commit()
    db.refresh(credit)

    student = db.get(User, credit.student_id)
    enrollment = db.get(Enrollment, credit.enrollment_id)
    origin_course = db.get(Course, enrollment.course_id) if enrollment else None
    return MakeUpVisitorRead(
        credit_id=credit.id,
        student_id=credit.student_id,
        student_name=student.full_name if student else "",
        origin_course_name=origin_course.name if origin_course else None,
        status=credit.status,
    )
