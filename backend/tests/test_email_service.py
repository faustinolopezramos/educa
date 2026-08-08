from app.services.email import send_email


def test_send_email_fallback_mode():
    """Validates that send_email logs successfully without throwing errors when SMTP is unconfigured."""
    ok = send_email(
        to_email="alumno@educa.com",
        subject="Notificación de Prueba EDUCA",
        body_text="Hola, tu clase ha sido programada exitosamente.",
    )
    assert ok is True
