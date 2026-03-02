"use client";

import { INDUSTRY_VERTICALS, INDUSTRY_LABELS } from "../../lib/schemas";

const INDUSTRY_OPTIONS = INDUSTRY_VERTICALS.map((key) => ({
  key,
  label: INDUSTRY_LABELS[key],
}));

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
      {INDUSTRY_OPTIONS.map(({ key, label }) => (
        <option key={key} value={key}>
          {label}
        </option>
      ))}
    </select>
  );
}
