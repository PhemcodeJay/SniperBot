// components/ErrorBoundary.tsx
// Global error boundary for production

'use client';

import React, { ReactNode, useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorState {
  hasError: boolean;
  error?: Error;
  errorCount: number;
}

export default function ErrorBoundary({ children }: ErrorBoundaryProps) {
  const [state, setState] = useState<ErrorState>({
    hasError: false,
    errorCount: 0,
  });

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      console.error('Global error:', event.error);
      setState(prev => ({
        hasError: true,
        error: event.error,
        errorCount: prev.errorCount + 1,
      }));
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('Unhandled promise rejection:', event.reason);
      setState(prev => ({
        hasError: true,
        error: new Error(String(event.reason)),
        errorCount: prev.errorCount + 1,
      }));
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  const handleReset = () => {
    setState({ hasError: false, errorCount: 0 });
  };

  const handleReload = () => {
    window.location.reload();
  };

  if (state.hasError && state.errorCount > 2) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-gray-950">
        <div className="max-w-md w-full mx-4 p-6 bg-gray-900 border border-red-500 rounded-lg">
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className="w-6 h-6 text-red-500" />
            <h1 className="text-lg font-bold text-white">Critical Error</h1>
          </div>

          <p className="text-gray-300 text-sm mb-4">
            The application has encountered multiple errors and needs to be restarted.
          </p>

          <div className="bg-gray-800 p-3 rounded border border-gray-700 mb-4">
            <p className="text-xs text-gray-400 font-mono break-all">
              {state.error?.message || 'Unknown error'}
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleReload}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-medium transition"
            >
              <RefreshCw className="w-4 h-4" />
              Reload Page
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (state.hasError) {
    return (
      <div className="w-full min-h-screen flex items-center justify-center bg-gray-950 p-4">
        <div className="max-w-md w-full p-6 bg-gray-900 border border-yellow-600 rounded-lg">
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className="w-6 h-6 text-yellow-600" />
            <h2 className="text-lg font-bold text-white">Something Went Wrong</h2>
          </div>

          <p className="text-gray-300 text-sm mb-4">
            An unexpected error occurred. Please try to recover or reload the page.
          </p>

          <div className="bg-gray-800 p-3 rounded border border-gray-700 mb-4 max-h-32 overflow-y-auto">
            <p className="text-xs text-gray-400 font-mono">
              {state.error?.message || 'Unknown error'}
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleReset}
              className="flex-1 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded font-medium transition"
            >
              Try Again
            </button>
            <button
              onClick={handleReload}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded font-medium transition"
            >
              <RefreshCw className="w-4 h-4" />
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }

  return children;
}
