"use client";

import { SERVICE_TYPES, SERVICE_TYPE_LABELS } from "../../lib/schemas";

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
      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      {SERVICE_TYPES.map((key) => (
        <option key={key} value={key}>
          {SERVICE_TYPE_LABELS[key]}
        </option>
      ))}
    </select>
  );
}
