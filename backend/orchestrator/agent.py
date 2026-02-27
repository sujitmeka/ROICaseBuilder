"""CPROIOrchestrator — main orchestration class.

Direct orchestration for now. The Claude Agents SDK query() integration
will be wired in later when full narrative generation is available.
"""

from __future__ import annotations

import logging
from typing import Optional
from uuid import uuid4

from backend.engine.calculator import CalculationEngine
from backend.engine.result import CalculationResult
from backend.methodology.loader import get_default_methodology
from backend.orchestrator.data_orchestrator import DataOrchestrator
from backend.streaming.events import PipelineEventType, SSEEvent
from backend.streaming.manager import StreamManager

logger = logging.getLogger(__name__)


class CPROIOrchestrator:
    """Top-level orchestrator that coordinates the full ROI pipeline.

    Calls providers and engine directly. The agent SDK query() integration
    will be added later — the async interface is kept clean for swapping.
    """

    def __init__(self, stream_manager: Optional[StreamManager] = None) -> None:
        self._stream_manager = stream_manager
        self._engine = CalculationEngine()
        self._seq = 0

    async def run(
        self,
        company_name: str,
        industry: str,
        service_type: str,
        case_id: Optional[str] = None,
    ) -> CalculationResult:
        """Run the full ROI calculation pipeline.

        Args:
            company_name: Target company name.
            industry: Industry vertical.
            service_type: Methodology service type.
            case_id: Optional case ID for SSE event routing.

        Returns:
            CalculationResult with scenario-based ROI projections.
        """
        if case_id is None:
            case_id = str(uuid4())

        # 1. Pipeline started
        await self._emit(case_id, PipelineEventType.PIPELINE_STARTED, {
            "company_name": company_name,
            "industry": industry,
            "service_type": service_type,
        })

        # 2. Load methodology config
        methodology = get_default_methodology()
        logger.info(
            f"Loaded methodology '{methodology.id}' v{methodology.version} "
            f"with {len(methodology.enabled_kpis())} enabled KPIs"
        )

        # 3. Gather company data via DataOrchestrator
        await self._emit(case_id, PipelineEventType.DATA_FETCH_STARTED, {
            "company_name": company_name,
        })

        data_orchestrator = DataOrchestrator()
        company_data, conflicts = await data_orchestrator.gather(company_name, industry)

        await self._emit(case_id, PipelineEventType.DATA_FETCH_COMPLETED, {
            "fields_populated": len(company_data.available_fields()),
            "completeness": company_data.completeness_score(),
            "conflicts": len(conflicts),
        })

        # 4. Run calculation
        await self._emit(case_id, PipelineEventType.CALCULATION_STARTED, {
            "methodology_id": methodology.id,
        })

        result = self._engine.calculate(company_data, methodology)

        # 5. Emit calculation completed
        await self._emit(case_id, PipelineEventType.CALCULATION_COMPLETED, {
            "data_completeness": result.data_completeness,
            "missing_inputs": result.missing_inputs,
            "scenarios_computed": len(result.scenarios),
        })

        return result

    async def _emit(
        self,
        case_id: str,
        event_type: PipelineEventType,
        data: dict,
    ) -> None:
        """Emit an SSE event if a stream manager is available."""
        if self._stream_manager is None:
            return
        self._seq += 1
        event = SSEEvent(
            event_type=event_type,
            data=data,
            sequence_id=self._seq,
        )
        await self._stream_manager.emit(case_id, event)
