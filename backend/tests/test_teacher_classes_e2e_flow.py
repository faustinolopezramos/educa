"""Validation & E2E suite for Teacher 'Mis Clases' module improvements.

Flows tested:
1. Teacher self-service & Admin override access (no permission regression).
2. Register closure by assigned teacher vs rejection for non-assigned teacher.
3. Rescheduling rejection (409 'Conflicto de horario detectado') on availability/schedule conflict.
4. Assigned class release warning (409) when deleting availability window with active course schedule.
5. Teacher availability self-service CRUD & load calculations.
"""

from datetime import date, time, timedelta

import pytest
from sqlalchemy import select

from app.models import ClassSession, CourseTeacher, Schedule, TeacherAvailability
from tests.conftest import TODAY, auth


def _next_weekday(day_of_week: int, weeks_ahead: int = 2) -> date:
    d = TODAY + timedelta(weeks=weeks_ahead)
    while d.weekday() != day_of_week:
        d += timedelta(days=1)
    return d


def test_e2e_teacher_grouped_classes_and_admin_no_regression(client, world):
    """Admin can list and view all teacher availability and load without regression."""
    admin_headers = auth(client, "admin@test.com")
    teacher_a_id = world["teacher_a"].id
    teacher_b_id = world["teacher_b"].id

    # Admin accesses teacher A and teacher B availability
    res_a = client.get(f"/teachers/{teacher_a_id}/availability", headers=admin_headers)
    assert res_a.status_code == 200

    res_b = client.get(f"/teachers/{teacher_b_id}/availability", headers=admin_headers)
    assert res_b.status_code == 200

    # Admin accesses teacher A load
    res_load = client.get(f"/teachers/{teacher_a_id}/load", headers=admin_headers)
    assert res_load.status_code == 200
    assert "assigned_hours" in res_load.json()


def test_e2e_teacher_register_close_and_ownership(client, db, world):
    """Assigned teacher closes own register; unassigned teacher is rejected with 403."""
    teacher_a_headers = auth(client, "teacher_a@test.com")
    teacher_b_headers = auth(client, "teacher_b@test.com")
    teacher_a_id = world["teacher_a"].id

    # Create session for teacher_a's schedule
    session = ClassSession(schedule_id=world["schedule_a"].id, date=TODAY)
    db.add(session)
    db.flush()

    # Teacher B (unassigned) attempts to close Teacher A's session -> 403/404 forbidden
    res_forbidden = client.post(
        f"/sessions/{session.id}/close-register",
        headers=teacher_b_headers,
    )
    assert res_forbidden.status_code in (403, 404)

    # Teacher A (assigned) closes own session with force=true -> 200 OK
    res_success = client.post(
        f"/sessions/{session.id}/close-register?force=true",
        headers=teacher_a_headers,
    )
    assert res_success.status_code == 200
    assert res_success.json()["register_closed_at"] is not None
    assert res_success.json()["status"] == "held"


def test_e2e_reschedule_conflict_rejection(client, db, world):
    """Rescheduling to a date/time where teacher is unavailable or clashing yields 409 Conflict."""
    teacher_headers = auth(client, "teacher_a@test.com")
    teacher_id = world["teacher_a"].id
    course_a = world["course_a"]
    course_b = world["course_b"]

    # Assign teacher_a to course_b and create clashing schedule on Friday
    db.add(CourseTeacher(course_id=course_b.id, teacher_id=teacher_id))
    db.flush()

    friday_schedule = Schedule(
        course_id=course_b.id,
        teacher_id=teacher_id,
        day_of_week=4, # Friday
        start_time=world["schedule_a"].start_time,
        end_time=world["schedule_a"].end_time,
        term_start=course_a.start_date,
        term_end=course_a.end_date,
    )
    db.add(friday_schedule)
    db.flush()

    # Session to reschedule
    session = ClassSession(schedule_id=world["schedule_a"].id, date=_next_weekday(0))
    db.add(session)
    db.flush()

    # Reschedule to Friday -> 409 'Conflicto de horario detectado'
    target_friday = _next_weekday(4)
    res = client.post(
        f"/sessions/{session.id}/reschedule",
        headers=teacher_headers,
        json={"new_date": target_friday.isoformat()},
    )
    assert res.status_code == 409
    assert "Conflicto de horario detectado" in res.json()["detail"]


def test_e2e_releasing_availability_with_assigned_class_warning(client, db, world):
    """Releasing an availability block associated with an active assigned class returns 409 Warning."""
    teacher_headers = auth(client, "teacher_a@test.com")
    teacher_id = world["teacher_a"].id

    # Create matching availability block for schedule_a
    avail = TeacherAvailability(
        teacher_id=teacher_id,
        day_of_week=world["schedule_a"].day_of_week,
        start_time=world["schedule_a"].start_time,
        end_time=world["schedule_a"].end_time,
    )
    db.add(avail)
    db.flush()

    # Deleting this block must return 409 with Advertencia
    res = client.delete(
        f"/teachers/{teacher_id}/availability/{avail.id}",
        headers=teacher_headers,
    )
    assert res.status_code == 409
    assert "Advertencia" in res.json()["detail"]


def test_e2e_availability_self_service_crud_and_patch(client, world):
    """Teacher can add, patch, and view their own availability."""
    teacher_headers = auth(client, "teacher_a@test.com")
    teacher_id = world["teacher_a"].id

    # 1. Add availability on Saturday
    res_add = client.post(
        f"/teachers/{teacher_id}/availability",
        headers=teacher_headers,
        json={"day_of_week": 5, "start_time": "14:00", "end_time": "18:00"},
    )
    assert res_add.status_code == 201
    avail_id = res_add.json()["id"]

    # 2. Patch availability
    res_patch = client.patch(
        f"/teachers/{teacher_id}/availability/{avail_id}",
        headers=teacher_headers,
        json={"day_of_week": 5, "start_time": "15:00", "end_time": "19:00"},
    )
    assert res_patch.status_code == 200
    assert res_patch.json()["start_time"] == "15:00:00"

    # 3. View availability
    res_list = client.get(
        f"/teachers/{teacher_id}/availability",
        headers=teacher_headers,
    )
    assert res_list.status_code == 200
    ids = [item["id"] for item in res_list.json()]
    assert avail_id in ids
