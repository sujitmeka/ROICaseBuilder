"""FastAPI application for CPROI — REST endpoints and SSE streaming."""

from __future__ import annotations

import logging
import os
from typing import Optional
from uuid import uuid4

from fastapi import BackgroundTasks, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from supabase import create_client

from backend.orchestrator.agent import CPROIOrchestrator
from backend.streaming import StreamManager
from backend.streaming.events import PipelineEventType, SSEEvent

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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

# Supabase client
_supabase_url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
_supabase_key = os.environ.get("SUPABASE_KEY") or os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
sb = create_client(_supabase_url, _supabase_key) if _supabase_url and _supabase_key else None


class CreateCaseRequest(BaseModel):
    company_name: str
    industry: str
    service_type: str
    case_id: Optional[str] = None  # Accept case_id from frontend (already in Supabase)


class CreateCaseResponse(BaseModel):
    case_id: str
    status: str


async def _update_case_in_supabase(case_id: str, updates: dict) -> None:
    """Update a case in Supabase if client is available."""
    if sb is None:
        return
    try:
        sb.table("cases").update(updates).eq("id", case_id).execute()
    except Exception as e:
        logger.warning(f"Failed to update case {case_id} in Supabase: {e}")


async def run_pipeline(case_id: str, company_name: str, industry: str, service_type: str):
    """Background task: run the agentic ROI pipeline and emit SSE events."""
    orchestrator = CPROIOrchestrator(stream_manager=stream_manager)
    try:
        result = await orchestrator.run(
            company_name=company_name,
            industry=industry,
            service_type=service_type,
            case_id=case_id,
        )

        # Save results to Supabase
        await _update_case_in_supabase(case_id, {
            "status": "completed",
            "result": result.get("scenarios") if isinstance(result, dict) else result,
            "narrative": result.get("narrative", "") if isinstance(result, dict) else "",
        })

    except Exception as e:
        logger.exception(f"Pipeline failed for case {case_id}")

        await _update_case_in_supabase(case_id, {
            "status": "error",
            "error": str(e),
        })

        await stream_manager.emit(case_id, SSEEvent(
            event_type=PipelineEventType.PIPELINE_ERROR,
            data={"case_id": case_id, "error": str(e)},
            sequence_id=999,
        ))


@app.post("/api/cases", response_model=CreateCaseResponse)
async def create_case(body: CreateCaseRequest, background_tasks: BackgroundTasks):
    """Start the pipeline for a case. Case may already exist in Supabase."""
    case_id = body.case_id or str(uuid4())

    # Start pipeline in background so the SSE stream can pick up events
    background_tasks.add_task(
        run_pipeline, case_id, body.company_name, body.industry, body.service_type
    )

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
    """Return case result from Supabase (polling fallback)."""
    if sb:
        try:
            res = sb.table("cases").select("*").eq("id", case_id).single().execute()
            return res.data
        except Exception:
            pass
    return {"error": "Case not found"}


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok"}
