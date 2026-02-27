"use client";

import { INDUSTRY_VERTICALS, INDUSTRY_LABELS } from "../../lib/schemas";

interface Props {
  value: string | undefined;
  onChange: (value: string) => void;
}

export function IndustrySelect({ value, onChange }: Props) {
  return (
    <select
      id="industryVertical"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Industry Vertical"
      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      <option value="" disabled>
        Select industry...
      </option>
      {INDUSTRY_VERTICALS.map((key) => (
        <option key={key} value={key}>
          {INDUSTRY_LABELS[key]}
        </option>
      ))}
    </select>
  );
}
