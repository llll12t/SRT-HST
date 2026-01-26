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
    const [userMenuOpen, setUserMenuOpen] = useState(false);

    const handleLogout = () => {
        logout();
        router.push('/login');
    };

    const getRoleBadge = (role: string) => {
        const roles: Record<string, { label: string; class: string }> = {
            'admin': { label: 'Admin', class: 'bg-red-100 text-red-700' },
            'project_manager': { label: 'Project Manager', class: 'bg-blue-100 text-blue-700' },
            'engineer': { label: 'Engineer', class: 'bg-green-100 text-green-700' },
            'viewer': { label: 'Viewer', class: 'bg-gray-100 text-gray-700' }
        };
        const config = roles[role] || roles['viewer'];
        return <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${config.class}`}>{config.label}</span>;
    };

    return (
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-end pl-16 lg:pl-6 pr-6 sticky top-0 z-30">
            {/* Right Actions */}
            <div className="flex items-center gap-2">
                {/* User Profile Dropdown */}
                {user && (
                    <div className="relative">
                        <button
                            onClick={() => setUserMenuOpen(!userMenuOpen)}
                            className="flex items-center gap-2 p-1.5 pr-3 rounded-lg hover:bg-gray-100 transition-colors"
                        >
                            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                                {user.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="hidden sm:block text-left">
                                <p className="text-gray-900 text-sm font-medium leading-tight">{user.name}</p>
                            </div>
                            <ChevronDown className={clsx(
                                'w-4 h-4 text-gray-400 transition-transform hidden sm:block',
                                userMenuOpen && 'rotate-180'
                            )} />
                        </button>

                        {/* Dropdown Menu */}
                        {userMenuOpen && (
                            <>
                                <div
                                    className="fixed inset-0 z-40"
                                    onClick={() => setUserMenuOpen(false)}
                                />
                                <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-gray-200 py-2 z-50">
                                    {/* User Info */}
                                    <div className="px-4 py-3 border-b border-gray-100">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold">
                                                {user.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
                                                <p className="text-xs text-gray-500 truncate">{user.email}</p>
                                            </div>
                                        </div>
                                        <div className="mt-2">
                                            {getRoleBadge(user.role)}
                                        </div>
                                    </div>

                                    {/* Menu Items */}
                                    <div className="py-1">
                                        <Link
                                            href="/settings"
                                            onClick={() => setUserMenuOpen(false)}
                                            className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                                        >
                                            <Settings className="w-4 h-4 text-gray-400" />
                                            ตั้งค่า
                                        </Link>
                                    </div>

                                    {/* Logout */}
                                    <div className="border-t border-gray-100 pt-1">
                                        <button
                                            onClick={handleLogout}
                                            className="flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 w-full text-left"
                                        >
                                            <LogOut className="w-4 h-4" />
                                            ออกจากระบบ
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
        </header>
    );
}
