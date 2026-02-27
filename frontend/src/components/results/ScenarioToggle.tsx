"use client";

import { useCaseStore, type Scenario } from "../../stores/case-store";

const SCENARIOS: { value: Scenario; label: string }[] = [
  { value: "conservative", label: "Conservative" },
  { value: "moderate", label: "Moderate" },
  { value: "aggressive", label: "Aggressive" },
];

export function ScenarioToggle() {
  const activeScenario = useCaseStore((s) => s.activeScenario);
  const setActiveScenario = useCaseStore((s) => s.setActiveScenario);

  return (
    <div
      className="inline-flex rounded-lg border bg-gray-100 p-1"
      role="radiogroup"
      aria-label="Scenario selector"
    >
      {SCENARIOS.map((scenario) => (
        <button
          key={scenario.value}
          role="radio"
          aria-checked={activeScenario === scenario.value}
          onClick={() => setActiveScenario(scenario.value)}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            activeScenario === scenario.value
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-900"
          }`}
        >
          {scenario.label}
        </button>
      ))}
    </div>
  );
}
