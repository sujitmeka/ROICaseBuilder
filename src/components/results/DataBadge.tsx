"use client";

import { cn } from "../../lib/utils";

type DataClass = "company" | "benchmark" | "estimated" | "override";

interface Props {
  dataClass: DataClass;
  size?: "sm" | "md";
}

const config: Record<DataClass, { label: string; className: string }> = {
  company: {
    label: "Company Data",
    className: "bg-blue-50 text-blue-700 border-blue-200",
  },
  estimated: {
    label: "Estimated",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
  benchmark: {
    label: "Benchmark",
    className: "bg-purple-50 text-purple-700 border-purple-200",
  },
  override: {
    label: "Manual Override",
    className: "bg-green-50 text-green-700 border-green-200",
  },
};

export function DataBadge({ dataClass, size = "md" }: Props) {
  const { label, className } = config[dataClass];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-medium",
        className,
        size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs"
      )}
    >
      {label}
    </span>
  );
}
