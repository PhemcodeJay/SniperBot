'use client';

import React from 'react';
import dynamic from 'next/dynamic';

const RegimeAnalysisChartInner = dynamic(() => import('./RegimeAnalysisChartInner'), {
  ssr: false,
});

export default function RegimeAnalysisChart() {
  return <RegimeAnalysisChartInner />;
}
