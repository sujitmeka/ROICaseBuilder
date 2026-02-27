"use client";

import { useEffect, useRef } from "react";

interface Props {
  text: string;
}

export function NarrativeStream({ text }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [text]);

  return (
    <div
      className="rounded-lg border bg-white p-6"
      role="status"
      aria-label="Narrative being generated"
      aria-live="polite"
    >
      <h3 className="text-sm font-medium text-gray-500 mb-3">
        Narrative Preview
      </h3>
      <div
        ref={containerRef}
        className="prose prose-sm max-h-64 overflow-y-auto"
      >
        {text}
        <span className="inline-block w-2 h-4 bg-blue-500 animate-pulse ml-0.5" />
      </div>
    </div>
  );
}
