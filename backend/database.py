import os
import ssl
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import declarative_base, sessionmaker

load_dotenv()


def normalize_database_url(raw_url: str | None) -> str:
    if not raw_url:
        raise RuntimeError("DATABASE_URL is not configured.")

    normalized = raw_url.strip()
    if normalized.startswith("postgres://"):
        normalized = normalized.replace("postgres://", "postgresql+asyncpg://", 1)
    elif normalized.startswith("postgresql://"):
        normalized = normalized.replace("postgresql://", "postgresql+asyncpg://", 1)

    return normalized


def resolve_connect_args(database_url: str) -> dict:
    parsed = urlparse(database_url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    ssl_mode = os.getenv("DATABASE_SSL", query.get("sslmode", "auto")).lower()
    hostname = (parsed.hostname or "").lower()
    is_local_host = hostname in {"", "localhost", "127.0.0.1"}

    if ssl_mode in {"false", "0", "off", "disable"}:
        return {"ssl": False}

    if ssl_mode in {"true", "1", "on", "require"}:
        insecure_context = ssl.create_default_context()
        insecure_context.check_hostname = False
        insecure_context.verify_mode = ssl.CERT_NONE
        return {"ssl": insecure_context}

    if ssl_mode in {"verify-ca", "verify-full"}:
        return {"ssl": ssl.create_default_context()}

    if is_local_host:
        return {"ssl": False}

    # Default remote behavior matches common managed Postgres URLs that require
    # TLS but don't ship a chain trusted by the local CA bundle.
    insecure_context = ssl.create_default_context()
    insecure_context.check_hostname = False
    insecure_context.verify_mode = ssl.CERT_NONE
    return {"ssl": insecure_context}


def strip_sqlalchemy_unsafe_query_params(database_url: str) -> str:
    parsed = urlparse(database_url)
    if not parsed.query:
        return database_url

    query_pairs = [
        (key, value)
        for key, value in parse_qsl(parsed.query, keep_blank_values=True)
        if key.lower() != "sslmode"
    ]
    cleaned_query = urlencode(query_pairs)
    return urlunparse(parsed._replace(query=cleaned_query))


RAW_DATABASE_URL = normalize_database_url(os.getenv("DATABASE_URL"))
DATABASE_URL = strip_sqlalchemy_unsafe_query_params(RAW_DATABASE_URL)

engine = create_async_engine(
    DATABASE_URL,
    echo=os.getenv("SQLALCHEMY_ECHO", "false").lower() == "true",
    connect_args=resolve_connect_args(RAW_DATABASE_URL),
    pool_pre_ping=True,
)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

Base = declarative_base()


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
        
