"use client";

export default function CaseError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="min-h-screen bg-black flex items-center justify-center">
      <div className="max-w-md text-center">
        <h2 className="text-xl font-semibold text-white">
          Something went wrong
        </h2>
        <p className="mt-2 text-[#a8a8a8]">{error.message}</p>
        <button
          onClick={reset}
          className="mt-4 px-4 py-2 bg-white text-black rounded-sm hover:bg-[#e0e0e0] transition-colors"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
