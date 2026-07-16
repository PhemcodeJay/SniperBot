// lib/realtimeDataContext.ts
// Shared context for real-time data across all dashboard components

import React from 'react';
import { RealtimeData } from '@/hooks/useRealtimeData';

export interface RealtimeDataContextType {
  data: RealtimeData | null;
  loading: boolean;
  error: Error | null;
  lastUpdate: number;
  refetch: () => Promise<void>;
}

export const RealtimeDataContext = React.createContext<RealtimeDataContextType | undefined>(undefined);

export function useSharedRealtimeData() {
  const context = React.useContext(RealtimeDataContext);
  if (!context) {
    throw new Error('useSharedRealtimeData must be used within RealtimeDataProvider');
  }
  return context;
}
