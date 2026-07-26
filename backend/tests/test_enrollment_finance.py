"""Enrollment_code (correlativo), cuota, and the Payment/Invoice ledger."""

from tests.conftest import auth


def _enroll(client, headers, *, student_id, course_id, amount=0.0):
    return client.post(
        "/enrollments",
        headers=headers,
        json={"student_id": student_id, "course_id": course_id, "amount": amount},
    )


def test_a_new_enrollment_gets_a_sequential_code(client, world):
    admin = auth(client, "admin@test.com")
    res = _enroll(
        client, admin, student_id=world["outsider"].id, course_id=world["course_b"].id
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["enrollment_code"]
    assert body["amount"] == 0.0


def test_an_enrollment_with_a_cuota_seeds_an_initial_charge(client, world):
    admin = auth(client, "admin@test.com")
    enrollment = _enroll(
        client,
        admin,
        student_id=world["outsider"].id,
        course_id=world["course_b"].id,
        amount=500.0,
    ).json()

    ledger = client.get(f"/enrollments/{enrollment['id']}/ledger", headers=admin).json()
    assert ledger["charged"] == 500.0
    assert ledger["paid"] == 0.0
    assert ledger["balance"] == 500.0
    assert len(ledger["movements"]) == 1
    assert ledger["movements"][0]["kind"] == "charge"


def test_registering_a_payment_reduces_the_balance(client, world):
    admin = auth(client, "admin@test.com")
    enrollment = _enroll(
        client,
        admin,
        student_id=world["outsider"].id,
        course_id=world["course_b"].id,
        amount=300.0,
    ).json()

    res = client.post(
        "/payments",
        headers=admin,
        json={
            "enrollment_id": enrollment["id"],
            "kind": "payment",
            "amount": 100.0,
            "method": "efectivo",
        },
    )
    assert res.status_code == 201, res.text

    ledger = client.get(f"/enrollments/{enrollment['id']}/ledger", headers=admin).json()
    assert ledger["charged"] == 300.0
    assert ledger["paid"] == 100.0
    assert ledger["balance"] == 200.0


def test_an_invoice_can_be_issued_once_something_has_been_paid(client, world):
    admin = auth(client, "admin@test.com")
    enrollment = _enroll(
        client,
        admin,
        student_id=world["outsider"].id,
        course_id=world["course_b"].id,
        amount=300.0,
    ).json()

    # No payments yet — nothing to invoice.
    blocked = client.post(f"/enrollments/{enrollment['id']}/invoice", headers=admin)
    assert blocked.status_code == 409

    client.post(
        "/payments",
        headers=admin,
        json={"enrollment_id": enrollment["id"], "kind": "payment", "amount": 300.0},
    )

    invoice = client.post(f"/enrollments/{enrollment['id']}/invoice", headers=admin)
    assert invoice.status_code == 201, invoice.text
    body = invoice.json()
    assert body["total_amount"] == 300.0
    assert body["code"]

    pdf = client.get(f"/invoices/{body['id']}/pdf", headers=admin)
    assert pdf.status_code == 200
    assert pdf.headers["content-type"] == "application/pdf"


def test_payments_and_invoices_are_admin_only(client, world):
    teacher = auth(client, "teacher_a@test.com")
    res = client.post(
        "/payments",
        headers=teacher,
        json={
            "enrollment_id": world["enrollment"].id,
            "kind": "payment",
            "amount": 50.0,
        },
    )
    assert res.status_code == 403


def test_enrollment_status_covers_the_five_stakeholder_values(client, world):
    admin = auth(client, "admin@test.com")
    for value in ("enrolled", "active", "inactive", "certified", "withdrawn"):
        res = client.patch(
            f"/enrollments/{world['enrollment'].id}",
            headers=admin,
            json={"status": value},
        )
        assert res.status_code == 200, f"{value}: {res.text}"
        assert res.json()["status"] == value
