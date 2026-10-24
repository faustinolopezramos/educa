from __future__ import annotations

from typing import Any
from pydantic import BaseModel, Field


class PronunciationPracticeRequest(BaseModel):
    course_id: int
    audio_base64: str = Field(..., description="Audio en base64 (WAV PCM 16k recomendada)")
    reference_text: str = Field(..., description="Texto esperado que el alumno debía pronunciar")
    language: str = Field("en-US", description="Idioma fonético, ej. en-US, en-GB, es-ES")


class PronunciationWordScore(BaseModel):
    word: str
    accuracy_score: float | None = None
    error_type: str | None = None


class PronunciationPracticeResponse(BaseModel):
    accuracy_score: float | None = None
    fluency_score: float | None = None
    completeness_score: float | None = None
    prosody_score: float | None = None
    pronunciation_score: float | None = None
    words: list[dict[str, Any]] | None = None
    raw: dict[str, Any] | None = None


class TutorChatRequest(BaseModel):
    course_id: int
    message: str = Field(..., min_length=1)
    history: list[dict[str, str]] | None = Field(default=None, description="Array de [{role, content}]")


class TutorChatResponse(BaseModel):
    reply: str
    raw: dict[str, Any] | None = None


class QuizGenerateRequest(BaseModel):
    course_id: int
    topic: str = Field(..., min_length=2, max_length=200)
    questions: int = Field(10, ge=1, le=25)


class LiveSessionCreateRequest(BaseModel):
    quiz_id: str


class AwardXPRequest(BaseModel):
    course_id: int
    student_id: int
    amount: int = Field(..., ge=1, le=10000)
    source: str = Field("manual", max_length=50)
    ref_id: str | None = Field(None, max_length=100)


class LeaderboardEntry(BaseModel):
    student_id: int
    student_name: str
    xp: int
    rank: int | None = None
