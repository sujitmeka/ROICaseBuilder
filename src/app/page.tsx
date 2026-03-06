import { CaseInputForm } from "../components/input-form/CaseInputForm";

export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-black py-16">
      <div className="w-full max-w-xl px-6">
        <div className="text-center mb-10">
          <h1 className="text-5xl font-light tracking-tight text-white">
            ROI Case Builder
          </h1>
          <p className="mt-3 text-[#a8a8a8] text-lg">
            Enter a company to generate a data-backed ROI case
          </p>
        </div>

        <div className="mb-10 rounded-lg border border-[#222] bg-[#0a0a0a] px-6 py-5">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h3 className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#4a9]  mb-3">
                What this is
              </h3>
              <ul className="space-y-2.5 text-[13px] leading-relaxed text-[#999]">
                <li className="flex gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#4a9]" />
                  A starting point for client conversations — an AI-generated
                  ROI estimate grounded in real financial data and industry
                  benchmarks
                </li>
                <li className="flex gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#4a9]" />
                  A scoping tool that identifies which parts of a client{"'"}s
                  business an engagement would impact and sizes the potential
                  value
                </li>
                <li className="flex gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#4a9]" />
                  Transparent by design — every number traces to a source, every
                  assumption is visible and adjustable
                </li>
                <li className="flex gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#4a9]" />
                  Takes about 5–8 minutes to generate a full analysis
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#a88] mb-3">
                What this is not
              </h3>
              <ul className="space-y-2.5 text-[13px] leading-relaxed text-[#999]">
                <li className="flex gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#a88]" />
                  A final deliverable — this is a hypothesis to sharpen, not a
                  finished analysis to present as-is
                </li>
                <li className="flex gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#a88]" />
                  A full project simulation — factors like organizational
                  readiness, change management complexity, and ongoing costs are
                  not modeled
                </li>
                <li className="flex gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#a88]" />
                  A precise implementation cost — the tool estimates what
                  implementation may cost based on company scale, but actuals
                  depend on internal teams and technology
                </li>
                <li className="flex gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#a88]" />
                  A guarantee of outcomes — estimates reflect what{"'"}s
                  achievable based on comparable benchmarks, not what will happen
                </li>
              </ul>
            </div>
          </div>
        </div>

        <CaseInputForm />
      </div>
    </main>
  );
}
