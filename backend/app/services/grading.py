"""Final-grade computation for a course enrolment.

Each distinct `evaluation_name` a student has is one *component* — its score is
the average of that name's grades (e.g. "Nota del día" averages every daily
mark). Components combine into the final grade by a weighted average, using the
course's configured weights; a component with no configured weight counts as 1,
so a course that configures nothing gets a plain average.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Course, CourseEvaluation, Enrollment, Grade


@dataclass
class Component:
    name: str
    score: float
    weight: float


@dataclass
class FinalGrade:
    final_score: float | None
    passing_score: float
    passed: bool
    components: list[Component]


def compute_final_grade(db: Session, enrollment: Enrollment) -> FinalGrade:
    course = db.get(Course, enrollment.course_id)
    passing = course.passing_score if course else 6.0

    weights = {
        name: weight
        for name, weight in db.execute(
            select(CourseEvaluation.name, CourseEvaluation.weight).where(
                CourseEvaluation.course_id == enrollment.course_id
            )
        ).all()
    }

    grades = db.scalars(
        select(Grade).where(Grade.enrollment_id == enrollment.id)
    ).all()

    # Average the grades that share an evaluation name into one component score.
    by_name: dict[str, list[float]] = {}
    for g in grades:
        by_name.setdefault(g.evaluation_name, []).append(g.score)

    components = [
        Component(
            name=name,
            score=sum(scores) / len(scores),
            weight=weights.get(name, 1.0),
        )
        for name, scores in sorted(by_name.items())
    ]

    total_weight = sum(c.weight for c in components)
    if not components or total_weight == 0:
        return FinalGrade(None, passing, False, components)

    final = sum(c.score * c.weight for c in components) / total_weight
    final = round(final, 2)
    return FinalGrade(final, passing, final >= passing, components)
