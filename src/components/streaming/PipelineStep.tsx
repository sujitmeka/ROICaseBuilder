"use client";

import { Check, Loader2, Circle, XCircle } from "lucide-react";
import { cn } from "../../lib/utils";
import type { StepStatus } from "../../stores/stream-store";

export interface PipelineStepProps {
  step: {
    id: string;
    label: string;
    status: StepStatus;
    message?: string;
  };
  isLast: boolean;
}

export function PipelineStep({ step, isLast }: PipelineStepProps) {
  return (
    <div
      className="flex gap-4"
      role="listitem"
      aria-current={step.status === "active" ? "step" : undefined}
    >
      <div className="flex flex-col items-center">
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2",
            step.status === "active" && "border-blue-500 bg-blue-50",
            step.status === "completed" && "border-green-600 bg-green-50",
            step.status === "error" && "border-red-500 bg-red-50",
            step.status === "pending" && "border-gray-300 bg-gray-50"
          )}
        >
          {step.status === "pending" && (
            <Circle className="h-4 w-4 text-muted-foreground/40" />
          )}
          {step.status === "active" && (
            <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
          )}
          {step.status === "completed" && (
            <Check className="h-4 w-4 text-green-600" />
          )}
          {step.status === "error" && (
            <XCircle className="h-4 w-4 text-red-500" />
          )}
        </div>
        {!isLast && (
          <div
            className={cn(
              "w-0.5 flex-1 min-h-[2rem]",
              step.status === "completed" && "bg-green-600/30",
              step.status === "active" && "bg-blue-500/30",
              step.status === "error" && "bg-red-500/30",
              step.status === "pending" && "bg-gray-200"
            )}
          />
        )}
      </div>

      <div className="pb-6 pt-1">
        <p
          className={cn(
            "text-sm font-medium",
            step.status === "pending" && "text-muted-foreground/60",
            step.status === "active" && "text-foreground",
            step.status === "completed" && "text-foreground",
            step.status === "error" && "text-red-500"
          )}
        >
          {step.label}
        </p>

        {step.message && step.status !== "error" && (
          <p className="mt-1 text-sm text-gray-500">{step.message}</p>
        )}

        {step.status === "error" && step.message && (
          <p className="mt-1 text-sm text-red-500">{step.message}</p>
        )}
      </div>
    </div>
  );
}
