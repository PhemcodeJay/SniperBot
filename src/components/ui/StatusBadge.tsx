import React from 'react';

type BadgeVariant =
  | 'active'
  | 'pending'
  | 'confirmed'
  | 'executed'
  | 'tp1_hit'
  | 'tp2_hit'
  | 'sl_hit'
  | 'expired'
  | 'long'
  | 'short'
  | 'paper'
  | 'live'
  | 'trending'
  | 'ranging'
  | 'volatile'
  | 'warning'
  | 'error'
  | 'info';

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  active: 'bg-positive-subtle text-positive border-positive/20',
  pending: 'bg-info-subtle text-info border-info/20',
  confirmed: 'bg-positive-subtle text-positive border-positive/20',
  executed: 'bg-positive-subtle text-positive border-positive/20',
  tp1_hit: 'bg-positive-subtle text-positive border-positive/20',
  tp2_hit: 'bg-positive-subtle text-positive border-positive/20',
  sl_hit: 'bg-negative-subtle text-negative border-negative/20',
  expired: 'bg-muted text-muted-foreground border-border',
  long: 'bg-positive-subtle text-positive border-positive/20',
  short: 'bg-negative-subtle text-negative border-negative/20',
  paper: 'bg-info-subtle text-info border-info/20',
  live: 'bg-positive-subtle text-positive border-positive/20',
  trending: 'bg-positive-subtle text-positive border-positive/20',
  ranging: 'bg-warning-subtle text-warning border-warning/20',
  volatile: 'bg-negative-subtle text-negative border-negative/20',
  warning: 'bg-warning-subtle text-warning border-warning/20',
  error: 'bg-negative-subtle text-negative border-negative/20',
  info: 'bg-info-subtle text-info border-info/20',
};

const VARIANT_LABELS: Record<BadgeVariant, string> = {
  active: 'Active',
  pending: 'Pending',
  confirmed: 'Confirmed',
  executed: 'Executed',
  tp1_hit: 'TP1 Hit',
  tp2_hit: 'TP2 Hit',
  sl_hit: 'SL Hit',
  expired: 'Expired',
  long: 'LONG',
  short: 'SHORT',
  paper: 'PAPER',
  live: 'LIVE',
  trending: 'Trending',
  ranging: 'Ranging',
  volatile: 'Volatile',
  warning: 'Warning',
  error: 'Error',
  info: 'Info',
};

interface StatusBadgeProps {
  variant: BadgeVariant;
  label?: string;
  size?: 'sm' | 'md';
  dot?: boolean;
}

export default function StatusBadge({
  variant,
  label,
  size = 'sm',
  dot = false,
}: StatusBadgeProps) {
  const displayLabel = label ?? VARIANT_LABELS[variant];
  const classes = VARIANT_CLASSES[variant];

  return (
    <span
      className={`
        inline-flex items-center gap-1 border rounded-full font-semibold tracking-wide
        ${size === 'sm' ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1'}
        ${classes}
      `}
    >
      {dot && (
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            variant === 'active' ||
            variant === 'long' ||
            variant === 'executed' ||
            variant === 'tp1_hit' ||
            variant === 'tp2_hit'
              ? 'bg-positive'
              : variant === 'sl_hit' ||
                  variant === 'short' ||
                  variant === 'volatile' ||
                  variant === 'error'
                ? 'bg-negative'
                : variant === 'warning' || variant === 'ranging'
                  ? 'bg-warning'
                  : 'bg-info'
          }`}
        />
      )}
      {displayLabel}
    </span>
  );
}
