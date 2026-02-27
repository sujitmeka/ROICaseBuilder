"use client";

import type { AuditEntry } from "../../stores/case-store";
import { AuditEntryCard } from "./AuditEntry";

interface Props {
  entries: AuditEntry[];
  activeSectionId: string | null;
  scenario: string;
}

export function AuditSidebar({ entries, activeSectionId }: Props) {
  return (
    <aside
      className="sticky top-[180px] max-h-[calc(100vh-200px)] overflow-y-auto space-y-3"
      role="complementary"
      aria-label="Audit trail"
    >
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
        Audit Trail
      </h2>

      {entries.map((entry) => (
        <AuditEntryCard
          key={entry.id}
          entry={entry}
          isHighlighted={entry.narrativeSectionId === activeSectionId}
        />
      ))}
    </aside>
  );
}
