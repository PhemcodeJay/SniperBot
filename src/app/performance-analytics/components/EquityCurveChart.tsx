'use client';

import React from 'react';
import dynamic from 'next/dynamic';

const EquityCurveChartInner = dynamic(() => import('./EquityCurveChartInner'), { ssr: false });

export default function EquityCurveChart() {
  return <EquityCurveChartInner />;
}
