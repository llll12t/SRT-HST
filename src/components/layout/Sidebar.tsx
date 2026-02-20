'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
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
    Users,
    Menu,
    X,
    DollarSign,
    Bell
} from 'lucide-react';
import clsx from 'clsx';
import { useSidebar } from '@/contexts/SidebarContext';

interface NavItem {
    name: string;
    nameTh: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
}

const navigation: NavItem[] = [
    { name: 'Dashboard', nameTh: 'ภาพรวม', href: '/', icon: LayoutDashboard },
    { name: 'Projects', nameTh: 'โครงการ', href: '/projects', icon: FolderKanban },
    { name: 'Tasks', nameTh: 'จัดการงาน', href: '/tasks', icon: ListTodo },
    { name: 'Procurement', nameTh: 'แจ้งเตือนจัดซื้อ', href: '/procurement', icon: BarChart3 },
    { name: 'Weekly Cost', nameTh: 'ต้นทุนรายสัปดาห์', href: '/weekly-cost', icon: DollarSign },
    { name: 'Employees', nameTh: 'พนักงาน', href: '/employees', icon: Users },
    { name: 'Reports', nameTh: 'รายงาน', href: '/reports', icon: FileSpreadsheet },
    { name: 'Convert CSV', nameTh: 'แปลงไฟล์ CSV', href: '/convert-csv', icon: CalendarDays },
    { name: 'Notifications', nameTh: 'ทดสอบแจ้งเตือน', href: '/notifications', icon: Bell },
    { name: 'Settings', nameTh: 'ตั้งค่า', href: '/settings', icon: Settings },
];

export default function Sidebar() {
    const pathname = usePathname();
    const { collapsed, toggleCollapsed } = useSidebar();
    const [mobileOpen, setMobileOpen] = useState(false);
    const [brandName, setBrandName] = useState('Powertec');
    const [brandLogoBase64, setBrandLogoBase64] = useState('');

    const activeHref = useMemo(() => {
        const matches = navigation
            .map((item) => {
                const isMatch = item.href === '/'
                    ? pathname === '/'
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);
                if (isMatch) return item.href;
                return null;
            })
            .filter((value): value is string => value !== null);

        if (matches.length === 0) return null;
        return matches.sort((a, b) => b.length - a.length)[0];
    }, [pathname]);

    useEffect(() => {
        const loadBranding = () => {
            try {
                const stored = localStorage.getItem('srt-hst-settings');
                if (!stored) {
                    setBrandName('Powertec');
                    setBrandLogoBase64('');
                    return;
                }

                const parsed = JSON.parse(stored) as {
                    company?: {
                        name?: string;
                        logoBase64?: string;
                    };
                };

                setBrandName(parsed.company?.name?.trim() || 'Powertec');
                setBrandLogoBase64(parsed.company?.logoBase64 || '');
            } catch {
                setBrandName('Powertec');
                setBrandLogoBase64('');
            }
        };

        const handleSettingsUpdate = () => loadBranding();
        loadBranding();
        window.addEventListener('storage', handleSettingsUpdate);
        window.addEventListener('srt-hst-settings-updated', handleSettingsUpdate);
        return () => {
            window.removeEventListener('storage', handleSettingsUpdate);
            window.removeEventListener('srt-hst-settings-updated', handleSettingsUpdate);
        };
    }, []);

    const navContent = (
        <div className="flex flex-col h-full">
            {/* Logo */}
            <div className="flex items-center gap-3 px-4 py-5 border-b border-gray-200">
                <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center overflow-hidden relative">
                    {brandLogoBase64 ? (
                        <Image
                            src={brandLogoBase64}
                            alt={brandName}
                            fill
                            unoptimized
                            sizes="36px"
                            className="object-cover"
                        />
                    ) : (
                        <Building2 className="w-5 h-5 text-white" />
                    )}
                </div>
                {!collapsed && (
                    <div>
                        <h3 className="text-gray-900 font-semibold text-base">{brandName}</h3>
                        <p className="text-gray-600 text-xs">Construction MS</p>
                    </div>
                )}
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-3 space-y-3 overflow-y-auto">
                {navigation.map((item) => {
                    const isActive = item.href === activeHref;
                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={clsx(
                                'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm',
                                isActive
                                    ? 'bg-blue-50 text-blue-700'
                                    : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
                            )}
                            onClick={() => setMobileOpen(false)}
                        >
                            <item.icon className={clsx(
                                'w-5 h-5 shrink-0',
                                isActive ? 'text-blue-600' : 'text-gray-500'
                            )} />

                            {!collapsed && (
                                <div className="flex flex-col">
                                    <span className="leading-none">{item.name}</span>
                                    <span className={clsx(
                                        "text-[10px] mt-0.5",
                                        isActive ? "text-blue-500" : "text-gray-400"
                                    )}>
                                        {item.nameTh}
                                    </span>
                                </div>
                            )}
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
                            <span>Collapse</span>
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
            <aside data-layout-sidebar className={clsx(
                'hidden lg:block fixed left-0 top-0 h-screen bg-white border-r border-gray-200 transition-all duration-200 z-40',
                collapsed ? 'w-16' : 'w-56'
            )}>
                {navContent}
            </aside>

            {/* Mobile Sidebar */}
            <aside data-layout-sidebar className={clsx(
                'lg:hidden fixed left-0 top-0 h-screen w-64 bg-white border-r border-gray-200 transition-transform duration-200 z-50',
                mobileOpen ? 'translate-x-0' : '-translate-x-full'
            )}>
                {navContent}
            </aside>
        </>
    );
}
