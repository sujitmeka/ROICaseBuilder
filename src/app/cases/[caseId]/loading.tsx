const SKELETON_ROW = (
  <div className="animate-pulse flex items-center gap-3">
    <div className="h-5 w-5 bg-gray-200 rounded-full flex-shrink-0" />
    <div className="h-4 bg-gray-200 rounded flex-1" />
    <div className="h-4 w-4 bg-gray-200 rounded flex-shrink-0" />
  </div>
);

const SKELETON_INDICES = [0, 1, 2, 3];

export default function CaseLoading() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-6 py-16">
        <div className="animate-pulse text-center mb-12">
          <div className="h-8 w-64 bg-gray-200 rounded mx-auto" />
          <div className="h-4 w-48 bg-gray-200 rounded mx-auto mt-3" />
        </div>

        <div className="space-y-3">
          {SKELETON_INDICES.map((i) => (
            <div
              key={i}
              className="rounded-lg border border-gray-200 bg-white px-4 py-3"
            >
              {SKELETON_ROW}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
