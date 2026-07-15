'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AppLogo from '@/components/ui/AppLogo';
import {
  LayoutDashboard,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Bot,
  Shield,
  Activity,
  Settings,
  Bell,
  Circle,
  Zap,
  FileText,
} from 'lucide-react';
import Icon from '@/components/ui/AppIcon';

interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
  badgeVariant?: 'positive' | 'warning' | 'negative' | 'info';
}

interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    id: 'group-core',
    label: 'Operations',
    items: [
      {
        id: 'nav-dashboard',
        label: 'Live Dashboard',
        href: '/',
        icon: LayoutDashboard,
        badge: 'LIVE',
        badgeVariant: 'positive',
      },
      {
        id: 'nav-analytics',
        label: 'Performance',
        href: '/performance-analytics',
        icon: BarChart3,
      },
      {
        id: 'nav-trade-logs',
        label: 'Trade Logs',
        href: '/trade-logs',
        icon: FileText,
      },
    ],
  },
  {
    id: 'group-system',
    label: 'System',
    items: [
      {
        id: 'nav-bot',
        label: 'Bot Config',
        href: '/bot-config',
        icon: Bot,
      },
      {
        id: 'nav-risk',
        label: 'Risk Rules',
        href: '/risk-rules',
        icon: Shield,
        badge: '1',
        badgeVariant: 'warning',
      },
      {
        id: 'nav-signals',
        label: 'Signal Engine',
        href: '/signal-engine',
        icon: Zap,
      },
      {
        id: 'nav-alerts',
        label: 'Alerts',
        href: '/alerts',
        icon: Bell,
        badge: '3',
        badgeVariant: 'info',
      },
    ],
  },
  {
    id: 'group-admin',
    label: 'Admin',
    items: [
      {
        id: 'nav-settings',
        label: 'Settings',
        href: '/settings',
        icon: Settings,
      },
    ],
  },
];

const BADGE_CLASSES: Record<string, string> = {
  positive: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800',
  warning: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800',
  negative: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800',
  info: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800',
};

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const [unreadAlerts, setUnreadAlerts] = useState(0);

  // Listen for alert updates
  useEffect(() => {
    const handleAlertUpdate = (event: CustomEvent) => {
      const count = event.detail?.unreadCount || 0;
      setUnreadAlerts(count);
    };

    window.addEventListener('alerts-updated', handleAlertUpdate as EventListener);
    
    // Check localStorage for alert count
    const savedAlerts = localStorage.getItem('alerts');
    if (savedAlerts) {
      try {
        const alerts = JSON.parse(savedAlerts);
        const unread = alerts.filter((a: any) => !a.read).length;
        setUnreadAlerts(unread);
      } catch (e) {
        // Ignore
      }
    }

    return () => {
      window.removeEventListener('alerts-updated', handleAlertUpdate as EventListener);
    };
  }, []);

  // Update the alerts badge dynamically
  const navGroupsWithBadges = NAV_GROUPS.map(group => ({
    ...group,
    items: group.items.map(item => {
      if (item.id === 'nav-alerts' && unreadAlerts > 0) {
        return {
          ...item,
          badge: unreadAlerts.toString(),
          badgeVariant: unreadAlerts > 0 ? 'warning' : 'info',
        };
      }
      return item;
    }),
  }));

  return (
    <aside
      className={`
        relative flex flex-col h-full
        bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800
        transition-all duration-300 ease-in-out
        ${collapsed ? 'w-16' : 'w-60'}
      `}
    >
      {/* Logo */}
      <div
        className={`
          flex items-center border-b border-gray-200 dark:border-gray-800
          ${collapsed ? 'justify-center px-3 py-4' : 'px-4 py-4 gap-3'}
        `}
      >
        <AppLogo size={32} />
        {!collapsed && (
          <div className="flex flex-col min-w-0">
            <span className="text-gray-900 dark:text-white font-semibold text-sm leading-tight tracking-tight">
              SniperBot
            </span>
            <span className="text-gray-500 dark:text-gray-400 text-[10px] font-mono tracking-widest uppercase">
              v2.4.1
            </span>
          </div>
        )}
      </div>

      {/* Bot Status Pill */}
      {!collapsed && (
        <div className="mx-3 mt-3 mb-1 px-3 py-2 rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
          <span className="text-green-700 dark:text-green-400 text-xs font-semibold tracking-wide">
            BOT ACTIVE
          </span>
          <span className="ml-auto text-gray-500 dark:text-gray-400 text-[10px] font-mono">
            PAPER
          </span>
        </div>
      )}
      {collapsed && (
        <div className="flex justify-center mt-3 mb-1">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
        </div>
      )}

      {/* Nav Groups */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin px-2 py-2 space-y-4">
        {navGroupsWithBadges.map((group) => (
          <div key={group.id}>
            {!collapsed && (
              <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                {group.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive =
                  item.href === '/'
                    ? pathname === '/'
                    : pathname.startsWith(item.href) && item.href !== '#';

                return (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      className={`
                        group relative flex items-center rounded-md
                        transition-all duration-150
                        ${collapsed ? 'justify-center px-2 py-2.5' : 'px-2.5 py-2 gap-2.5'}
                        ${
                          isActive
                            ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
                        }
                      `}
                      title={collapsed ? item.label : undefined}
                    >
                      <Icon
                        size={18}
                        className={`shrink-0 ${isActive ? 'text-blue-600 dark:text-blue-400' : ''}`}
                      />
                      {!collapsed && (
                        <>
                          <span className="text-sm font-medium flex-1 truncate">
                            {item.label}
                          </span>
                          {item.badge && (
                            <span
                              className={`
                                text-[10px] font-semibold px-1.5 py-0.5 rounded-full
                                ${BADGE_CLASSES[item.badgeVariant ?? 'info']}
                              `}
                            >
                              {item.badge}
                            </span>
                          )}
                        </>
                      )}
                      {/* Tooltip for collapsed */}
                      {collapsed && (
                        <div className="absolute left-full ml-2 px-2 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md text-xs text-gray-900 dark:text-white whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50 shadow-lg">
                          {item.label}
                          {item.badge && (
                            <span className="ml-1.5 text-yellow-600 dark:text-yellow-400 font-semibold">
                              ({item.badge})
                            </span>
                          )}
                        </div>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Bottom: Collapse toggle + user */}
      <div className="border-t border-gray-200 dark:border-gray-800">
        {!collapsed && (
          <div className="px-3 py-3 flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 flex items-center justify-center shrink-0">
              <span className="text-blue-700 dark:text-blue-400 text-[10px] font-bold">KW</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">
                Kyle Weston
              </p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
                Trader · Paper Mode
              </p>
            </div>
            <Circle size={8} className="text-green-500 fill-green-500 shrink-0" />
          </div>
        )}
        <div
          className={`px-2 pb-3 ${collapsed ? 'flex justify-center pt-3' : ''}`}
        >
          <button
            onClick={onToggle}
            className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-150 text-xs"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <ChevronRight size={14} />
            ) : (
              <>
                <ChevronLeft size={14} />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}