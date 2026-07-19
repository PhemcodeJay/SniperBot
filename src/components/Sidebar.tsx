// components/Sidebar.tsx
'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSharedRealtimeData } from '@/lib/realtimeDataContext';
import { formatUsd } from '@/lib/formatters';
import {
  LayoutDashboard,
  BarChart3,
  FileText,
  Zap,
  Shield,
  Bell,
  Settings,
  ChevronLeft,
  ChevronRight,
  Bot,
  Wallet,
} from 'lucide-react';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
  { path: '/performance-analytics', label: 'Analytics', icon: <BarChart3 size={18} /> },
  { path: '/trade-logs', label: 'Trade Logs', icon: <FileText size={18} /> },
  { path: '/signal-engine', label: 'Signal Engine', icon: <Zap size={18} /> },
  { path: '/risk-rules', label: 'Risk Rules', icon: <Shield size={18} /> },
  { path: '/alerts', label: 'Alerts', icon: <Bell size={18} /> },
  { path: '/settings', label: 'Settings', icon: <Settings size={18} /> },
];

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const { data: realtimeData } = useSharedRealtimeData();
  const balanceLabel = formatUsd(
    realtimeData?.balance?.totalEquity ?? realtimeData?.balance?.availableBalance ?? 0,
    '$0.00',
    true
  );

  return (
    <div
      className={`h-full bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col transition-all duration-300 shrink-0 ${
        collapsed ? 'w-16' : 'w-56'
      }`}
    >
      {/* Logo */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200 dark:border-gray-800 shrink-0">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-blue-600">
              <Bot size={16} className="text-white" />
            </div>
            <span className="text-sm font-bold text-gray-900 dark:text-white">SniperBot</span>
          </div>
        )}
        {collapsed && (
          <div className="mx-auto p-1.5 rounded-lg bg-blue-600">
            <Bot size={16} className="text-white" />
          </div>
        )}
        <button
          onClick={onToggle}
          className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.path;
          return (
            <Link
              key={item.path}
              href={item.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
                isActive
                  ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
              } ${collapsed ? 'justify-center' : ''}`}
              title={collapsed ? item.label : undefined}
            >
              <span className="shrink-0">{item.icon}</span>
              {!collapsed && <span className="text-sm font-medium truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Bottom Section */}
      <div className="p-2 border-t border-gray-200 dark:border-gray-800 shrink-0">
        {!collapsed && (
          <div className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800/50">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs text-gray-500 dark:text-gray-400">Live</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Wallet size={12} className="text-gray-400" />
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                {balanceLabel}
              </span>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="flex flex-col items-center gap-2 py-2">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <Wallet size={14} className="text-gray-400" />
          </div>
        )}
      </div>
    </div>
  );
}
