# UX Overhaul: json-render + Structured Results UI

## Problem
The AI output renders as one giant unformatted text block. No markdown, no structured cards, no charts. The PipelineTimeline component exists but is dead code. Rich calculation data (KPI breakdowns, year projections, impact by category) exists in the store but is never rendered.

## Solution
Use Vercel Labs `json-render` to let the AI generate structured JSONL that maps to our React components. Define a tight catalog of 6 component types so the AI can only produce what we allow.

## Component Catalog

| Component | Purpose | Key Props |
|-----------|---------|-----------|
| `ROIStatement` | Hero one-liner ("By investing $X...yield $Y") | investment, annualImpact, roiMultiple, companyName, serviceType |
| `MetricCard` | Per-KPI impact card | label, value, currentValue, targetValue, source, sourceUrl, confidence, weight, dataClass |
| `NarrativeBlock` | Short prose section | heading, body |
| `ProjectionRow` | Year projection entry | year, impact, cumulative, realizationPercent |
| `ConfidenceNote` | Data quality caveat | message, severity |
| `SkippedKPI` | KPI that couldn't be calculated | label, reason |

## Custom Rules for LLM
- Always start with exactly one ROIStatement
- Follow with MetricCards ordered by impact (highest first)
- Then ProjectionRows for Y1/Y2/Y3
- Then ConfidenceNotes for any medium/low confidence data
- SkippedKPIs at the end
- Keep all text concise and copy-pasteable
- NarrativeBlock bodies should be 2-3 sentences max

## Architecture Changes

### Orchestrator (`orchestrator.ts`)
- Import catalog, add `catalog.prompt({ customRules })` to system prompt
- LLM generates JSONL patches as its final output (after tool calls complete)

### Stream Route (`stream/route.ts`)
- Wrap `result.toUIMessageStream()` with `pipeJsonRender()` from `@json-render/core`
- Custom data parts (data-activity, data-pipeline, data-caseinfo) pass through unchanged

### Frontend Hook (`use-event-stream.ts`)
- Use `useJsonRenderMessage()` from `@json-render/react` to extract specs from message parts
- Expose `spec` and `hasSpec` to the results page

### Results Page (`page.tsx`)
- When `hasSpec` is true, render `<Renderer spec={spec} registry={registry} />`
- Keep ScenarioToggle (now controls which scenario data the AI generates for)
- Remove old NarrativePanel raw text rendering

### Streaming View
- Wire up PipelineTimeline (already built, just not mounted)
- Surface key milestones in ActivityFeed

## Dependencies
- `@json-render/core` — catalog, pipeJsonRender
- `@json-render/react` — registry, Renderer, useJsonRenderMessage
- `react-markdown` + `remark-gfm` — for NarrativeBlock body rendering
