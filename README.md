# MyBurrow

MyBurrow is a peer-to-peer borrowing platform for listing, reserving, and reviewing items. It has a FastAPI backend, a Vite/React frontend, PostgreSQL persistence, JWT authentication, Google OAuth support, Supabase-backed image storage, chat, reservations, saved listings, activity tracking, and review flows.

## Tech Stack

- Backend: FastAPI, SQLAlchemy async, PostgreSQL, Pydantic
- Frontend: React, Vite, React Router, Axios
- Storage: Supabase Storage for uploaded listing/profile images
- Auth: Email/password JWT auth with optional Google OAuth
- Deployment: Render for the API, Vercel for the frontend

## Repository Structure

```text
.
├── backend/              # FastAPI app, routers, models, schemas, services
├── frontend/             # Vite React app
├── requirements.txt      # Python dependencies
├── render.yaml           # Render API deployment config
├── package.json          # Root frontend-adjacent dependencies
└── README.md
```

## Prerequisites

- Python 3.12+
- Node.js 20+
- PostgreSQL database
- Supabase project, if using image uploads
- Google OAuth credentials, if using Google login

## Environment Variables

Create `backend/.env` for local backend development:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE
SECRET_KEY=replace-me
ALGORITHM=HS256

# Optional, required for Google login
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:8000/api/auth/google/callback
FRONTEND_URL=http://localhost:5173

# Optional, required for image upload endpoints
SUPABASE_URL=
SUPABASE_SERVICE_KEY=

# Optional AI features
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini

# Optional comma-separated CORS origins
ALLOWED_ORIGINS=http://localhost:5173
```

Create `frontend/.env` if the API is not running on the default `http://localhost:8000`:

```env
VITE_API_URL=http://localhost:8000
```

## Local Development

Install backend dependencies:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Run the backend:

```bash
uvicorn backend.main:app --reload
```

The API starts at `http://localhost:8000`. Database tables are created on startup from the SQLAlchemy models.

Install frontend dependencies:

```bash
cd frontend
npm install
```

Run the frontend:

```bash
npm run dev
```

The web app starts at `http://localhost:5173`.

## Useful Commands

```bash
# Frontend development server
cd frontend && npm run dev

# Build frontend assets
cd frontend && npm run build

# Lint frontend code
cd frontend && npm run lint

# Run backend API locally
uvicorn backend.main:app --reload
```

## Core Features

- User registration, login, profile editing, and Google OAuth login
- Item listings with categories, locations, status, due dates, and images
- Listing search/browse, detail pages, saved listings, and owner management
- Reservation lifecycle for borrowing and returning items
- Real-time chat rooms tied to listings and reservations
- Reviews for users and listed items
- Activity page for tracking borrowing and lending history
- Calendar integration hooks for reservation events
- Optional AI/MCP context endpoints

## Deployment

The backend is configured for Render in `render.yaml`:

```bash
uvicorn backend.main:app --host 0.0.0.0 --port $PORT
```

The frontend is configured for Vercel with SPA rewrites in `frontend/vercel.json`.

For production, set the backend environment variables in Render and set `VITE_API_URL` in Vercel to the deployed API URL.

## Notes

- `DATABASE_URL` is required before the backend can start.
- The backend accepts both `postgres://` and `postgresql://` URLs and converts them to SQLAlchemy's async PostgreSQL driver format.
- Supabase credentials are only required for endpoints that upload files.
- The default CORS origins include local Vite and the deployed MyBurrow frontend.
