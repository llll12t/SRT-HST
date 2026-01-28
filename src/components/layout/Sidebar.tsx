'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    LayoutDashboard,
    ListTodo,
    BarChart3,
    CalendarDays,
    Settings,
    FolderKanban,
    FileSpreadsheet,
    ChevronLeft,
    ChevronRight,
    Building2,
    Menu,
    X
} from 'lucide-react';
import clsx from 'clsx';
import { useSidebar } from '@/contexts/SidebarContext';

interface NavItem {
    name: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
}

const navigation: NavItem[] = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'โครงการ', href: '/projects', icon: FolderKanban },
    { name: 'รายการงาน', href: '/tasks', icon: ListTodo },
    { name: 'Gantt Chart', href: '/gantt', icon: CalendarDays },
    { name: 'S-Curve', href: '/scurve', icon: BarChart3 },
    { name: 'รายงาน', href: '/reports', icon: FileSpreadsheet },
    { name: 'ตั้งค่า', href: '/settings', icon: Settings },
];

export default function Sidebar() {
    const pathname = usePathname();
    const { collapsed, toggleCollapsed } = useSidebar();
    const [mobileOpen, setMobileOpen] = useState(false);

    const NavContent = () => (
        <div className="flex flex-col h-full">
            {/* Logo */}
            <div className="flex items-center gap-3 px-4 py-5 border-b border-gray-200">
                <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-white" />
                </div>
                {!collapsed && (
                    <div>
                        <h1 className="text-gray-900 font-semibold text-base">SRT-HST</h1>
                        <p className="text-gray-600 text-xs">Construction MS</p>
                    </div>
                )}
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-3 space-y-3 overflow-y-auto">
                {navigation.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={clsx(
                                'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium',
                                isActive
                                    ? 'bg-blue-50 text-blue-700'
                                    : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
                            )}
                            onClick={() => setMobileOpen(false)}
                        >
                            <item.icon className={clsx(
                                'w-5 h-5',
                                isActive ? 'text-blue-600' : 'text-gray-500'
                            )} />

                            {!collapsed && <span>{item.name}</span>}
                        </Link>
                    );
                })}
            </nav>

            {/* Collapse Button */}
            <div className="p-3 border-t border-gray-200 hidden lg:block">
                <button
                    onClick={toggleCollapsed}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-gray-600 hover:text-gray-800 hover:bg-gray-100 transition-colors text-sm"
                >
                    {collapsed ? (
                        <ChevronRight className="w-4 h-4" />
                    ) : (
                        <>
                            <ChevronLeft className="w-4 h-4" />
                            <span>ย่อเมนู</span>
                        </>
                    )}
                </button>
            </div>
        </div>
    );

    return (
        <>
            {/* Mobile Menu Button */}
            <button
                onClick={() => setMobileOpen(!mobileOpen)}
                className="lg:hidden fixed top-3 left-4 z-50 p-2 rounded-lg bg-white border border-gray-200 text-gray-700 shadow-sm"
            >
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            {/* Mobile Overlay */}
            {mobileOpen && (
                <div
                    className="lg:hidden fixed inset-0 bg-black/20 z-40"
                    onClick={() => setMobileOpen(false)}
                />
            )}

            {/* Desktop Sidebar */}
            <aside className={clsx(
                'hidden lg:block fixed left-0 top-0 h-screen bg-white border-r border-gray-200 transition-all duration-200 z-40',
                collapsed ? 'w-16' : 'w-56'
            )}>
                <NavContent />
            </aside>

            {/* Mobile Sidebar */}
            <aside className={clsx(
                'lg:hidden fixed left-0 top-0 h-screen w-64 bg-white border-r border-gray-200 transition-transform duration-200 z-50',
                mobileOpen ? 'translate-x-0' : '-translate-x-full'
            )}>
                <NavContent />
            </aside>
        </>
    );
}
