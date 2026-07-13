import React from 'react';
import {
  TrendingUp,
  TrendingDown,
  BarChart2,
  Clock,
  Percent,
  Activity,
} from 'lucide-react';
import Icon from '@/components/ui/AppIcon';


const SUMMARY_CARDS = [
  {
    id: 'kpi-pf',
    title: 'Profit Factor',
    value: '2.74',
    subValue: 'Gross Profit $1,847 / Loss $674',
    change: '+0.31 vs last week',
    positive: true,
    icon: TrendingUp,
    variant: 'positive' as const,
  },
  {
    id: 'kpi-sharpe',
    title: 'Sharpe Ratio (30d)',
    value: '2.34',
    subValue: 'Sortino: 3.12 · Calmar: 4.18',
    change: 'Target: > 2.0',
    positive: true,
    icon: Activity,
    variant: 'positive' as const,
  },
  {
    id: 'kpi-maxdd',
    title: 'Max Drawdown',
    value: '-3.8%',
    subValue: 'Peak $25,140 → Trough $24,186',
    change: 'Limit: 15%',
    positive: true,
    icon: TrendingDown,
    variant: 'default' as const,
  },
  {
    id: 'kpi-winrate',
    title: 'Overall Win Rate',
    value: '72.3%',
    subValue: '34 wins · 13 losses · 47 total',
    change: '+2.3% vs target',
    positive: true,
    icon: Percent,
    variant: 'positive' as const,
  },
  {
    id: 'kpi-hold',
    title: 'Avg Hold Time',
    value: '38.4m',
    subValue: 'Min 12m · Max 118m · Target 15-60m',
    change: 'Within target',
    positive: true,
    icon: Clock,
    variant: 'positive' as const,
  },
  {
    id: 'kpi-slip',
    title: 'Avg Slippage',
    value: '0.031%',
    subValue: 'Paper sim · Target < 0.05%',
    change: 'Under limit ✓',
    positive: true,
    icon: BarChart2,
    variant: 'positive' as const,
  },
];

type CardVariant = 'positive' | 'negative' | 'warning' | 'default';

const VARIANT_BORDER: Record<CardVariant, string> = {
  positive: 'border-positive/20',
  negative: 'border-negative/20',
  warning: 'border-warning/20',
  default: 'border-border',
};

const VARIANT_ICON: Record<CardVariant, string> = {
  positive: 'bg-positive-subtle text-positive',
  negative: 'bg-negative-subtle text-negative',
  warning: 'bg-warning-subtle text-warning',
  default: 'bg-muted text-muted-foreground',
};

export default function AnalyticsSummaryCards() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 2xl:grid-cols-6 gap-4 mb-6">
      {SUMMARY_CARDS.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.id}
            className={`card-surface p-4 hover:border-primary/20 transition-colors duration-200 ${VARIANT_BORDER[card.variant]}`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground leading-tight">
                {card.title}
              </span>
              <div className={`w-7 h-7 rounded-md flex items-center justify-center ${VARIANT_ICON[card.variant]}`}>
                <Icon size={13} />
              </div>
            </div>
            <p className="text-xl font-bold font-tabular text-foreground leading-none mb-1">
              {card.value}
            </p>
            <p className="text-[10px] text-muted-foreground leading-tight mb-1.5">
              {card.subValue}
            </p>
            <p className={`text-[10px] font-semibold ${card.positive ? 'text-positive' : 'text-negative'}`}>
              {card.change}
            </p>
          </div>
        );
      })}
    </div>
  );
}