import { create } from "zustand";

export type ActivityType =
  | "thinking"
  | "tool_start"
  | "tool_complete"
  | "data_found"
  | "search"
  | "milestone"
  | "error";

export interface ActivityEntry {
  id: string;
  type: ActivityType;
  timestamp: string;
  title: string;
  detail?: string;
  tool?: string;
  status?: "running" | "done" | "error";
}

interface ActivityStore {
  entries: ActivityEntry[];
  addEntry: (entry: ActivityEntry) => void;
  updateEntry: (id: string, updates: Partial<ActivityEntry>) => void;
  reset: () => void;
}

export const useActivityStore = create<ActivityStore>((set) => ({
  entries: [],
  addEntry: (entry) => set((s) => ({ entries: [...s.entries, entry] })),
  updateEntry: (id, updates) =>
    set((s) => ({
      entries: s.entries.map((e) => (e.id === id ? { ...e, ...updates } : e)),
    })),
  reset: () => set({ entries: [] }),
}));
