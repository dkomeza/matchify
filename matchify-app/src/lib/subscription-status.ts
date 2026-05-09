import { useSyncExternalStore } from "react";

export type SubscriptionConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting";

let currentStatus: SubscriptionConnectionStatus = "idle";
const listeners = new Set<() => void>();

export const setSubscriptionConnectionStatus = (
  status: SubscriptionConnectionStatus,
) => {
  if (currentStatus === status) return;

  currentStatus = status;
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = () => currentStatus;

export const useSubscriptionConnectionStatus = () =>
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
