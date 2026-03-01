# Results UI: Surface Narrative + Remove Dead Code

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Surface the LLM's calculation narrative as streamed text alongside structured KPI cards, and remove all dead json-render / unused component code.

**Architecture:** The results page keeps its current structured data rendering (ResultsView with KPI cards, projections, confidence notes) and adds the LLM's narrative text below. The narrative is already captured in `useCaseStore.narrative` — we just need to render it. The orchestrator's system prompt is updated to tell the LLM to write a useful calculation explanation instead of ignoring its text output.

**Tech Stack:** React, Zustand, AI SDK 6, Tailwind CSS

---

### Task 1: Delete json-render packages and dead UI code

**Files:**
- Delete: `src/lib/ui/catalog.ts`
- Delete: `src/lib/ui/registry.tsx`
- Delete: `src/components/results/ResultsLayout.tsx`
- Delete: `src/components/results/NarrativePanel.tsx`
- Delete: `src/components/results/AuditSidebar.tsx`
- Delete: `src/components/results/AuditEntry.tsx`
- Delete: `src/components/results/DataBadge.tsx`
- Delete: `src/components/streaming/ActivityFeed.tsx`
- Delete: `src/components/streaming/NarrativeStream.tsx`
- Delete: `src/components/streaming/PipelineStep.tsx`
- Delete: `src/components/streaming/PipelineTimeline.tsx`

**Step 1: Uninstall json-render packages**

```bash
npm uninstall @json-render/core @json-render/react
```

**Step 2: Delete dead files**

```bash
rm src/lib/ui/catalog.ts src/lib/ui/registry.tsx
rm src/components/results/ResultsLayout.tsx src/components/results/NarrativePanel.tsx
rm src/components/results/AuditSidebar.tsx src/components/results/AuditEntry.tsx
rm src/components/results/DataBadge.tsx
rm src/components/streaming/ActivityFeed.tsx src/components/streaming/NarrativeStream.tsx
rm src/components/streaming/PipelineStep.tsx src/components/streaming/PipelineTimeline.tsx
rmdir src/lib/ui 2>/dev/null || true
```

**Step 3: Type-check to confirm no broken imports**

```bash
npx tsc --noEmit
```

Expected: clean compile (none of these files are imported by active code)

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove dead json-render code and unused components"
```

---

### Task 2: Update StreamingChat tool labels for new tool names

**Files:**
- Modify: `src/components/streaming/StreamingChat.tsx` (lines 10-32)

**Step 1: Update TOOL_LABELS and getToolLabel**

Replace the `TOOL_LABELS` record and `getToolLabel` function with updated tool names that match the current orchestrator tools (Valyu + Firecrawl, not the old fetch_financials/scrape_company):

```typescript
const TOOL_LABELS: Record<string, string> = {
  load_methodology: "Loading methodology",
  finance_search: "Searching financial data",
  sec_search: "Searching SEC filings",
  company_research: "Researching company",
  scrape: "Scraping webpage",
  extract: "Extracting data",
  firecrawl_search: "Searching web (Firecrawl)",
  run_calculation: "Running ROI calculations",
  web_search: "Searching the web",
};

function getToolLabel(
  toolName: string,
  input: Record<string, unknown> | undefined,
): string {
  if (toolName === "load_methodology" && input?.service_type) {
    return `Loading methodology for ${input.service_type}`;
  }
  if (toolName === "finance_search" && input?.query) {
    return `Searching financials: ${(input.query as string).slice(0, 60)}`;
  }
  if (toolName === "sec_search" && input?.query) {
    return `Searching SEC filings: ${(input.query as string).slice(0, 60)}`;
  }
  if (toolName === "company_research" && input?.query) {
    return `Researching: ${(input.query as string).slice(0, 60)}`;
  }
  if (toolName === "scrape" && input?.url) {
    return `Scraping ${(input.url as string).slice(0, 50)}`;
  }
  return TOOL_LABELS[toolName] ?? `Using ${toolName}`;
}
```

**Step 2: Update ToolOutputSummary**

In the `ToolOutputSummary` component, update the `fetch_financials` / `scrape_company` branch to handle new tool names. Since Valyu/Firecrawl tools return different output shapes, simplify to a generic fallback — the collapsible detail isn't critical for these provider-managed tools:

```typescript
// Remove the `fetch_financials || scrape_company` branch entirely.
// Keep the `load_methodology` and `run_calculation` branches as-is.
// The generic fallback (return null) handles Valyu/Firecrawl tools gracefully.
```

**Step 3: Type-check**

```bash
npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add src/components/streaming/StreamingChat.tsx
git commit -m "fix: update StreamingChat tool labels for Valyu/Firecrawl tools"
```

---

### Task 3: Update orchestrator system prompt to produce a calculation narrative

**Files:**
- Modify: `src/lib/agent/orchestrator.ts` — the `getSystemPrompt()` function, specifically step 5 in the Process section

**Step 1: Update step 5 in the system prompt**

Replace this text in `getSystemPrompt()`:

```
5. **Done** — The frontend renders structured results from the calculation data.
   You do NOT need to format or present the results. Just confirm the analysis is complete.
```

With:

```
5. **Write calculation narrative** — After the calculation completes, write a brief
   explanation (3-5 paragraphs) of your analysis for the Client Partner. Cover:
   - What financial data you found and from where (cite specific sources)
   - What benchmark assumptions you used and why they're reasonable
   - How the key impact numbers were derived (walk through 1-2 of the biggest KPIs)
   - Any caveats, data gaps, or confidence concerns the CP should know about
   Write in clear business language. The CP will use this to understand and defend
   the numbers in conversation with the client. Do not repeat raw numbers the UI
   already shows — focus on reasoning, sources, and judgment calls.
```

Also update the Key Principles section — remove the line:

```
- Keep your reasoning concise — the user does not see your text output.
```

Replace with:

```
- Your text output is shown to the CP as the calculation narrative. Write clearly and concisely.
```

**Step 2: Type-check**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add src/lib/agent/orchestrator.ts
git commit -m "feat: update system prompt to produce calculation narrative for CP"
```

---

### Task 4: Render narrative text in the results page

**Files:**
- Modify: `src/app/cases/[caseId]/page.tsx` (lines 27-67, the results view branch)
- Modify: `src/components/results/ResultsView.tsx` — add narrative prop

**Step 1: Add narrative prop to ResultsView**

In `ResultsView.tsx`, add `narrative` to the Props interface:

```typescript
interface Props {
  result: CalculationResult;
  scenario: Scenario;
  serviceType: string;
  narrative: string;
}
```

Add a narrative section at the bottom of the `ResultsView` component, after the "Skipped Metrics" section and before the closing `</div>`:

```tsx
{/* Calculation Narrative */}
{narrative && (
  <section className="space-y-2">
    <h3 className="text-base font-semibold text-gray-900">
      Analysis Notes
    </h3>
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">
        {narrative}
      </div>
    </div>
  </section>
)}
```

**Step 2: Pass narrative from case page**

In `src/app/cases/[caseId]/page.tsx`, read narrative from the store and pass it:

Add to the store selectors (around line 21):

```typescript
const narrative = useCaseStore((s) => s.narrative);
```

Update the ResultsView usage (around line 59):

```tsx
<ResultsView
  result={results}
  scenario={activeScenario}
  serviceType={serviceType || "Experience Transformation & Design"}
  narrative={narrative}
/>
```

**Step 3: Type-check**

```bash
npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add src/components/results/ResultsView.tsx src/app/cases/\\[caseId\\]/page.tsx
git commit -m "feat: render LLM calculation narrative in results view"
```

---

### Task 5: Final verification

**Step 1: Full type-check**

```bash
npx tsc --noEmit
```

**Step 2: Dev server smoke test**

```bash
npm run dev
```

Verify the dev server starts without errors.

**Step 3: Commit any remaining changes**

If anything was missed, stage and commit.
