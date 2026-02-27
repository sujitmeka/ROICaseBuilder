"use client";

import { useEffect, useRef } from "react";
import {
  useActivityStore,
  type ActivityEntry,
} from "../../stores/activity-store";

function RelativeTime({ timestamp }: { timestamp: string }) {
  const seconds = Math.floor(
    (Date.now() - new Date(timestamp).getTime()) / 1000
  );
  if (seconds < 5)
    return <span className="text-xs text-gray-400">just now</span>;
  if (seconds < 60)
    return <span className="text-xs text-gray-400">{seconds}s ago</span>;
  return (
    <span className="text-xs text-gray-400">
      {Math.floor(seconds / 60)}m ago
    </span>
  );
}

function EntryIcon({ entry }: { entry: ActivityEntry }) {
  if (entry.status === "running") {
    return (
      <div className="w-5 h-5 flex items-center justify-center">
        <div className="w-3 h-3 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (entry.status === "done") {
    return (
      <div className="w-5 h-5 flex items-center justify-center text-green-500">
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5 13l4 4L19 7"
          />
        </svg>
      </div>
    );
  }

  if (entry.status === "error") {
    return (
      <div className="w-5 h-5 flex items-center justify-center text-red-500">
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </div>
    );
  }

  if (entry.type === "milestone") {
    return (
      <div className="w-5 h-5 flex items-center justify-center text-blue-500">
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13 10V3L4 14h7v7l9-11h-7z"
          />
        </svg>
      </div>
    );
  }

  if (entry.type === "data_found") {
    return (
      <div className="w-5 h-5 flex items-center justify-center text-amber-500">
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
          />
        </svg>
      </div>
    );
  }

  // Default: thinking indicator (pulsing dot)
  return (
    <div className="w-5 h-5 flex items-center justify-center">
      <div className="w-2 h-2 rounded-full bg-gray-400 animate-pulse" />
    </div>
  );
}

function ActivityItem({ entry }: { entry: ActivityEntry }) {
  const isThinking = entry.type === "thinking";

  return (
    <div
      className={`flex gap-3 py-2 px-3 rounded-md transition-colors ${
        entry.status === "running" ? "bg-blue-50/50" : ""
      }`}
    >
      <div className="pt-0.5 flex-shrink-0">
        <EntryIcon entry={entry} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={`text-sm font-medium ${
              isThinking ? "text-gray-500" : "text-gray-800"
            }`}
          >
            {entry.title}
          </span>
          <RelativeTime timestamp={entry.timestamp} />
        </div>
        {entry.detail && (
          <p
            className={`text-sm mt-0.5 leading-relaxed ${
              isThinking ? "text-gray-400 italic" : "text-gray-500"
            }`}
          >
            {entry.detail.length > 200
              ? entry.detail.slice(0, 200) + "..."
              : entry.detail}
          </p>
        )}
      </div>
    </div>
  );
}

export function ActivityFeed() {
  const entries = useActivityStore((s) => s.entries);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries.length]);

  if (entries.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="w-6 h-6 rounded-full border-2 border-blue-500 border-t-transparent animate-spin mx-auto" />
        <p className="text-sm text-gray-400 mt-3">
          Waiting for agent to start...
        </p>
      </div>
    );
  }

  return (
    <div
      className="max-h-96 overflow-y-auto space-y-0.5"
      role="log"
      aria-label="Agent activity"
    >
      {entries.map((entry) => (
        <ActivityItem key={entry.id} entry={entry} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
