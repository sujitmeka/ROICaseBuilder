"use client";

import type { AuditEntry } from "../../stores/case-store";
import { DataBadge } from "./DataBadge";
import { cn } from "../../lib/utils";

interface Props {
  entry: AuditEntry;
  isHighlighted: boolean;
}

export function AuditEntryCard({ entry, isHighlighted }: Props) {
  return (
    <div
      id={`audit-entry-${entry.id}`}
      className={cn(
        "rounded-lg border p-3 transition-all duration-300",
        isHighlighted && "ring-1 ring-blue-500/50 bg-blue-50/50",
        !isHighlighted && "bg-white"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {entry.citationIndex && (
            <span className="text-xs font-mono text-gray-500 shrink-0">
              [{entry.citationIndex}]
            </span>
          )}
          <span className="text-sm font-medium truncate">{entry.label}</span>
        </div>
        <DataBadge dataClass={entry.dataClass} size="sm" />
      </div>
      <div className="mt-2">
        <span className="text-lg font-semibold">{entry.formattedValue}</span>
      </div>
    </div>
  );
}
