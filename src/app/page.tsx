import { CaseInputForm } from "../components/input-form/CaseInputForm";

export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-black">
      <div className="w-full max-w-xl px-6">
        <div className="text-center mb-10">
          <h1 className="text-5xl font-light tracking-tight text-white">
            ROI Case Builder
          </h1>
          <p className="mt-3 text-[#a8a8a8] text-lg">
            Enter a company to generate a data-backed ROI case
          </p>
        </div>
        <CaseInputForm />
      </div>
    </main>
  );
}
