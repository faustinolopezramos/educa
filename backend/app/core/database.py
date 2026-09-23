from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings

# `prepare_threshold=None` desactiva por completo las sentencias preparadas de
# psycopg. Es obligatorio detrás del pooler de Supabase en modo transacción: cada
# consulta puede caer en una conexión de servidor distinta, y una sentencia
# preparada en otra conexión no existe allí. (Con `0` se preparaba *todo* desde
# la primera ejecución, que es justo lo que rompe con PgBouncer.)
#
# El SSL NO se fija aquí. Va en la DATABASE_URL, que es lo que distingue un
# entorno de otro: `app.core.config` le añade `sslmode=require` en producción, y
# el Postgres local —que no habla SSL— sigue funcionando sin él. Cuando estaba
# escrito en el código, ni las pruebas ni las migraciones ni el CI podían
# conectarse.
_connect_args = {"prepare_threshold": None}

if settings.is_production:
    # Un pool pequeño del lado de la aplicación evita abrir una conexión TLS
    # nueva en cada petición contra el pooler. `pool_pre_ping` descarta las
    # conexiones que el pooler ya cerró por su cuenta.
    engine = create_engine(
        settings.database_url,
        pool_size=5,
        max_overflow=5,
        pool_pre_ping=True,
        pool_recycle=300,
        connect_args=_connect_args,
    )
else:
    from sqlalchemy.pool import NullPool

    engine = create_engine(
        settings.database_url,
        poolclass=NullPool,
        connect_args=_connect_args,
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
