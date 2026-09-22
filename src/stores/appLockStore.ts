import { create } from "zustand";

/**
 * App lock store — placeholder only.
 * Real PIN/biometric lock will be implemented in a later version.
 */
interface AppLockState {
  isLocked: boolean;
  lock: () => void;
  unlock: () => void;
}

export const useAppLockStore = create<AppLockState>()((set) => ({
  isLocked: false,
  lock: () => set({ isLocked: true }),
  unlock: () => set({ isLocked: false }),
}));
