// app/components/EquitySparkline.tsx

'use client';

import React from 'react';
import dynamic from 'next/dynamic';

const EquitySparklineInner = dynamic(() => import('./EquitySparklineInner'), { ssr: false });

export default function EquitySparkline() {
  return <EquitySparklineInner />;
}
