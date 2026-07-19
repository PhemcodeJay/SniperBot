'use client';

import React from 'react';
import dynamic from 'next/dynamic';

const DrawdownChartInner = dynamic(() => import('./DrawdownChartInner'), { ssr: false });

export default function DrawdownChart() {
  return <DrawdownChartInner />;
}
