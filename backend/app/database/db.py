from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings
from app.database.models import Base

_engine = None
SessionLocal = None


def configure(url: str | None = None):
    """(Re)create the engine. SQLite by default; set DATABASE_URL to a PostgreSQL/Supabase URL."""
    global _engine, SessionLocal
    url = url or get_settings().database_url
    kwargs = {"connect_args": {"check_same_thread": False}} if url.startswith("sqlite") else {}
    _engine = create_engine(url, **kwargs)
    SessionLocal = sessionmaker(bind=_engine, autoflush=False, expire_on_commit=False)
    return _engine


def get_engine():
    return _engine or configure()


def get_db():
    if SessionLocal is None:
        configure()
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def session():
    if SessionLocal is None:
        configure()
    return SessionLocal()


def reset_database(seed: bool = True):
    """Restore the synthetic dataset ATOMICALLY.

    Rows are deleted and re-seeded inside one transaction, so concurrent readers (the UIs poll constantly)
    see either the old data or the new data -- never missing tables or an empty database.
    """
    from app.database.seed import seed_demo_data
    engine = get_engine()
    Base.metadata.create_all(engine)  # no-op when tables exist (first run / fresh database)
    with session() as db:
        try:
            for table in reversed(Base.metadata.sorted_tables):
                db.execute(table.delete())
            if seed:
                seed_demo_data(db)  # commits once at the end
            else:
                db.commit()
        except Exception:
            db.rollback()
            raise
