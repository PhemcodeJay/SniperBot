// app/RootLayoutClient.tsx
// Client-side root layout initialization

'use client';

import React, { useEffect } from 'react';
import { Toaster } from 'sonner';
import ErrorBoundary from '@/components/ErrorBoundary';
import { RealtimeDataProvider } from '@/components/RealtimeDataProvider';
import { pnlSync } from '@/lib/pnlSync';
import { autoExecutor } from '@/lib/autoExecutor';
import { logger } from '@/lib/logger';

export default function RootLayoutClient({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Initialize production systems
    logger.info('App', 'Initializing SniperBot (MAINNET)');

    // Start P&L synchronization
    pnlSync.start();

    // Start auto-execution engine
    if (process.env.NEXT_PUBLIC_AUTO_EXECUTE === 'true') {
      autoExecutor.start();
    }

    // Log initialization
    logger.info('App', 'SniperBot initialized successfully', {
      pnlSyncEnabled: true,
      autoExecuteEnabled: process.env.NEXT_PUBLIC_AUTO_EXECUTE === 'true',
      environment: 'MAINNET',
    });

    // Cleanup on unmount
    return () => {
      pnlSync.stop();
      autoExecutor.stop();
    };
  }, []);

  return (
    <ErrorBoundary>
      <RealtimeDataProvider pollInterval={2000}>
        {children}
        <Toaster
          position="bottom-right"
          theme="dark"
          toastOptions={{
            style: {
              background: 'var(--card)',
              border: '1px solid var(--border)',
              color: 'var(--foreground)',
            },
          }}
        />
      </RealtimeDataProvider>
    </ErrorBoundary>
  );
}
