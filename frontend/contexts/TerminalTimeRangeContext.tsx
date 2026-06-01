'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import type { DashboardTimeRange } from '@/lib/dashboardTimeRange';

type TerminalTimeRangeContextValue = {
  timeRange: DashboardTimeRange;
  setTimeRange: (tr: DashboardTimeRange) => void;
};

const TerminalTimeRangeContext = createContext<TerminalTimeRangeContextValue | null>(null);

export function TerminalTimeRangeProvider({ children }: { children: ReactNode }) {
  const [timeRange, setTimeRange] = useState<DashboardTimeRange>(30);
  return (
    <TerminalTimeRangeContext.Provider value={{ timeRange, setTimeRange }}>
      {children}
    </TerminalTimeRangeContext.Provider>
  );
}

export function useTerminalTimeRange(): TerminalTimeRangeContextValue {
  const ctx = useContext(TerminalTimeRangeContext);
  if (!ctx) {
    throw new Error('useTerminalTimeRange must be used within TerminalTimeRangeProvider');
  }
  return ctx;
}
