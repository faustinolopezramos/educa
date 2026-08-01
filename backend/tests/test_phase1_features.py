from datetime import datetime, timezone
import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.models import Tenant, User, Enrollment, EnrollmentStatus
from app.schemas.tenant import TenantCreate, TenantRead, TenantUpdate
from app.services.enrollments import check_tenant_student_quota
from app.routers.public import verify_certificate_public, PublicCertificateVerification


def test_tenant_schema_defaults_and_custom_fields():
    # Test TenantCreate with defaults
    t_create = TenantCreate(name="Academia Test", slug="academia-test")
    assert t_create.timezone == "America/Guatemala"
    assert t_create.currency == "USD"
    assert t_create.primary_color is None
    assert t_create.max_active_students == 100

    # Test TenantUpdate with branding and custom domain
    t_update = TenantUpdate(
        primary_color="#4F46E5",
        secondary_color="#06B6D4",
        custom_domain="portal.miacademia.com",
        currency="GTQ",
        timezone="America/Guatemala",
    )
    assert t_update.primary_color == "#4F46E5"
    assert t_update.custom_domain == "portal.miacademia.com"
    assert t_update.currency == "GTQ"


def test_tenant_model_columns():
    tenant = Tenant(
        name="Academia Guatemala",
        slug="academia-gt",
        max_active_students=50,
        timezone="America/Guatemala",
        currency="GTQ",
        primary_color="#10B981",
        secondary_color="#3B82F6",
        custom_domain="gt.educa.app",
        tax_id="1234567-8",
        phone="+502 5555-5555",
        address="Ciudad de Guatemala",
    )
    assert tenant.name == "Academia Guatemala"
    assert tenant.currency == "GTQ"
    assert tenant.primary_color == "#10B981"
    assert tenant.custom_domain == "gt.educa.app"
    assert tenant.tax_id == "1234567-8"


def test_public_certificate_verification_not_found_handling():
    # Calling public endpoint with non-existent code should raise 404
    class MockDb:
        def scalar(self, stmt):
            return None

    mock_db = MockDb()
    with pytest.raises(HTTPException) as exc_info:
        verify_certificate_public("INVALID-CODE-999", db=mock_db)
    assert exc_info.value.status_code == 404
