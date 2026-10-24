"""Router de integración con Ludi (Datanuki).

Permite a los alumnos y profesores de academias con el paquete Ludi activo:
1. Evaluar pronunciación fonética por audio con IA.
2. Conversar con el tutor pedagógico acotado al material del curso.
3. Generar cuestionarios interactivos con IA.
4. Abrir partidas sincrónicas en vivo con PIN (estilo Kahoot).
5. Visualizar rankings de gamificación y otorgar XP.
6. Administrar la solicitud y activación del paquete B2B por academia.
"""

from __future__ import annotations

from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import (
    course_in_scope_or_404,
    get_current_user,
    in_tenant,
    is_admin,
    require_role,
    student_course_ids,
    teacher_teaches_course,
)
from app.models import Course, Tenant, User, UserRole
from app.schemas.ludi import (
    AwardXPRequest,
    LeaderboardEntry,
    LiveSessionCreateRequest,
    PronunciationPracticeRequest,
    PronunciationPracticeResponse,
    QuizGenerateRequest,
    TutorChatRequest,
    TutorChatResponse,
)
from app.schemas.tenant import LudiAddonActivate, LudiAddonRequest
from app.services import ludi as ludi_svc
from app.services import tenant_plans

router = APIRouter(prefix="/ludi", tags=["ludi"])

_superadmin_only = require_role(UserRole.superadmin)
_admin_only = require_role(UserRole.admin)


@router.get("/status", response_model=dict[str, Any])
def get_ludi_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Retorna si la academia del usuario actual tiene Ludi activo y qué módulos."""
    if current_user.tenant_id is None:
        return {"has_ludi_addon": False, "modules": []}
    tenant = db.get(Tenant, current_user.tenant_id)
    if not tenant:
        return {"has_ludi_addon": False, "modules": []}
    return {
        "has_ludi_addon": bool(tenant.has_ludi_addon),
        "modules": tenant.ludi_modules or [],
    }



def _require_tenant_for_user(db: Session, user: User) -> Tenant:
    if user.tenant_id is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Este usuario no pertenece a ninguna academia."
        )
    tenant = db.get(Tenant, user.tenant_id)
    if tenant is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Academia no encontrada.")
    return tenant


def _ensure_access_to_course(db: Session, user: User, course: Course) -> None:
    """Verifica que el usuario pertenezca al curso (alumno inscrito o profesor/admin)."""
    if is_admin(user):
        return
    if user.role == UserRole.teacher:
        if not teacher_teaches_course(db, user.id, course.id):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN, "No impartes este curso."
            )
        return
    if user.role == UserRole.student:
        enrolled_ids = student_course_ids(db, user.id)
        if course.id not in enrolled_ids:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN, "No estás matriculado en este curso."
            )
        return
    raise HTTPException(status.HTTP_403_FORBIDDEN, "Acceso no autorizado al curso.")


# ---------------- 1. Laboratorio de Pronunciación ----------------

@router.post("/practice/pronunciation", response_model=PronunciationPracticeResponse)
def assess_pronunciation(
    payload: PronunciationPracticeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PronunciationPracticeResponse:
    """Evalúa la pronunciación de un clip de audio del alumno contra un texto de referencia."""
    tenant = _require_tenant_for_user(db, current_user)
    course = course_in_scope_or_404(db, current_user, payload.course_id)
    _ensure_access_to_course(db, current_user, course)

    result = ludi_svc.ludi_client.assess_pronunciation(
        tenant=tenant,
        course_id=course.id,
        audio_base64=payload.audio_base64,
        reference_text=payload.reference_text,
        language=payload.language,
    )

    # Extraer métricas clave si vienen estructuradas
    scores = result if isinstance(result, dict) else {}
    return PronunciationPracticeResponse(
        accuracy_score=scores.get("accuracy_score") or scores.get("accuracy"),
        fluency_score=scores.get("fluency_score") or scores.get("fluency"),
        completeness_score=scores.get("completeness_score") or scores.get("completeness"),
        prosody_score=scores.get("prosody_score") or scores.get("prosody"),
        pronunciation_score=scores.get("pronunciation_score") or scores.get("score"),
        words=scores.get("words"),
        raw=scores,
    )


# ---------------- 2. Tutor Pedagógico con RAG ----------------

@router.post("/tutor/chat", response_model=TutorChatResponse)
def chat_with_tutor(
    payload: TutorChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TutorChatResponse:
    """Conversa con el tutor de IA acotado a los materiales del curso."""
    tenant = _require_tenant_for_user(db, current_user)
    course = course_in_scope_or_404(db, current_user, payload.course_id)
    _ensure_access_to_course(db, current_user, course)

    result = ludi_svc.ludi_client.ask_tutor(
        tenant=tenant,
        course_id=course.id,
        student_id=current_user.id,
        message=payload.message,
        history=payload.history,
    )

    reply = "Respuesta generada por el tutor."
    if isinstance(result, dict):
        reply = result.get("reply") or result.get("response") or result.get("message") or str(result)
    elif isinstance(result, str):
        reply = result

    return TutorChatResponse(reply=reply, raw=result if isinstance(result, dict) else None)


# ---------------- 3. Generación de Quizzes & Partidas en Vivo ----------------

@router.post("/courses/{course_id}/quizzes/generate", response_model=dict[str, Any])
def generate_quiz(
    course_id: int,
    payload: QuizGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Genera un cuestionario interactivo con preguntas de opción múltiple."""
    tenant = _require_tenant_for_user(db, current_user)
    course = course_in_scope_or_404(db, current_user, course_id)

    if not (is_admin(current_user) or teacher_teaches_course(db, current_user.id, course.id)):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Solo el docente del curso o un administrador puede generar quizzes."
        )

    return ludi_svc.ludi_client.generate_quiz(
        tenant=tenant,
        course_id=course.id,
        topic=payload.topic,
        questions=payload.questions,
    )


@router.post("/quizzes/live-session", response_model=dict[str, Any])
def create_live_quiz_session(
    payload: LiveSessionCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Abre una partida sincrónica con PIN para que los alumnos ingresen en tiempo real."""
    tenant = _require_tenant_for_user(db, current_user)
    if current_user.role == UserRole.student:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Solo los profesores o administradores pueden iniciar partidas."
        )

    return ludi_svc.ludi_client.create_live_session(
        tenant=tenant,
        quiz_id=payload.quiz_id,
        host_teacher_id=current_user.id,
    )


@router.get("/sessions/{session_id}", response_model=dict[str, Any])
def get_live_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Consulta el estado y marcador de una partida sincrónica en vivo."""
    _require_tenant_for_user(db, current_user)
    return ludi_svc.ludi_client.get_live_session_status(session_id)


# ---------------- 4. Gamificación: XP y Leaderboard ----------------

@router.post("/xp", response_model=dict[str, Any])
def award_xp(
    payload: AwardXPRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Otorga puntos de experiencia (XP) a un alumno."""
    tenant = _require_tenant_for_user(db, current_user)
    course = course_in_scope_or_404(db, current_user, payload.course_id)

    if not (is_admin(current_user) or teacher_teaches_course(db, current_user.id, course.id)):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Solo profesores o administradores pueden otorgar XP.")

    student = db.get(User, payload.student_id)
    if not student or not in_tenant(current_user, student) or student.role != UserRole.student:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Alumno no válido en esta academia.")

    return ludi_svc.ludi_client.award_xp(
        tenant=tenant,
        course_id=course.id,
        student_id=student.id,
        amount=payload.amount,
        source=payload.source,
        ref_id=payload.ref_id,
    )


@router.get("/courses/{course_id}/ranking", response_model=list[LeaderboardEntry])
def get_course_ranking(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[LeaderboardEntry]:
    """Retorna la tabla de posiciones (leaderboard) del curso mapeada con nombres de Educa."""
    tenant = _require_tenant_for_user(db, current_user)
    course = course_in_scope_or_404(db, current_user, course_id)
    _ensure_access_to_course(db, current_user, course)

    raw_ranking = ludi_svc.ludi_client.get_course_ranking(tenant, course.id, db=db)
    entries: list[LeaderboardEntry] = []

    for idx, item in enumerate(raw_ranking, start=1):
        ext_user_id = item.get("external_id") or item.get("user_id") or ""
        uid = (
            ludi_svc.parse_user_id_from_ext(ext_user_id)
            or item.get("student_id")
            or item.get("user_id")
            or idx
        )
        student_name = item.get("name") or item.get("student_name")

        if uid and not student_name:
            st = db.get(User, uid)
            if st and in_tenant(current_user, st):
                student_name = st.full_name

        entries.append(
            LeaderboardEntry(
                student_id=uid,
                student_name=student_name or f"Estudiante #{uid}",
                xp=int(item.get("xp") or item.get("points") or 0),
                rank=int(item.get("rank") or idx),
            )
        )

    return entries


@router.post("/courses/{course_id}/sync-roster", response_model=dict[str, Any])
def sync_roster(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Sincroniza la lista de alumnos inscritos en Educa con Ludi."""
    tenant = _require_tenant_for_user(db, current_user)
    course = course_in_scope_or_404(db, current_user, course_id)

    if not (is_admin(current_user) or teacher_teaches_course(db, current_user.id, course.id)):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Requiere permisos de docencia o dirección.")

    return ludi_svc.ludi_client.sync_course_roster(db, tenant, course)


# ---------------- 5. Gestión del Paquete (Intermediación B2B) ----------------

@router.post("/addon/request", response_model=dict[str, Any])
def request_ludi_addon(
    payload: LudiAddonRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(_admin_only),
) -> dict[str, Any]:
    """El Director de la academia solicita la activación del paquete Ludi a Educa."""
    tenant = _require_tenant_for_user(db, current_user)
    tenant_plans.request_ludi_addon(db, current_user, tenant, modules=payload.modules)
    db.commit()
    db.refresh(tenant)
    return {
        "message": "Solicitud enviada a Educa. El superadministrador activará el paquete al confirmar el acuerdo.",
        "ludi_requested": tenant.ludi_requested,
        "ludi_requested_at": tenant.ludi_requested_at,
        "modules": tenant.ludi_modules,
    }


@router.post("/addon/toggle", response_model=dict[str, Any])
def toggle_ludi_addon(
    payload: LudiAddonActivate,
    tenant_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(_admin_only),
) -> dict[str, Any]:
    """Permite al Administrador activar o desactivar Ludi directamente para su academia."""
    if current_user.role == UserRole.superadmin and tenant_id is not None:
        tenant = db.get(Tenant, tenant_id)
        if not tenant:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Academia no encontrada.")
    else:
        tenant = _require_tenant_for_user(db, current_user)

    if payload.enabled:
        tenant_plans.activate_ludi_addon(db, current_user, tenant, modules=payload.modules)
    else:
        tenant_plans.deactivate_ludi_addon(db, current_user, tenant)

    db.commit()
    db.refresh(tenant)
    return {
        "tenant_id": tenant.id,
        "has_ludi_addon": tenant.has_ludi_addon,
        "ludi_modules": tenant.ludi_modules,
    }


@router.post("/tenants/{tenant_id}/activate", response_model=dict[str, Any])
def activate_ludi_addon(
    tenant_id: int,
    payload: LudiAddonActivate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_superadmin_only),
) -> dict[str, Any]:
    """El Superadmin de Educa activa el paquete Ludi para la academia."""
    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Academia no encontrada.")

    if payload.enabled:
        tenant_plans.activate_ludi_addon(db, current_user, tenant, modules=payload.modules)
    else:
        tenant_plans.deactivate_ludi_addon(db, current_user, tenant)

    db.commit()
    db.refresh(tenant)
    return {
        "tenant_id": tenant.id,
        "has_ludi_addon": tenant.has_ludi_addon,
        "ludi_modules": tenant.ludi_modules,
    }


@router.get("/account-status", response_model=dict[str, Any])
def get_ludi_account_status(
    _: User = Depends(_superadmin_only),
) -> dict[str, Any]:
    """Superadmin: Consulta el consumo mensual consolidado y factura estimada en Ludi (GTQ)."""
    return ludi_svc.ludi_client.get_account_status()
