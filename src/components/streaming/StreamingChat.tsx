"use client";

import { useState } from "react";
import type { UIMessage } from "ai";

// ---------------------------------------------------------------------------
// Tool display names and icons
// ---------------------------------------------------------------------------

const TOOL_LABELS: Record<string, string> = {
  load_methodology: "Loading methodology",
  fetch_financials: "Fetching financial data",
  scrape_company: "Scraping company data",
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
  if (toolName === "fetch_financials" && input?.company_name) {
    return `Fetching financial data for ${input.company_name}`;
  }
  if (toolName === "scrape_company" && input?.company_name) {
    return `Scraping company data for ${input.company_name}`;
  }
  return TOOL_LABELS[toolName] ?? `Using ${toolName}`;
}

// ---------------------------------------------------------------------------
// Tool output summaries
// ---------------------------------------------------------------------------

function ToolOutputSummary({
  toolName,
  output,
}: {
  toolName: string;
  output: unknown;
}) {
  if (!output || typeof output !== "object") return null;
  const data = output as Record<string, unknown>;

  if (toolName === "load_methodology") {
    const kpis = data.kpis as Array<{ id: string; label: string }> | undefined;
    return (
      <div className="text-sm text-gray-600 space-y-1">
        <p className="font-medium text-gray-700">
          Methodology loaded: {(data.name as string) ?? "Experience Transformation"}
        </p>
        {kpis && (
          <ul className="list-disc list-inside text-xs text-gray-500">
            {kpis.map((k) => (
              <li key={k.id}>{k.label}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (toolName === "fetch_financials" || toolName === "scrape_company") {
    const fields = data.fields as Record<string, unknown> | undefined;
    const gaps = data.gaps as string[] | undefined;
    const fieldCount = fields ? Object.keys(fields).length : 0;
    return (
      <div className="text-sm text-gray-600 space-y-1">
        {fieldCount > 0 ? (
          <p>
            <span className="font-medium text-gray-700">{fieldCount} data fields</span> retrieved
          </p>
        ) : (
          <p className="text-amber-600">No data found — will use benchmarks</p>
        )}
        {gaps && gaps.length > 0 && (
          <p className="text-xs text-gray-500">
            Gaps: {gaps.slice(0, 5).join(", ")}
            {gaps.length > 5 && ` +${gaps.length - 5} more`}
          </p>
        )}
      </div>
    );
  }

  if (toolName === "run_calculation") {
    const scenarios = data.scenarios as Record<string, { total_annual_impact?: number; kpi_results?: unknown[] }> | undefined;
    const moderate = scenarios?.moderate;
    if (moderate?.total_annual_impact) {
      const impact = moderate.total_annual_impact;
      const formatted = Math.abs(impact) >= 1_000_000
        ? `$${(impact / 1_000_000).toFixed(1)}M`
        : `$${(impact / 1_000).toFixed(0)}K`;
      const kpiCount = moderate.kpi_results
        ? (moderate.kpi_results as Array<{ skipped?: boolean }>).filter((k) => !k.skipped).length
        : 0;
      return (
        <div className="text-sm text-gray-600">
          <p>
            <span className="font-medium text-gray-700">{formatted}</span> annual impact across{" "}
            <span className="font-medium text-gray-700">{kpiCount} KPIs</span>
          </p>
        </div>
      );
    }
  }

  // Fallback: show nothing for unknown tools
  return null;
}

// ---------------------------------------------------------------------------
// Web search results (for Anthropic provider web_search tool)
// ---------------------------------------------------------------------------

function WebSearchResults({ output }: { output: unknown }) {
  if (!output || typeof output !== "object") return null;

  // Anthropic web_search returns results in various formats
  const data = output as Record<string, unknown>;
  const results = (data.results ?? data.search_results ?? []) as Array<{
    title?: string;
    url?: string;
    snippet?: string;
  }>;

  if (results.length === 0) return null;

  return (
    <div className="space-y-2">
      {results.slice(0, 5).map((r, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="mt-0.5 text-gray-400 text-xs">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
            </svg>
          </span>
          <div className="min-w-0">
            {r.url ? (
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:text-blue-800 hover:underline font-medium truncate block"
              >
                {r.title ?? r.url}
              </a>
            ) : (
              <p className="text-sm font-medium text-gray-700">{r.title}</p>
            )}
            {r.snippet && (
              <p className="text-xs text-gray-500 line-clamp-2">{r.snippet}</p>
            )}
          </div>
        </div>
      ))}
      {results.length > 5 && (
        <p className="text-xs text-gray-400">+{results.length - 5} more results</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collapsible tool call section
// ---------------------------------------------------------------------------

function ToolCallSection({
  toolName,
  state,
  input,
  output,
}: {
  toolName: string;
  state: string;
  input: unknown;
  output: unknown;
}) {
  const [open, setOpen] = useState(false);
  const isRunning = state === "input-streaming" || state === "input-available";
  const isComplete = state === "output-available";
  const isError = state === "output-error";
  const label = getToolLabel(toolName, input as Record<string, unknown>);

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        {/* Status icon */}
        {isRunning ? (
          <span className="flex-shrink-0 h-5 w-5 text-blue-500 animate-spin">
            <svg viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </span>
        ) : isError ? (
          <span className="flex-shrink-0 h-5 w-5 text-red-500">
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </span>
        ) : (
          <span className="flex-shrink-0 h-5 w-5 text-green-500">
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          </span>
        )}

        {/* Label */}
        <span className="flex-1 text-sm font-medium text-gray-700">{label}</span>

        {/* Chevron */}
        <svg
          className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>

      {/* Collapsible content */}
      {open && isComplete && (
        <div className="px-4 pb-4 border-t border-gray-100">
          <div className="pt-3">
            {toolName === "web_search" ? (
              <WebSearchResults output={output} />
            ) : (
              <ToolOutputSummary toolName={toolName} output={output} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Source URL link
// ---------------------------------------------------------------------------

function SourceLink({ url, title }: { url: string; title?: string }) {
  const hostname = (() => {
    try { return new URL(url).hostname; } catch { return url; }
  })();

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 hover:underline"
    >
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
      </svg>
      {title ?? hostname}
    </a>
  );
}

// ---------------------------------------------------------------------------
// Main StreamingChat
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPart = any;

function getToolInfo(part: AnyPart): {
  toolName: string;
  state: string;
  input: unknown;
  output: unknown;
} | null {
  if (part.type === "dynamic-tool") {
    return {
      toolName: part.toolName,
      state: part.state,
      input: part.input,
      output: part.output,
    };
  }
  if (typeof part.type === "string" && part.type.startsWith("tool-")) {
    return {
      toolName: part.type.replace("tool-", ""),
      state: part.state,
      input: part.input,
      output: part.output,
    };
  }
  return null;
}

export function StreamingChat({ messages }: { messages: UIMessage[] }) {
  const assistantMsgs = messages.filter((m) => m.role === "assistant");
  if (assistantMsgs.length === 0) return null;

  // Render parts from all assistant messages (multi-step tools span messages)
  const allParts: Array<{ part: AnyPart; key: string }> = [];
  for (const msg of assistantMsgs) {
    for (let i = 0; i < msg.parts.length; i++) {
      allParts.push({ part: msg.parts[i], key: `${msg.id}-${i}` });
    }
  }

  return (
    <div className="space-y-3">
      {allParts.map(({ part, key }) => {
        // Text parts — show brief AI reasoning
        if (part.type === "text" && part.text?.trim()) {
          return (
            <p key={key} className="text-sm text-gray-600 leading-relaxed">
              {part.text}
            </p>
          );
        }

        // Step dividers
        if (part.type === "step-start") {
          return null; // Clean separation handled by spacing
        }

        // Tool calls — collapsible sections
        const tool = getToolInfo(part);
        if (tool) {
          return (
            <ToolCallSection
              key={key}
              toolName={tool.toolName}
              state={tool.state}
              input={tool.input}
              output={tool.output}
            />
          );
        }

        // Source URLs from web search
        if (part.type === "source-url") {
          return <SourceLink key={key} url={part.url} title={part.title} />;
        }

        return null;
      })}
    </div>
  );
}
