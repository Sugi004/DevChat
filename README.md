# TalkFlow

TalkFlow is a full-stack real-time chat application built as a portfolio-ready project with direct messaging, group conversations, AI-assisted chat tools, profile management, media/file sharing, and a responsive chat experience across desktop and mobile.

![TalkFlow chat screenshot](docs/images/chat-flow.png)

## What The Project Does

- Authenticates users with email/password and JWT bearer tokens
- Requires email verification before password login is allowed
- Supports direct conversations and admin-aware group conversations
- Delivers live messages, typing indicators, presence events, and read receipts over WebSockets
- Stores message bodies encrypted at rest on the backend
- Supports presigned S3 uploads for images, videos, files, and source-code attachments
- Provides AI-powered conversation summaries, smart replies, and translation
- Includes a responsive Next.js frontend for login, chat, registration, and profile management
- Lets users permanently delete their own account and associated messages from the profile page after an explicit warning

## Repository Layout

```text
talkflow/
├── backend/
│   ├── backend_auth.py
│   ├── database.py
│   ├── limiter.py
│   ├── main.py
│   ├── message_crypto.py
│   ├── models.py
│   ├── redis_client.py
│   ├── routers/
│   ├── schemas.py
│   └── upload_rules.py
├── docs/
│   └── images/
├── frontend/
│   ├── app/
│   │   ├── chat/
│   │   ├── login/
│   │   ├── profile/
│   │   ├── register/
│   │   ├── favicon.ico
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── chat/
│   │   │   ├── Chatlist.tsx
│   │   │   ├── Chatwindow.tsx
│   │   │   ├── Codeblock.tsx
│   │   │   ├── GroupInfoModal.tsx
│   │   │   └── Messagebubble.tsx
│   ├── context/
│   ├── hooks/
│   ├── lib/
│   └── types/
└── README.md
```

## Stack

### Frontend

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS 4
- Axios
- Shiki and `highlight.js` for code rendering
- React Hot Toast
- Framer Motion

### Backend

- FastAPI
- SQLAlchemy async
- PostgreSQL via `asyncpg`
- Redis for presence, unread counts, typing, and realtime coordination
- AWS S3 presigned uploads via `boto3`
- Google Gemini (`gemini-2.5-flash`) for AI endpoints
- `cryptography` AES-GCM helpers for message encryption at rest

## Architecture

### Request/response flow

1. The frontend authenticates the user and stores the JWT in `sessionStorage`.
2. Axios attaches the bearer token to REST calls automatically.
3. FastAPI routers handle auth, conversations, messages, uploads, users, and AI features.
4. SQLAlchemy persists users, conversations, participants, and messages.
5. Redis tracks online state, read status, unread counts, and WebSocket coordination.
6. WebSocket connections keep the chat UI in sync with typing, presence, read receipts, and live messages.

### Security model

- Passwords are hashed with `bcrypt`
- Newly registered accounts remain unverified until the email verification link is used
- JWT access tokens authenticate REST and WebSocket flows
- Message bodies are encrypted at rest before persistence
- Uploads are filtered through extension and MIME allowlists
- Auth routes are rate-limited with `slowapi`
- Security headers are applied by backend middleware

### Important tradeoff

This project is not end-to-end encrypted today. The backend decrypts message content for REST responses and AI helpers, which keeps the product simpler to demo but means the server can access plaintext. The existing code and documentation treat true E2EE as a future roadmap item.

## Backend API Summary

### Auth

- `POST /auth/register`
- `POST /auth/resend-verification`
- `GET /auth/verify-email?token=...`
- `POST /auth/login`
- `POST /auth/token`

### Users

- `GET /users/me`
- `PUT /users/me`
- `DELETE /users/me`
- `DELETE /users/me/avatar`
- `GET /users/search?q=...`

### Conversations

- `GET /conversations`
- `POST /conversations/direct`
- `POST /conversations/group`
- `GET /conversations/{conversation_id}`
- `PUT /conversations/{conversation_id}`
- `POST /conversations/{conversation_id}/participants`
- `DELETE /conversations/{conversation_id}/participants/{user_id}`
- `DELETE /conversations/{conversation_id}/leave`

### Messages

- `GET /messages/{conversation_id}`
- `POST /messages/{conversation_id}`
- `DELETE /messages/{message_id}`
- `GET /messages/{conversation_id}/unread`
- `POST /messages/{conversation_id}/read`

### Uploads

- `POST /uploads/presigned-url`

### AI

- `POST /ai/summarize`
- `POST /ai/smart-reply`
- `POST /ai/translate`

![TalkFlow ai chat overview](docs/images/ai-chat-overview.png)

![TalkFlow ai chat suggest panel](docs/images/ai-suggest-panel.png)

![TalkFlow mobile](docs/images/ai-summary-panel.png)

### WebSockets

- `WS /ws/{conversation_id}?token=...`
- `WS /ws/user/{user_id}?token=...`

## Data Model

### User

- Account identity, password hash, verification state, username/display name, avatar URL, online metadata, timestamps

### Conversation

- Direct or group chat container with optional group name/avatar and creator reference

### Participants

- Join table linking users to conversations
- Stores admin status, join timestamp, and hidden state for direct conversation leave behavior

### Message

- Message content, sender, conversation, message type, attachment URL, status, language, deletion flag, timestamps

## Code Organization

### Backend responsibilities

- `backend/main.py` wires the FastAPI app, middleware, routers, startup table creation, and health route
- `backend/backend_auth.py` handles password hashing, JWT creation, auth payload decryption, and current-user lookup
- `backend/models.py` defines users, conversations, participants, and messages
- `backend/schemas.py` defines API request/response contracts
- `backend/message_crypto.py` encrypts and decrypts stored message bodies
- `backend/upload_rules.py` enforces safe upload names and content types
- `backend/routers/` contains feature routes for auth, users, conversations, messages, uploads, AI, and WebSockets
- `backend/tests/` contains backend unit tests for route logic and helpers

### Frontend responsibilities

- `frontend/app/` contains route-level pages and layout files
- `frontend/app/verify-email` and `frontend/app/email-verified` cover the verification flow after registration and after the email link is opened
- `frontend/app/profile` handles username editing, avatar management, and self-service account deletion with an irreversible warning modal
- `frontend/components/chat/` contains the main chat presentation components
- `frontend/context/AuthContext.tsx` manages client auth state
- `frontend/hooks/useWebSocket.ts` manages per-conversation realtime sockets
- `frontend/hooks/useGlobalSocket.ts` manages the user-level socket for global events
- `frontend/lib/` wraps API calls for auth, conversations, messages, uploads, users, and AI
- `frontend/types/` stores shared client-side TypeScript contracts

## WebSocket Event Model

### Conversation socket events

- `welcome`
- `message`
- `typing`
- `read`
- `presence`
- `membership`
- `pong`
- `error`

### Outgoing client frames

- `{"type":"message", ...}`
- `{"type":"typing", "is_typing": true|false}`
- `{"type":"read"}`
- `{"type":"ping"}`

### Global user socket purpose

The user-level WebSocket lets the frontend keep unread indicators, membership updates, read receipts, and presence changes in sync even when the user is not currently focused on a given conversation.

## Local Development

### Backend setup

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

### Frontend setup

```bash
cd frontend
npm install
npm run dev
```

### Suggested local URLs

- Frontend: `http://localhost:3000`
- Backend docs: `http://localhost:8000/docs`
- Backend OpenAPI: `http://localhost:8000/openapi.json`

## Deployment

TalkFlow is set up best as a split deployment:

- Frontend: Vercel
- Backend: Render
- Database: Supabase Postgres
- Redis: Upstash Redis
- File storage: Supabase Storage using its S3-compatible endpoint

### Production notes

- Render should provide the backend runtime and `PORT`.
- Supabase Postgres should provide `DATABASE_URL`.
- Upstash should provide `REDIS_URL`.
- Supabase Storage can keep the current pre-signed upload flow by exposing S3 credentials, region, endpoint, and a public bucket URL.

## Collaboration Setup

If multiple people are contributing to TalkFlow:

1. Copy the env templates instead of sharing live config:
   - `cp backend/.env.example backend/.env`
   - `cp frontend/.env.example frontend/.env.local`
2. Keep all real secrets local or in deployment secret managers.
3. Run backend tests plus frontend lint/build before opening a pull request.
4. Read [collaborate.md](./collaborate.md) for the full branch, review, and secret-handling workflow.

## Authentication And Email Verification Flow

1. The frontend fetches `GET /auth/public-key` and encrypts the password before sending register or login requests.
2. `POST /auth/register` creates the account in an unverified state and triggers a verification email.
3. The frontend then routes the user to `/verify-email?email=...`, where they can wait for the message or request another one.
4. The email link hits `GET /auth/verify-email?token=...`, which marks the account verified and redirects the user to `/email-verified`.
5. Only after verification can the user successfully sign in with `POST /auth/login` or `POST /auth/token`.

For local development, the backend can be configured to log the verification link instead of sending a real email.

## Environment Variables

### Backend

| Variable                      | Required    | Purpose                                                    |
| ----------------------------- | ----------- | ---------------------------------------------------------- |
| `DATABASE_URL`                | Yes         | SQLAlchemy async database connection string. Use the Supabase Postgres connection string. |
| `DATABASE_SSL`                | No          | DB SSL mode: `auto`, `true`, `false`, or `require`        |
| `IS_PRODUCTION`               | No          | Enables production-oriented DB SSL handling                |
| `SECRET_KEY`                  | Yes         | JWT signing secret and fallback encryption seed            |
| `ALGORITHM`                   | Yes         | JWT signing algorithm, typically `HS256`                   |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No          | JWT expiration window                                      |
| `MESSAGE_ENCRYPTION_KEY`      | Recommended | Dedicated key for message encryption at rest               |
| `FRONTEND_URL`                | Recommended | Frontend origin used for CORS and verification redirects   |
| `BACKEND_PUBLIC_URL`          | Recommended | Public backend base URL used in verification email links   |
| `EMAIL_DELIVERY_MODE`         | No          | Email transport mode: `resend`, `smtp`, `auto`, or `local` |
| `RESEND_API_KEY`              | Recommended | Resend API key for verification email delivery             |
| `EMAIL_FROM`                  | Recommended | Verified sender address used for verification emails       |
| `SMTP_HOST`                   | No          | SMTP host when using SMTP mode or fallback                 |
| `SMTP_PORT`                   | No          | SMTP port when using SMTP mode or fallback                 |
| `SMTP_USER`                   | No          | SMTP username                                              |
| `SMTP_PASSWORD`               | No          | SMTP password                                              |
| `SMTP_USE_SSL`                | No          | Enables implicit SSL SMTP connections                      |
| `SMTP_USE_STARTTLS`           | No          | Enables STARTTLS SMTP upgrade                              |
| `REDIS_URL`                   | Recommended | Managed Redis connection URL. Use the Upstash Redis URL.   |
| `REDIS_HOST`                  | No          | Redis host                                                 |
| `REDIS_PORT`                  | No          | Redis port                                                 |
| `REDIS_PASSWORD`              | No          | Redis password                                             |
| `S3_ACCESS_KEY_ID`            | For uploads | S3-compatible access key. Use the Supabase Storage S3 access key. |
| `S3_SECRET_ACCESS_KEY`        | For uploads | S3-compatible secret key. Use the Supabase Storage S3 secret key. |
| `AWS_ACCESS_KEY_ID`           | Optional    | Backward-compatible alias for `S3_ACCESS_KEY_ID`           |
| `AWS_SECRET_ACCESS_KEY`       | Optional    | Backward-compatible alias for `S3_SECRET_ACCESS_KEY`       |
| `AWS_REGION`                  | For uploads | Storage region used by the S3 client                       |
| `S3_BUCKET`                   | For uploads | Upload bucket name                                         |
| `S3_ENDPOINT_URL`             | Recommended | Supabase Storage S3 endpoint                               |
| `S3_PUBLIC_BASE_URL`          | Recommended | Public file base URL for the configured bucket             |
| `GEMINI_API_KEY`              | For AI      | Gemini API access                                          |

### Frontend

| Variable              | Required | Purpose                     |
| --------------------- | -------- | --------------------------- |
| `NEXT_PUBLIC_API_URL` | No       | REST API base URL override  |
| `NEXT_PUBLIC_WS_URL`  | No       | WebSocket base URL override. If omitted, it is derived from `NEXT_PUBLIC_API_URL`. |

### Email verification notes

- If you use Resend, `EMAIL_FROM` must belong to a verified sender on your configured domain.
- If `FRONTEND_URL` is missing or stale, verification redirects can point to the wrong host.
- In `local` delivery mode, the backend logs the verification link instead of sending an email.
- The frontend must ship `/login`, `/verify-email`, and `/email-verified` for the verification flow to work in production.

## Testing

The backend test suite is written with `unittest` and focuses on route-level behavior plus helper modules.

```bash
cd backend
python3 -m unittest discover -s tests -v
```

Coverage areas currently include:

- auth route behavior
- message route behavior
- upload allowlist logic
- message encryption helpers
- group membership/profile flows
- user search and update behavior

## Known Limitations

- No refresh-token flow yet
- No end-to-end encryption yet
- AI endpoints depend on backend plaintext access
- Upload handling is presigned-only and assumes S3-compatible storage
- The current environment still needs project dependencies installed before tests can run locally

## Suggested Next Improvements

1. Add CI for backend tests and frontend lint/build
2. Move AI prompt building and provider integration behind a dedicated service layer
3. Add more API tests around uploads, AI failures, and unread count edge cases
4. Add migration tooling instead of relying on `create_all` at startup
5. Add branch protection and automated preview deployments for safer collaboration
