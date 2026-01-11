'use client';

import React from 'react';
import { Bell, Search, User } from 'lucide-react';

export default function Header() {
    return (
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 sticky top-0 z-30">
            {/* Search Bar */}
            <div className="flex-1 max-w-md">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="ค้นหา..."
                        className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:bg-white focus:border-blue-500 transition-colors"
                    />
                </div>
            </div>

            {/* Right Actions */}
            <div className="flex items-center gap-1 ml-4">
                {/* Notifications */}
                <button className="relative p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors">
                    <Bell className="w-5 h-5" />
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
                </button>

                {/* User Profile */}
                <button className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-gray-100 transition-colors ml-1">
                    <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
                        <User className="w-4 h-4" />
                    </div>
                    <div className="hidden sm:block text-left">
                        <p className="text-gray-900 text-sm font-medium">Admin</p>
                    </div>
                </button>
            </div>
        </header>
    );
}
