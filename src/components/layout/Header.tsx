'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    LogOut,
    Settings,
    ChevronDown
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '@/contexts/AuthContext';

export default function Header() {
    const router = useRouter();
    const { user, logout } = useAuth();
    const [currentTime, setCurrentTime] = useState(new Date());

    React.useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    const handleLogout = () => {
        logout();
        router.push('/login');
    };

    const getRoleBadge = (role: string) => {
        const roles: Record<string, { label: string; class: string }> = {
            'admin': { label: 'Admin', class: 'bg-red-100 text-red-700' },
            'project_manager': { label: 'PM', class: 'bg-blue-100 text-blue-700' },
            'engineer': { label: 'Engineer', class: 'bg-green-100 text-green-700' },
            'viewer': { label: 'Viewer', class: 'bg-gray-100 text-gray-700' }
        };
        const config = roles[role] || roles['viewer'];
        return <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${config.class}`}>{config.label}</span>;
    };

    return (
        <header data-layout-header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between pl-16 lg:pl-6 pr-6">
            {/* Left Side: Empty or Breadcrumbs if needed later */}
            <div className="flex-1"></div>

            {/* Right Actions */}
            <div className="flex items-center gap-4">
                {/* Date & Time */}
                <div className="flex flex-col items-end mr-4">
                    <div className="text-sm font-medium text-gray-900 leading-none">
                        {currentTime.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                        {currentTime.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    </div>
                </div>

                <div className="h-8 w-px bg-gray-200 mx-1"></div>

                {/* User Info */}
                {user && (
                    <div className="flex items-center gap-3">
                        <div className="flex flex-col items-end">
                            <span className="text-sm font-medium text-gray-900 leading-none">{user.name}</span>
                            <div className="mt-1">
                                {getRoleBadge(user.role)}
                            </div>
                        </div>
                        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                            {user.name.charAt(0).toUpperCase()}
                        </div>
                    </div>
                )}

                {/* Direct Logout Button */}
                <button
                    onClick={handleLogout}
                    className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors ml-2"
                    title="ออกจากระบบ"
                >
                    <LogOut className="w-5 h-5" />
                </button>
            </div>
        </header>
    );
}
