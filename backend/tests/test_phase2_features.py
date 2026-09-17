import pytest
from app.models.enums import SkillCategory, SKILL_LABELS, AttendanceStatus
from app.models.grade import Grade
from app.models.course_evaluation import CourseEvaluation
from app.schemas.grade import GradeCreate, GradeUpdate, GradeRead
from app.schemas.grading import CourseEvaluationCreate, CourseEvaluationRead
from app.schemas.attendance import (
    BulkAttendanceItem,
    BulkAttendanceRequest,
    BulkAttendanceResponse,
)
from app.schemas.kardex import KardexSummary, KardexCourseEntry
from app.services.grading import Component, FinalGrade


def test_skill_category_enum_and_labels():
    expected_skills = {"speaking", "listening", "reading", "writing", "grammar", "use_of_language"}
    actual_skills = {s.value for s in SkillCategory}
    assert expected_skills.issubset(actual_skills)

    for skill in SkillCategory:
        assert skill in SKILL_LABELS
        assert len(SKILL_LABELS[skill]) > 0


def test_grade_schema_with_skill():
    gc = GradeCreate(
        enrollment_id=1,
        evaluation_name="Speaking Midterm",
        score=8.5,
        skill=SkillCategory.speaking,
    )
    assert gc.skill == SkillCategory.speaking

    gu = GradeUpdate(score=9.0, skill=SkillCategory.writing)
    assert gu.skill == SkillCategory.writing

    gr = GradeRead(
        id=10,
        enrollment_id=1,
        session_id=None,
        evaluation_name="Speaking Midterm",
        score=8.5,
        skill=SkillCategory.speaking,
    )
    assert gr.skill == SkillCategory.speaking


def test_course_evaluation_schema_with_skill():
    cec = CourseEvaluationCreate(
        name="Listening Test 1",
        weight=2.0,
        skill=SkillCategory.listening,
    )
    assert cec.skill == SkillCategory.listening

    cer = CourseEvaluationRead(
        id=5,
        course_id=1,
        name="Listening Test 1",
        weight=2.0,
        skill=SkillCategory.listening,
    )
    assert cer.skill == SkillCategory.listening


def test_bulk_attendance_schemas():
    item1 = BulkAttendanceItem(enrollment_id=1, status=AttendanceStatus.present)
    item2 = BulkAttendanceItem(enrollment_id=2, status=AttendanceStatus.absent)
    req = BulkAttendanceRequest(items=[item1, item2])
    assert len(req.items) == 2
    assert req.items[0].status == AttendanceStatus.present
    assert req.items[1].status == AttendanceStatus.absent

    res = BulkAttendanceResponse(
        session_id=100,
        total_processed=2,
        created_count=2,
        updated_count=0,
        records=[],
    )
    assert res.total_processed == 2
    assert res.session_id == 100


def test_kardex_skills_schemas():
    summary = KardexSummary(
        global_gpa=8.2,
        overall_attendance_rate=92.5,
        total_courses_passed=3,
        total_courses_failed=0,
        person_status="active",
        person_status_label="Activo",
        outstanding_balance=0.0,
        skills_breakdown={
            "speaking": 8.5,
            "listening": 8.0,
            "reading": 9.0,
            "writing": 7.5,
        },
    )
    assert summary.skills_breakdown["speaking"] == 8.5
    assert summary.skills_breakdown["writing"] == 7.5

    entry = KardexCourseEntry(
        enrollment_id=1,
        course_id=1,
        course_title="Inglés B1 Intensivo",
        level_name="B1",
        status="active",
        status_label="Activo",
        enrollment_code="ENR-001",
        final_score=8.5,
        passed=True,
        balance=0.0,
        skills={"speaking": 8.5, "listening": 8.0},
    )
    assert entry.skills["speaking"] == 8.5


def test_component_dataclass_skill():
    comp = Component(
        name="Speaking Exam",
        score=8.0,
        weight=1.5,
        skill="speaking",
    )
    assert comp.skill == "speaking"
    assert comp.score == 8.0
