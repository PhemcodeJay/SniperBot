'use client';

import React from 'react';
import dynamic from 'next/dynamic';

const TradeDistributionChartInner = dynamic(() => import('./TradeDistributionChartInner'), {
  ssr: false,
});

export default function TradeDistributionChart() {
  return <TradeDistributionChartInner />;
}
