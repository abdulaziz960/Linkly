"use client";

import { createContext, useContext, type ReactNode } from "react";

/** True from the dashboard opening until its first data answer has arrived: views show skeletons, not "nothing here". */
const DataLoadingContext = createContext(false);

export function DataLoadingProvider({ loading, children }: { loading: boolean; children: ReactNode }) {
  return <DataLoadingContext.Provider value={loading}>{children}</DataLoadingContext.Provider>;
}

export function useDataLoading() {
  return useContext(DataLoadingContext);
}
