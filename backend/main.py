import os

from dotenv import load_dotenv
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from fastapi.responses import JSONResponse
from sqlalchemy import text
from slowapi import _rate_limit_exceeded_handler

from database import engine
from limiter import limiter
from models import Base
from routers import auth, conversation, messages, users, websocket, uploads, ai
from starlette.middleware.base import BaseHTTPMiddleware
# Load environment variables
load_dotenv()

# Security Middleware

class SecurityHeaderMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Content-Security-Policy"] = "default-src 'self'"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
        response.headers["X-DNS-Prefetch-Control"] = "off"
        response.headers["X-Download-Options"] = "noopen"
        response.headers["X-Permitted-Cross-Domain-Policies"] = "none"
        response.headers["X-RateLimit-Limit"] = "100"
        response.headers["X-RateLimit-Remaining"] = "99"
        response.headers["X-RateLimit-Reset"] = "1234567890"
        return response




# App
app = FastAPI(
    title="TalkFlow API",
    description="API for TalkFlow",
    version="1.0.0",
    openapi_url="/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc"
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SecurityHeaderMiddleware)


# CORS

def build_allowed_origins() -> list[str]:
    configured = (os.getenv("FRONTEND_URL") or "").strip()
    defaults = [
        "http://localhost:3001",
        "http://localhost:5173",
        "http://localhost:3000",
        "http://localhost:8000",
        "http://127.0.0.1:3000",
        "https://98-83-41-208.sslip.io",
        "https://www.talkflow.digital",
        "https://talkflow.digital",
        "https://dev-chat-asi7dqasn-sugi004s-projects.vercel.app",
    ]
    if configured:
        defaults.append(configured.rstrip("/"))
    return list(dict.fromkeys(defaults))

app.add_middleware(
    CORSMiddleware,
    allow_origins=build_allowed_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "Origin"],
)

# Include Routers

app.include_router(auth.router)
app.include_router(conversation.router)
app.include_router(messages.router)
app.include_router(users.router)
app.include_router(websocket.router)
app.include_router(uploads.router)
app.include_router(ai.router)


# Exception Handler
@app.exception_handler(Exception)
async def global_exception_handler(request, exc: Exception):
    print(f"UNHANDLED ERROR on {request.method} {request.url.path}: {exc}")
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "An unexpected error occured"},
    )

#  Create Tables on Startup

@app.on_event("startup")
async def create_tables():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        if engine.dialect.name == "postgresql":
            await conn.execute(
                text(
                    """
                    ALTER TABLE users
                    ADD COLUMN IF NOT EXISTS is_email_verified BOOLEAN
                    """
                )
            )
            await conn.execute(
                text(
                    """
                    ALTER TABLE users
                    ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ NULL
                    """
                )
            )
            await conn.execute(
                text(
                    """
                    UPDATE users
                    SET is_email_verified = TRUE,
                        email_verified_at = COALESCE(email_verified_at, created_at)
                    WHERE is_email_verified IS NULL
                    """
                )
            )
            await conn.execute(
                text(
                    """
                    ALTER TABLE users
                    ALTER COLUMN is_email_verified SET DEFAULT FALSE
                    """
                )
            )
            await conn.execute(
                text(
                    """
                    ALTER TABLE users
                    ALTER COLUMN is_email_verified SET NOT NULL
                    """
                )
            )


#  Health Check

@app.get("/")
async def root():
    return {"message": "TalkFlow API is running"}


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}
