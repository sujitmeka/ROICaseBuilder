import { create } from "zustand";

export type StepStatus = "pending" | "active" | "completed" | "error";

export interface PipelineStep {
  id: string;
  label: string;
  status: StepStatus;
  message?: string;
}

interface StreamStore {
  pipelineSteps: PipelineStep[];
  connectionStatus: "disconnected" | "connecting" | "connected";
  error: string | null;
  updateStep: (
    id: string,
    updates: Partial<Pick<PipelineStep, "status" | "message">>
  ) => void;
  setConnectionStatus: (
    status: "disconnected" | "connecting" | "connected"
  ) => void;
  initializeSteps: (steps: PipelineStep[]) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useStreamStore = create<StreamStore>((set) => ({
  pipelineSteps: [],
  connectionStatus: "disconnected",
  error: null,

  updateStep: (id, updates) =>
    set((state) => ({
      pipelineSteps: state.pipelineSteps.map((step) =>
        step.id === id ? { ...step, ...updates } : step
      ),
    })),

  setConnectionStatus: (status) => set({ connectionStatus: status }),

  initializeSteps: (steps) => set({ pipelineSteps: steps }),

  setError: (error) => set({ error }),

  reset: () => set({
    pipelineSteps: [],
    connectionStatus: "disconnected",
    error: null,
  }),
}));
