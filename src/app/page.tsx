import { CaseInputForm } from "../components/input-form/CaseInputForm";

export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-lg px-6">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-semibold tracking-tight">
            ROI Case Builder
          </h1>
          <p className="mt-3 text-gray-500 text-lg">
            Enter a company to generate a data-backed ROI case
          </p>
        </div>
        <CaseInputForm />
      </div>
    </main>
  );
}
