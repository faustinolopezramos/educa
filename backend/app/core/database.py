from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import settings

# NullPool para Supabase PgBouncer (transaction mode)
# prepare_threshold=0 evita prepared statements que rompen con pooler
engine = create_engine(
    settings.database_url,
    poolclass=NullPool,
    connect_args={
        "prepare_threshold": 0,
        "sslmode": "require"
    }
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
