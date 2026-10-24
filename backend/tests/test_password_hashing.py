"""Hashing de contraseñas tras dejar passlib por bcrypt directo.

Las cuentas existentes tienen hashes hechos por passlib; si dejaran de validar,
nadie podría entrar después del despliegue.
"""

from app.core.security import hash_password, verify_password

# Generado con passlib 1.7.4 + bcrypt 4.0.1 para "secret123".
PASSLIB_HASH = "$2b$12$O7yY3PBWeAQf2wup3mTiEOfZcK0inE7b56ULkaMquKhXIMKVCks4S"


def test_a_hash_written_by_passlib_still_verifies():
    assert verify_password("secret123", PASSLIB_HASH)
    assert not verify_password("secret124", PASSLIB_HASH)


def test_passwords_past_72_bytes_are_truncated_as_passlib_did():
    # passlib recortaba en silencio; bcrypt 5 lanza ValueError si no se recorta.
    long = "x" * 100
    hashed = hash_password(long)
    assert verify_password(long, hashed)
    assert verify_password("x" * 72 + "distinto", hashed)


def test_a_malformed_hash_is_a_mismatch_not_a_crash():
    assert not verify_password("secret123", "no-es-un-hash")
