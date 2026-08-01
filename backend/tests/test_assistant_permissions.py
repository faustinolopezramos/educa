"""The `assistant` role: what the menu offers is what the API allows.

The role shipped half-wired. Only four endpoints ever consulted the permission
list; everything else was still guarded by `require_role(UserRole.admin)`, which
does not know the role exists. So an assistant granted `manage_catalog` was shown
Aulas and Festivos and got a 403 from both, one granted `manage_finance` was shown
Finanzas and got a 403, and one granted `view_reports` got a report that came back
empty because `scoped_course_ids` had no branch for them and fell through to the
student one.

These tests pin each permission to the endpoints it is advertised to open.
"""

import pytest

from app.models import Permission, User, UserRole
from tests.conftest import auth, make_user


@pytest.fixture
def assistant(db):
    """Factory: an assistant holding exactly the permissions asked for."""

    def _make(*permissions: Permission, email: str = "assistant@test.com") -> User:
        user = make_user(db, email, UserRole.assistant)
        user.permissions = [p.value for p in permissions]
        db.flush()
        return user

    return _make


def _login(client, email="assistant@test.com"):
    return auth(client, email)


# ---------------- The endpoints the menu advertises ----------------
#
# Reading the timetable, the room list and the holiday calendar is open to any
# authenticated user on purpose — a teacher needs all three. What a permission
# gates is *changing* them, so that is what these exercise.
def _writes(world):
    return [
        (Permission.manage_catalog, "post", "/rooms", {"name": "Aula 1"}, 201),
        (
            Permission.manage_catalog,
            "post",
            "/holidays",
            {"date": "2030-12-25", "name": "Navidad"},
            201,
        ),
        (
            Permission.manage_finance,
            "post",
            "/payments",
            {
                "enrollment_id": world["enrollment"].id,
                "kind": "payment",
                "amount": 50.0,
            },
            201,
        ),
    ]


def test_a_granted_permission_opens_the_section_it_advertises(
    client, assistant, world
):
    for permission, method, path, body, expected in _writes(world):
        user = assistant(permission, email=f"grant_{permission.value}@test.com")
        res = getattr(client, method)(
            path, headers=_login(client, user.email), json=body
        )
        assert res.status_code == expected, f"{permission.value} → {path}: {res.text}"


def test_an_assistant_without_the_permission_is_still_refused(client, assistant, world):
    """The other half of the deal: the sections stay shut without the grant."""
    for permission, method, path, body, _ in _writes(world):
        # Hold a *different* permission, so the refusal is about this one.
        other = (
            Permission.manage_students
            if permission is not Permission.manage_students
            else Permission.manage_teachers
        )
        user = assistant(other, email=f"deny_{permission.value}@test.com")
        res = getattr(client, method)(
            path, headers=_login(client, user.email), json=body
        )
        assert res.status_code == 403, f"{path}: {res.status_code} {res.text}"


def test_the_timetable_stays_readable_without_any_management_permission(
    client, assistant
):
    """Gating writes must not have shut the doors a teacher walks through."""
    assistant(Permission.manage_students)
    for path in ("/rooms", "/holidays", "/schedules"):
        res = client.get(path, headers=_login(client))
        assert res.status_code == 200, f"{path}: {res.text}"


# ---------------- Reports ----------------
def test_view_reports_returns_the_academy_not_an_empty_shell(client, assistant, world):
    """An assistant used to fall through to the student branch of
    `scoped_course_ids`, so the report came back with zeros and no explanation."""
    assistant(Permission.view_reports)
    res = client.get("/reports?period=month", headers=_login(client))
    assert res.status_code == 200, res.text
    admin_view = client.get(
        "/reports?period=month", headers=auth(client, "admin@test.com")
    ).json()
    assert res.json()["sessions_total"] == admin_view["sessions_total"]


def test_reports_refuse_an_assistant_who_was_never_granted_them(client, assistant):
    assistant(Permission.manage_catalog)
    res = client.get("/reports?period=week", headers=_login(client))
    assert res.status_code == 403, res.text


# ---------------- The user directory ----------------
def test_the_directory_answers_only_to_the_two_people_permissions(client, assistant):
    """`manage_finance` is not a licence to read every account in the academy."""
    assistant(Permission.manage_finance)
    res = client.get("/users", headers=_login(client))
    assert res.status_code == 403, res.text


def test_an_assistant_sees_only_the_population_they_manage(client, assistant, world):
    assistant(Permission.manage_students)
    res = client.get("/users", headers=_login(client))
    assert res.status_code == 200, res.text
    roles = {u["role"] for u in res.json()["items"]}
    assert roles == {"student"}, roles


def test_managing_students_does_not_extend_to_editing_a_teacher(
    client, assistant, world
):
    assistant(Permission.manage_students)
    res = client.patch(
        f"/users/{world['teacher_a'].id}",
        headers=_login(client),
        json={"full_name": "Renamed"},
    )
    assert res.status_code == 403, res.text


def test_an_assistant_may_edit_a_student_they_manage(client, assistant, world):
    assistant(Permission.manage_students)
    res = client.patch(
        f"/users/{world['student'].id}",
        headers=_login(client),
        json={"full_name": "Nombre Corregido"},
    )
    assert res.status_code == 200, res.text
    assert res.json()["full_name"] == "Nombre Corregido"


def test_an_assistant_cannot_promote_a_student_into_a_role_they_do_not_manage(
    client, assistant, world
):
    """Guarding only the account being edited would let an assistant hand out a
    role they were never trusted with."""
    assistant(Permission.manage_students)
    res = client.patch(
        f"/users/{world['student'].id}",
        headers=_login(client),
        json={"role": "admin"},
    )
    assert res.status_code == 403, res.text


def test_an_assistant_cannot_delete_an_admin(client, assistant, world):
    assistant(Permission.manage_students, Permission.manage_teachers)
    res = client.delete(f"/users/{world['admin'].id}", headers=_login(client))
    assert res.status_code == 403, res.text


# ---------------- Audit stays admin-only ----------------
def test_the_audit_trail_is_not_reachable_by_any_permission(client, assistant):
    assistant(*list(Permission))
    res = client.get("/audit", headers=_login(client))
    assert res.status_code == 403, res.text


# ---------------- The permission list is closed ----------------
def test_a_misspelt_permission_is_rejected_rather_than_silently_stored(client, world):
    """Stored as free text, `manage_finances` looked right in the form, saved
    without complaint and granted nothing."""
    admin = auth(client, "admin@test.com")
    res = client.post(
        "/users",
        headers=admin,
        json={
            "email": "typo@test.com",
            "full_name": "Typo",
            "password": "secret123",
            "role": "assistant",
            "permissions": ["manage_finances"],
        },
    )
    assert res.status_code == 422, res.text


def test_the_backend_and_frontend_permission_lists_agree():
    """The catalog lived only in the frontend; this keeps the copy honest."""
    import pathlib
    import re

    types_ts = (
        pathlib.Path(__file__).resolve().parents[2]
        / "frontend"
        / "src"
        / "lib"
        / "types.ts"
    ).read_text()
    block = re.search(r"export type Permission =(.*?);", types_ts, re.S).group(1)
    in_frontend = set(re.findall(r'"([a-z_]+)"', block))
    assert in_frontend == {p.value for p in Permission}
