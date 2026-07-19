'use client';

import React from 'react';
import dynamic from 'next/dynamic';

const ConfidenceWinRateChartInner = dynamic(() => import('./ConfidenceWinRateChartInner'), {
  ssr: false,
});

export default function ConfidenceWinRateChart() {
  return <ConfidenceWinRateChartInner />;
}
