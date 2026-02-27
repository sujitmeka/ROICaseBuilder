"""Tests for FastAPI endpoints — create case, SSE stream, CORS, health."""

import threading
import time

import httpx
import pytest
import uvicorn
from httpx import ASGITransport, AsyncClient

from backend.main import app


class _TestServer:
    """Runs the FastAPI app on a real server in a background thread."""

    def __init__(self, host: str = "127.0.0.1", port: int = 9876):
        self.host = host
        self.port = port
        self.base_url = f"http://{host}:{port}"
        self._server = None

    def start(self):
        config = uvicorn.Config(app, host=self.host, port=self.port, log_level="error")
        self._server = uvicorn.Server(config)
        thread = threading.Thread(target=self._server.run, daemon=True)
        thread.start()
        # Wait for server to be ready
        for _ in range(50):
            try:
                httpx.get(f"{self.base_url}/health", timeout=0.5)
                return
            except httpx.ConnectError:
                time.sleep(0.1)

    def stop(self):
        if self._server:
            self._server.should_exit = True


@pytest.fixture(scope="module")
def server():
    srv = _TestServer()
    srv.start()
    yield srv
    srv.stop()


class TestAPI:
    @pytest.mark.asyncio
    async def test_create_case_returns_case_id(self):
        """POST /api/cases with valid body returns 200 with case_id."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/cases",
                json={
                    "company_name": "Acme Corp",
                    "industry": "retail",
                    "service_type": "experience-transformation-design",
                },
            )
        assert resp.status_code == 200
        body = resp.json()
        assert "case_id" in body
        assert body["status"] == "started"

    def test_stream_endpoint_returns_event_stream_content_type(self, server):
        """GET /api/cases/{id}/stream returns text/event-stream content type."""
        with httpx.stream("GET", f"{server.base_url}/api/cases/test-id/stream", timeout=5.0) as resp:
            assert resp.headers["content-type"] == "text/event-stream; charset=utf-8"

    @pytest.mark.asyncio
    async def test_cors_allows_localhost_3000(self):
        """OPTIONS request with Origin: http://localhost:3000 is allowed."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.options(
                "/api/cases",
                headers={
                    "Origin": "http://localhost:3000",
                    "Access-Control-Request-Method": "POST",
                },
            )
        assert resp.headers.get("access-control-allow-origin") == "http://localhost:3000"

    @pytest.mark.asyncio
    async def test_health_check_endpoint(self):
        """GET /health returns 200 with status ok."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/health")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}
