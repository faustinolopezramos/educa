"""Servicio de integración con la API de Ludi (Datanuki).

EDUCA actúa como intermediario (broker B2B / reseller) para las academias:
- EDUCA mantiene la clave API maestra (`settings.ludi_api_key`).
- Los datos de cada academia se aíslan de forma transparente utilizando el prefijo
  BYOI de Ludi (`ext:t_{tenant_id}_c_{course_id}` y `ext:t_{tenant_id}_u_{user_id}`).
- Ninguna academia ve datos de otra; Ludi factura a Educa el consumo consolidado.
"""

from __future__ import annotations

import logging
import random
from typing import Any
import uuid

from fastapi import HTTPException, status
import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import Course, CourseTeacher, ENROLLMENT_HAS_ACCESS, Enrollment, Tenant, User

logger = logging.getLogger(__name__)


def course_ext_id(tenant_id: int, course_id: int) -> str:
    """Identificador externo de curso para Ludi."""
    return f"ext:t_{tenant_id}_c_{course_id}"


def user_ext_id(tenant_id: int, user_id: int) -> str:
    """Identificador externo de usuario para Ludi."""
    return f"ext:t_{tenant_id}_u_{user_id}"


def parse_user_id_from_ext(ext_id: str) -> int | None:
    """Recupera el user_id de Educa a partir de un external_id de Ludi."""
    try:
        # Formato: "ext:t_1_u_42" o "t_1_u_42"
        clean = ext_id.removeprefix("ext:")
        parts = clean.split("_u_")
        if len(parts) == 2:
            return int(parts[1])
    except (ValueError, IndexError):
        pass
    return None


def ensure_tenant_has_ludi(tenant: Tenant, module: str | None = None) -> None:
    """Verifica que la academia tenga contratado y activo el paquete Ludi."""
    if not tenant.has_ludi_addon:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tu academia no tiene activo el paquete Ludi IA & Gamificación. Solicítalo en la sección de planes.",
        )
    if module and tenant.ludi_modules and module not in tenant.ludi_modules:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"El módulo '{module}' de Ludi no está habilitado en el paquete de tu academia.",
        )


class LudiClient:
    """Cliente HTTP para interactuar con la API REST de Ludi."""

    def __init__(self, api_key: str | None = None, base_url: str | None = None):
        self.api_key = api_key if api_key is not None else settings.ludi_api_key
        self.base_url = (base_url or settings.ludi_api_url).rstrip("/")

    @property
    def is_configured(self) -> bool:
        return bool(
            self.api_key
            and self.api_key.strip()
            and not self.api_key.startswith("lk_sandbox")
        )

    def _headers(self, idempotency_key: str | None = None) -> dict[str, str]:
        headers = {
            "x-api-key": self.api_key or "lk_sandbox_mock",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key
        return headers

    def _handle_response(self, response: httpx.Response) -> Any:
        if response.status_code == 401:
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY,
                "Error de autenticación con el proveedor Ludi (clave inválida o revocada).",
            )
        if response.status_code == 402:
            raise HTTPException(
                status.HTTP_402_PAYMENT_REQUIRED,
                "Se ha alcanzado la cuota contratada del servicio de IA de Ludi para este mes.",
            )
        if response.status_code == 403:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "Función de Ludi no habilitada en el plan actual de la plataforma.",
            )
        if response.status_code == 429:
            retry_after = response.headers.get("Retry-After", "5")
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                f"Límite de peticiones de Ludi alcanzado. Reintenta en {retry_after} segundos.",
            )

        try:
            data = response.json()
        except Exception:
            data = {"raw": response.text}

        if not response.is_success:
            err_msg = "Error en el servicio de Ludi."
            if isinstance(data, dict):
                error_obj = data.get("error")
                if isinstance(error_obj, dict):
                    err_msg = error_obj.get("message", err_msg)
                elif "message" in data:
                    err_msg = data["message"]
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Ludi API: {err_msg}",
            )

        return data

    def _request(
        self,
        method: str,
        path: str,
        *,
        json_data: Any = None,
        params: dict[str, Any] | None = None,
        idempotency_key: str | None = None,
        timeout: float = 30.0,
    ) -> Any:
        url = f"{self.base_url}{path}"
        headers = self._headers(idempotency_key=idempotency_key)

        try:
            with httpx.Client(timeout=timeout) as client:
                res = client.request(
                    method, url, json=json_data, params=params, headers=headers
                )
                return self._handle_response(res)
        except httpx.TimeoutException:
            logger.error("Timeout al contactar Ludi API en %s", path)
            raise HTTPException(
                status.HTTP_504_GATEWAY_TIMEOUT,
                "El servicio de IA de Ludi tardó demasiado en responder.",
            )
        except httpx.RequestError as exc:
            logger.error("Error de red conectando con Ludi API: %s", exc)
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY,
                f"No se pudo conectar con el servicio de Ludi: {str(exc)}",
            )

    # --- Métodos de API de Alto Nivel ---

    def ensure_course_exists(
        self, tenant_id: int, course_id: int, title: str, owner_teacher_id: int | None = None
    ) -> dict[str, Any]:
        """Registra o verifica la existencia del curso en Ludi con BYOI."""
        if not self.is_configured:
            return {"status": "ok", "external_id": course_ext_id(tenant_id, course_id), "sandbox": True}
        ext_id = course_ext_id(tenant_id, course_id)
        payload = {
            "title": title,
            "external_id": ext_id,
        }
        if owner_teacher_id:
            payload["owner_external_id"] = user_ext_id(tenant_id, owner_teacher_id)
        return self._request("POST", "/courses", json_data=payload)

    def sync_course_roster(
        self, db: Session, tenant: Tenant, course: Course
    ) -> dict[str, Any]:
        """Sincroniza declarativamente la lista de alumnos activos del curso en Ludi."""
        ensure_tenant_has_ludi(tenant)
        if not self.is_configured:
            return {"status": "synced", "course_id": course.id, "sandbox": True}
        owner_teacher_id = db.scalar(
            select(CourseTeacher.teacher_id).where(CourseTeacher.course_id == course.id)
        )
        self.ensure_course_exists(tenant.id, course.id, course.name, owner_teacher_id)

        enrollments = db.scalars(
            select(Enrollment)
            .where(
                Enrollment.course_id == course.id,
                Enrollment.status.in_(ENROLLMENT_HAS_ACCESS),
            )
        ).all()

        students_payload = []
        for e in enrollments:
            student = db.get(User, e.student_id)
            if student:
                students_payload.append(
                    {
                        "external_id": user_ext_id(tenant.id, student.id),
                        "name": student.full_name,
                    }
                )

        ext_c_id = course_ext_id(tenant.id, course.id)
        return self._request(
            "PATCH",
            f"/courses/{ext_c_id}/roster",
            json_data={"students": students_payload},
        )

    def assess_pronunciation(
        self,
        tenant: Tenant,
        course_id: int,
        audio_base64: str,
        reference_text: str,
        language: str = "en-US",
    ) -> dict[str, Any]:
        """Evaluación fonética de audio (Azure Pronunciation Assessment)."""
        ensure_tenant_has_ludi(tenant, module="voice")
        if not self.is_configured:
            return {
                "accuracy_score": 94.5,
                "fluency_score": 91.0,
                "completeness_score": 100.0,
                "prosody_score": 88.5,
                "pronunciation_score": 93.0,
                "words": [
                    {"word": w, "accuracy_score": 95.0} for w in reference_text.split()[:8]
                ],
                "sandbox": True,
            }
        ext_c_id = course_ext_id(tenant.id, course_id)
        payload = {
            "audio_base64": audio_base64,
            "reference_text": reference_text,
            "language": language,
        }
        return self._request("POST", f"/courses/{ext_c_id}/voice:assess", json_data=payload)

    def voice_turn(
        self,
        tenant: Tenant,
        course_id: int,
        audio_base64: str,
        history: list[dict[str, str]] | None = None,
        reference_text: str | None = None,
        language: str = "en-US",
        voice: str | None = None,
    ) -> dict[str, Any]:
        """Un turno de conversación por voz con el tutor interactivo."""
        ensure_tenant_has_ludi(tenant, module="voice")
        if not self.is_configured:
            return {
                "reply_audio_base64": "",
                "reply_text": "Respuesta simulada en entorno de desarrollo.",
                "accuracy_score": 92.0,
                "sandbox": True,
            }
        ext_c_id = course_ext_id(tenant.id, course_id)
        payload: dict[str, Any] = {
            "audio_base64": audio_base64,
            "language": language,
        }
        if history:
            payload["history"] = history
        if reference_text:
            payload["reference_text"] = reference_text
        if voice:
            payload["voice"] = voice
        return self._request("POST", f"/courses/{ext_c_id}/voice:turn", json_data=payload)

    def ask_tutor(
        self,
        tenant: Tenant,
        course_id: int,
        student_id: int,
        message: str,
        history: list[dict[str, str]] | None = None,
        audience: str | None = None,
    ) -> dict[str, Any]:
        """Tutor conversacional con RAG acotado al material del curso."""
        ensure_tenant_has_ludi(tenant, module="tutor")
        if not self.is_configured:
            return {
                "reply": f"¡Hola! Como tutor pedagógico de tu curso, he revisado tu consulta sobre '{message}'. Es un aspecto clave del contenido de esta semana. Te recomiendo repasar la lección y los ejercicios de práctica.",
                "sandbox": True,
            }
        payload: dict[str, Any] = {
            "message": message,
            "course_id": course_ext_id(tenant.id, course_id),
        }
        if history:
            payload["history"] = history
        if audience:
            payload["audience"] = audience
        return self._request("POST", "/tutor", json_data=payload)

    def generate_quiz(
        self,
        tenant: Tenant,
        course_id: int,
        topic: str,
        questions: int = 10,
    ) -> dict[str, Any]:
        """Genera un cuestionario interactivo con IA."""
        ensure_tenant_has_ludi(tenant, module="live")
        if not self.is_configured:
            num = min(max(questions, 1), 25)
            sample_bank = [
                {
                    "question": f"¿Cuál es el concepto central de {topic}?",
                    "options": [
                        f"Principio fundamental de aplicación de {topic}",
                        "Excepción secundaria no aplicable",
                        "Caso obsoleto en la práctica",
                        "Concepto opuesto al tema",
                    ],
                    "correct_index": 0,
                    "explanation": f"Este concepto define las bases teóricas y metodológicas de {topic}.",
                },
                {
                    "question": f"¿En cuál de las siguientes situaciones se aplica {topic}?",
                    "options": [
                        "En contextos formales y resolución de problemas prácticos",
                        "Nunca debe utilizarse en entornos académicos",
                        "Únicamente cuando no existen otras alternativas",
                        "Solo en situaciones informales o coloquiales",
                    ],
                    "correct_index": 0,
                    "explanation": f"{topic} permite estructurar adecuadamente las respuestas con precisión y coherencia.",
                },
                {
                    "question": f"¿Cuál es el error más frecuente al trabajar con {topic}?",
                    "options": [
                        "Descuidar la concordancia o estructura básica",
                        "Utilizar vocabulario técnico pertinente",
                        "Verificar dos veces las soluciones",
                        "Aplicar las reglas básicas paso a paso",
                    ],
                    "correct_index": 0,
                    "explanation": "El descuido en la concordancia suele ser el fallo recurrente detectado en las evaluaciones.",
                },
                {
                    "question": f"Identifica el ejemplo que mejor representa a {topic}:",
                    "options": [
                        f"Ejemplo representativo que cumple las normas de {topic}",
                        "Construcción ambigua no recomendada",
                        "Frase incompleta sin sujeto ni predicado",
                        "Ejemplo con inconsistencias estructurales",
                    ],
                    "correct_index": 0,
                    "explanation": "Cumple estrictamente con la normativa y el estándar pedagógico establecido.",
                },
                {
                    "question": f"¿Qué beneficio aporta dominar {topic} en el aprendizaje?",
                    "options": [
                        "Mayor fluidez, seguridad y rigor académico",
                        "No tiene impacto en la comunicación",
                        "Solo sirve para aprobar exámenes teóricos",
                        "Reduce la necesidad de practicar otras destrezas",
                    ],
                    "correct_index": 0,
                    "explanation": "Consolida las bases para avanzar hacia niveles superiores de dominio.",
                },
            ]
            generated_questions = []
            for i in range(num):
                tmpl = sample_bank[i % len(sample_bank)]
                generated_questions.append({
                    "id": f"q_{i+1}",
                    "question": f"{i+1}. {tmpl['question']}",
                    "options": tmpl["options"],
                    "correct_index": tmpl["correct_index"],
                    "explanation": tmpl["explanation"],
                })
            return {
                "quiz_id": f"quiz_sb_{uuid.uuid4().hex[:8]}",
                "topic": topic,
                "questions": generated_questions,
                "sandbox": True,
            }

        ext_c_id = course_ext_id(tenant.id, course_id)
        payload = {
            "topic": topic,
            "questions": str(min(max(questions, 1), 25)),
        }
        return self._request(
            "POST",
            f"/courses/{ext_c_id}/quizzes:generate",
            json_data=payload,
            idempotency_key=str(uuid.uuid4()),
        )

    def create_live_session(
        self, tenant: Tenant, quiz_id: str, host_teacher_id: int
    ) -> dict[str, Any]:
        """Abre una partida sincrónica en vivo tipo Kahoot con código PIN."""
        ensure_tenant_has_ludi(tenant, module="live")
        if not self.is_configured:
            pin = f"{random.randint(100000, 999999)}"
            return {
                "session_id": f"sess_sb_{uuid.uuid4().hex[:8]}",
                "quiz_id": quiz_id,
                "pin": pin,
                "status": "waiting",
                "sandbox": True,
            }
        payload = {
            "host_external_id": user_ext_id(tenant.id, host_teacher_id),
        }
        return self._request(
            "POST",
            f"/quizzes/{quiz_id}/sessions",
            json_data=payload,
            idempotency_key=str(uuid.uuid4()),
        )

    def get_live_session_status(self, session_id: str) -> dict[str, Any]:
        """Consulta el estado y marcador de una partida en vivo."""
        if not self.is_configured or session_id.startswith("sess_sb_"):
            return {
                "session_id": session_id,
                "status": "waiting",
                "participants_count": 0,
                "sandbox": True,
            }
        return self._request("GET", f"/sessions/{session_id}")

    def award_xp(
        self,
        tenant: Tenant,
        course_id: int,
        student_id: int,
        amount: int,
        source: str = "attendance",
        ref_id: str | None = None,
    ) -> dict[str, Any]:
        """Otorga puntos de experiencia (XP) a un alumno en el curso."""
        ensure_tenant_has_ludi(tenant, module="gamification")
        if not self.is_configured:
            return {
                "status": "awarded",
                "student_id": student_id,
                "amount": amount,
                "source": source,
                "sandbox": True,
            }
        ext_c_id = course_ext_id(tenant.id, course_id)
        payload: dict[str, Any] = {
            "external_id": user_ext_id(tenant.id, student_id),
            "amount": str(min(max(amount, 1), 10000)),
            "source": source,
        }
        if ref_id:
            payload["ref_id"] = ref_id
        return self._request(
            "POST",
            f"/courses/{ext_c_id}/xp",
            json_data=payload,
            idempotency_key=str(uuid.uuid4()),
        )

    def get_course_ranking(
        self, tenant: Tenant, course_id: int, db: Session | None = None
    ) -> list[dict[str, Any]]:
        """Consulta la tabla de posiciones (leaderboard) del curso."""
        ensure_tenant_has_ludi(tenant, module="gamification")
        if not self.is_configured:
            entries: list[dict[str, Any]] = []
            if db is not None:
                enrollments = db.scalars(
                    select(Enrollment).where(
                        Enrollment.course_id == course_id,
                        Enrollment.status.in_(ENROLLMENT_HAS_ACCESS),
                    )
                ).all()
                xp_base = 350
                for idx, e in enumerate(enrollments, start=1):
                    student = db.get(User, e.student_id)
                    if student:
                        entries.append({
                            "external_id": user_ext_id(tenant.id, student.id),
                            "name": student.full_name,
                            "xp": max(xp_base - (idx * 45), 30),
                            "rank": idx,
                            "streak_days": max(5 - idx, 1),
                        })
            if not entries:
                entries = [
                    {"external_id": f"ext:t_{tenant.id}_u_101", "name": "Sofía Morales", "xp": 420, "rank": 1, "streak_days": 4},
                    {"external_id": f"ext:t_{tenant.id}_u_102", "name": "Carlos Méndez", "xp": 360, "rank": 2, "streak_days": 3},
                    {"external_id": f"ext:t_{tenant.id}_u_103", "name": "Elena Castillo", "xp": 290, "rank": 3, "streak_days": 1},
                ]
            return entries

        ext_c_id = course_ext_id(tenant.id, course_id)
        ranking = self._request("GET", f"/courses/{ext_c_id}/ranking")
        return ranking if isinstance(ranking, list) else ranking.get("items", [])

    def get_account_status(self) -> dict[str, Any]:
        """Consulta el estado y consumo de la cuenta maestra de Educa en Ludi."""
        if not self.is_configured:
            return {
                "plan": "Scale Intermediary",
                "monthly_consumption_gtq": 0.0,
                "sandbox": True,
            }
        return self._request("GET", "/account")


# Instancia por defecto del cliente
ludi_client = LudiClient()
