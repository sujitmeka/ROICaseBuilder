"use client";

import { useEffect, useRef } from "react";

interface Props {
  text: string;
  streaming?: boolean;
}

export function NarrativeStream({ text, streaming = true }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [text]);

  return (
    <div role="status" aria-label="Narrative being generated" aria-live="polite">
      <div
        ref={containerRef}
        className="prose prose-sm max-h-96 overflow-y-auto whitespace-pre-wrap"
      >
        {text}
        {streaming && (
          <span className="inline-block w-2 h-4 bg-blue-500 animate-pulse ml-0.5" />
        )}
      </div>
    </div>
  );
}
