import { create } from "zustand";
import type { User } from "@planner/shared";

interface SessionState {
  user: User | null;
  connected: boolean;
  /** Increments whenever a mutation lands (own or from the other device). */
  syncPulse: number;
  setUser: (user: User | null) => void;
  setConnected: (connected: boolean) => void;
  pulse: () => void;
}

export const useSession = create<SessionState>((set) => ({
  user: null,
  connected: false,
  syncPulse: 0,
  setUser: (user) => set({ user }),
  setConnected: (connected) => set({ connected }),
  pulse: () => set((s) => ({ syncPulse: s.syncPulse + 1 })),
}));
