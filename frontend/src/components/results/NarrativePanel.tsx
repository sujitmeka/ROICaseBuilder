"use client";

interface Props {
  narrative: string;
}

export function NarrativePanel({ narrative }: Props) {
  // Narrative content comes from our own backend pipeline,
  // not from user input. It is trusted server-generated content.
  return (
    <article className="prose prose-slate max-w-none" aria-label="ROI narrative">
      <p>{narrative}</p>
    </article>
  );
}
