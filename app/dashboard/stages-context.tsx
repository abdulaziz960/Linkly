"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { pipelineStages } from "./types";

const DEFAULT_STAGES: string[] = [...pipelineStages];
const StagesContext = createContext<string[]>(DEFAULT_STAGES);

/** The workspace's pipeline stages (built-in + custom). Falls back to the built-in list until loaded. */
export function useStages() {
  return useContext(StagesContext);
}

export function StagesProvider({ stages, children }: { stages: string[]; children: React.ReactNode }) {
  return <StagesContext.Provider value={stages}>{children}</StagesContext.Provider>;
}

/** Loads /api/pipeline/stages and returns [stages, setStages]. */
export function useLoadedStages(): [string[], (next: string[]) => void] {
  const [stages, setStages] = useState<string[]>(DEFAULT_STAGES);
  const load = useCallback(async () => {
    const response = await fetch("/api/pipeline/stages", { cache: "no-store" }).catch(() => null);
    const payload = (await response?.json().catch(() => null)) as { ok?: boolean; data?: { stages?: string[] } } | null;
    if (payload?.ok && Array.isArray(payload.data?.stages)) setStages(payload.data.stages);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return [stages, setStages];
}
