import pytest

from app.models.enums import UserRole
from app.schemas.user import UserCreate, normalize_cui_passport


def test_user_create_cui_passport():
    user = UserCreate(
        email="testcui@educa.com",
        full_name="Usuario Prueba CUI",
        cui_passport="2450 12345 0101",
        password="Password123!",
        role=UserRole.student,
    )
    # El esquema guarda la forma canónica, no la que se tecleó. Esta prueba
    # afirmaba lo contrario (`== "2450 12345 0101"`), y esa era exactamente la
    # causa del duplicado: el formulario mandaba el valor ya maquetado y la
    # comprobación de unicidad comparaba cadenas crudas, así que el mismo DPI
    # escrito con guiones, con espacios o seguido entraba tres veces.
    assert user.cui_passport == "2450123450101"
    assert user.full_name == "Usuario Prueba CUI"


@pytest.mark.parametrize(
    "written, canonical",
    [
        ("2450 12345 0101", "2450123450101"),
        ("2450-12345-0101", "2450123450101"),
        ("  2450123450101 ", "2450123450101"),
        ("ab123456", "AB123456"),
        ("AB-123456", "AB123456"),
    ],
)
def test_the_same_document_always_reduces_to_the_same_string(written, canonical):
    assert normalize_cui_passport(written) == canonical


@pytest.mark.parametrize(
    "bad",
    [
        "123",  # por debajo del mínimo
        "A" * 26,  # por encima del máximo
        "   ",  # en blanco
        "----",  # sin nada alfanumérico que guardar
    ],
)
def test_a_document_that_is_not_one_is_refused(bad):
    """La regla existía sólo en el navegador; ahora también aquí.

    Es deliberadamente amplia (4–25 alfanuméricos) porque el documento puede ser
    un DPI/CUI, un pasaporte, un DNI o uno extranjero: lo que se valida es que
    haya un identificador plausible, no un formato de un solo país.
    """
    with pytest.raises(ValueError):
        UserCreate(
            email="malo@educa.com",
            full_name="Usuario Inválido",
            cui_passport=bad,
            password="Password123!",
            role=UserRole.student,
        )
