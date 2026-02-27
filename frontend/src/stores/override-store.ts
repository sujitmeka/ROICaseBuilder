import { create } from "zustand";

export interface Override {
  original: number;
  override: number;
  reason?: string;
}

interface OverrideStore {
  overrides: Record<string, Override>;
  applyOverride: (
    fieldName: string,
    newValue: number,
    originalValue: number
  ) => void;
  resetOverride: (fieldName: string) => void;
  resetAll: () => void;
}

export const useOverrideStore = create<OverrideStore>((set) => ({
  overrides: {},

  applyOverride: (fieldName, newValue, originalValue) =>
    set((state) => ({
      overrides: {
        ...state.overrides,
        [fieldName]: { original: originalValue, override: newValue },
      },
    })),

  resetOverride: (fieldName) =>
    set((state) => {
      const { [fieldName]: _, ...rest } = state.overrides;
      return { overrides: rest };
    }),

  resetAll: () => set({ overrides: {} }),
}));
