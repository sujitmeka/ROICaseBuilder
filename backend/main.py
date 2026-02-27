"""FastAPI application for CPROI — REST endpoints and SSE streaming."""

from __future__ import annotations

from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend.streaming import StreamManager

app = FastAPI(title="CPROI API", version="0.1.0")

# CORS — allow Next.js dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Singleton stream manager
stream_manager = StreamManager()

# In-memory case store (replaced by DB later)
_cases: dict[str, dict] = {}


class CreateCaseRequest(BaseModel):
    company_name: str
    industry: str
    service_type: str


class CreateCaseResponse(BaseModel):
    case_id: str
    status: str


@app.post("/api/cases", response_model=CreateCaseResponse)
async def create_case(body: CreateCaseRequest):
    """Create a new ROI calculation case."""
    case_id = str(uuid4())
    _cases[case_id] = {
        "case_id": case_id,
        "status": "started",
        "company_name": body.company_name,
        "industry": body.industry,
        "service_type": body.service_type,
        "result": None,
    }
    return CreateCaseResponse(case_id=case_id, status="started")


@app.get("/api/cases/{case_id}/stream")
async def stream_case(case_id: str, request: Request):
    """SSE endpoint — streams pipeline progress events."""
    last_event_id: int | None = None
    raw = request.headers.get("Last-Event-ID") or request.headers.get("last-event-id")
    if raw is not None:
        try:
            last_event_id = int(raw)
        except ValueError:
            pass

    generator = stream_manager.event_generator(case_id, last_event_id=last_event_id)
    return StreamingResponse(generator, media_type="text/event-stream")


@app.get("/api/cases/{case_id}")
async def get_case(case_id: str):
    """Return case result (polling fallback)."""
    case = _cases.get(case_id)
    if case is None:
        return {"error": "Case not found"}
    return case


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok"}
