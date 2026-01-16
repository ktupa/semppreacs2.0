# app/database/connection.py
# Configuração de conexão com banco de dados

import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool
from typing import Generator

# Suporte para SQLite (dev) ou PostgreSQL (prod)
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "sqlite:///./data/semppre_acs.db"
)

# Configuração do engine
if DATABASE_URL.startswith("sqlite"):
    # SQLite precisa de configuração especial para threads
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        echo=False  # True para debug SQL
    )
else:
    # PostgreSQL ou outros
    engine = create_engine(
        DATABASE_URL,
        pool_size=10,
        max_overflow=20,
        pool_pre_ping=True,
        echo=False
    )

# Session factory
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)


def get_db() -> Generator[Session, None, None]:
    """
    Dependency para injetar sessão do banco nas rotas FastAPI.
    Uso:
        @router.get("/items")
        def get_items(db: Session = Depends(get_db)):
            ...
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """
    Inicializa o banco de dados criando todas as tabelas.
    Chamado na inicialização da aplicação.
    """
    from .models import Base
    
    # Criar diretório data se não existir (para SQLite)
    if DATABASE_URL.startswith("sqlite"):
        import pathlib
        db_path = DATABASE_URL.replace("sqlite:///", "")
        pathlib.Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    
    Base.metadata.create_all(bind=engine)
    print(f"✅ Database initialized: {DATABASE_URL}")
