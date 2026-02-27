"use client";

import { PipelineStep } from "./PipelineStep";
import type { PipelineStep as PipelineStepType } from "../../stores/stream-store";

interface Props {
  steps: PipelineStepType[];
}

export function PipelineTimeline({ steps }: Props) {
  return (
    <div className="space-y-0" role="list" aria-label="Analysis progress">
      {steps.map((step, index) => (
        <PipelineStep
          key={step.id}
          step={step}
          isLast={index === steps.length - 1}
        />
      ))}
    </div>
  );
}
