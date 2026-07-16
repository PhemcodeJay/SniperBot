// components/RealtimeDataProvider.tsx
// Provider component for sharing real-time Bybit data across all dashboard components

'use client';

import React, { ReactNode } from 'react';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { RealtimeDataContext } from '@/lib/realtimeDataContext';
import { logger } from '@/lib/logger';

interface RealtimeDataProviderProps {
  children: ReactNode;
  pollInterval?: number;
}

export function RealtimeDataProvider({ children, pollInterval = 2000 }: RealtimeDataProviderProps) {
  const { data, loading, error, refetch } = useRealtimeData({
    pollInterval,
    enabled: true,
    onError: (error) => {
      logger.error('RealtimeDataProvider', 'Polling error', { message: error.message });
    },
  });

  const value = {
    data: data || null,
    loading,
    error: error || null,
    lastUpdate: data?.lastUpdate || 0,
    refetch,
  };

  return (
    <RealtimeDataContext.Provider value={value}>
      {children}
    </RealtimeDataContext.Provider>
  );
}
