"""FastAPI application for CPROI — REST endpoints and SSE streaming."""

from __future__ import annotations

import asyncio
import logging
from uuid import uuid4

from fastapi import BackgroundTasks, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

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

# In-memory case store (replaced by DB later)
_cases: dict[str, dict] = {}


class CreateCaseRequest(BaseModel):
    company_name: str
    industry: str
    service_type: str


class CreateCaseResponse(BaseModel):
    case_id: str
    status: str


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
        _cases[case_id]["status"] = "completed"
        _cases[case_id]["result"] = result

        # Pipeline completed event is emitted by the orchestrator itself
    except Exception as e:
        logger.exception(f"Pipeline failed for case {case_id}")
        _cases[case_id]["status"] = "error"
        _cases[case_id]["error"] = str(e)

        await stream_manager.emit(case_id, SSEEvent(
            event_type=PipelineEventType.PIPELINE_ERROR,
            data={"case_id": case_id, "error": str(e)},
            sequence_id=999,
        ))


@app.post("/api/cases", response_model=CreateCaseResponse)
async def create_case(body: CreateCaseRequest, background_tasks: BackgroundTasks):
    """Create a new ROI calculation case and start the pipeline."""
    case_id = str(uuid4())
    _cases[case_id] = {
        "case_id": case_id,
        "status": "started",
        "company_name": body.company_name,
        "industry": body.industry,
        "service_type": body.service_type,
        "result": None,
    }

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
    """Return case result (polling fallback)."""
    case = _cases.get(case_id)
    if case is None:
        return {"error": "Case not found"}
    return case


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok"}
