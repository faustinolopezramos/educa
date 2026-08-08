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
            "method": "transfer",
            "receipt_number": "BOL-987654",
        },
    )
    assert res.status_code == 201, res.text
    assert res.json()["receipt_number"] == "BOL-987654"

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


def test_money_movements_leave_an_audit_trail(client, world):
    """Registering a payment or issuing a receipt must be attributable.

    Finance was the one module that mutated records without recording who did
    it — the trail could not answer "who took this money in?" months later.
    """
    admin = auth(client, "admin@test.com")
    enrollment = _enroll(
        client,
        admin,
        student_id=world["outsider"].id,
        course_id=world["course_b"].id,
        amount=300.0,
    ).json()

    client.post(
        "/payments",
        headers=admin,
        json={"enrollment_id": enrollment["id"], "kind": "payment", "amount": 300.0},
    )
    invoice = client.post(
        f"/enrollments/{enrollment['id']}/invoice", headers=admin
    ).json()

    payments = client.get("/audit?entity=payment", headers=admin).json()["items"]
    assert payments, "a payment must be auditable"
    assert payments[0]["actor_id"] == world["admin"].id
    assert payments[0]["after"]["amount"] == 300.0

    invoices = client.get(
        f"/audit?entity=invoice&entity_id={invoice['id']}", headers=admin
    ).json()["items"]
    assert len(invoices) == 1
    assert invoices[0]["actor_id"] == world["admin"].id


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


def test_the_lifecycle_walks_forward_through_the_five_stakeholder_values(
    client, world
):
    """The five states are a path, not five interchangeable labels.

    This used to assert that *any* status could be set from any other, which is
    exactly what let a matrícula be walked back from "Desistió" to "Activo".
    """
    admin = auth(client, "admin@test.com")
    enrollment_id = world["enrollment"].id

    # active → inactive → active → certified is the long way round, and legal.
    for value in ("inactive", "active", "certified"):
        res = client.patch(
            f"/enrollments/{enrollment_id}", headers=admin, json={"status": value}
        )
        assert res.status_code == 200, f"{value}: {res.text}"
        assert res.json()["status"] == value


def test_a_terminal_status_cannot_be_walked_back(client, world):
    admin = auth(client, "admin@test.com")
    enrollment_id = world["enrollment"].id

    assert (
        client.patch(
            f"/enrollments/{enrollment_id}", headers=admin, json={"status": "withdrawn"}
        ).status_code
        == 200
    )
    res = client.patch(
        f"/enrollments/{enrollment_id}", headers=admin, json={"status": "active"}
    )
    assert res.status_code == 409, res.text
    assert res.json()["detail"]["reason"] == "illegal_transition"


def test_resending_the_status_it_already_has_is_a_no_op(client, world):
    """A PATCH that carries the current status alongside another field — which
    is what a form submitting every field does — must not be read as a move."""
    admin = auth(client, "admin@test.com")
    res = client.patch(
        f"/enrollments/{world['enrollment'].id}",
        headers=admin,
        json={"status": "active", "amount": 25.0},
    )
    assert res.status_code == 200, res.text
    assert res.json()["amount"] == 25.0


def test_an_enrollment_cannot_be_born_in_a_terminal_state(client, world):
    admin = auth(client, "admin@test.com")
    res = client.post(
        "/enrollments",
        headers=admin,
        json={
            "student_id": world["outsider"].id,
            "course_id": world["course_b"].id,
            "status": "certified",
        },
    )
    assert res.status_code == 400, res.text
