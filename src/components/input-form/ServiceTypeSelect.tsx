"use client";

import { SERVICE_TYPES, SERVICE_TYPE_LABELS } from "../../lib/schemas";

const SERVICE_OPTIONS = SERVICE_TYPES.map((key) => ({
  key,
  label: SERVICE_TYPE_LABELS[key],
}));

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export function ServiceTypeSelect({ value, onChange }: Props) {
  return (
    <select
      id="serviceType"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Service Type"
      className="w-full rounded-sm border border-[#2a2a2a] bg-[#0a0a0a] px-3 py-2 text-sm text-white focus:outline-none focus:border-white focus:ring-1 focus:ring-white"
    >
      {SERVICE_OPTIONS.map(({ key, label }) => (
        <option key={key} value={key}>
          {label}
        </option>
      ))}
    </select>
  );
}
