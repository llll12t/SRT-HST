'use client';

import React, { useState, useEffect } from 'react';
import {
    Settings,
    User,
    Bell,
    Shield,
    Database,
    Palette,
    Globe,
    Mail,
    Smartphone,
    Key,
    Users,
    Save,
    Camera,
    Check,
    Loader2,
    Upload,
    Download,
    Trash2
} from 'lucide-react';
import { getProjects, getAllTasks, seedSampleData } from '@/lib/firestore';

type TabType = 'profile' | 'notifications' | 'appearance' | 'security' | 'system';

interface UserSettings {
    profile: {
        name: string;
        username: string;
        email: string;
        phone: string;
        position: string;
        department: string;
    };
    notifications: {
        email: boolean;
        push: boolean;
        sms: boolean;
        taskDelay: boolean;
        progressUpdate: boolean;
        newComment: boolean;
        reportComplete: boolean;
        deadline: boolean;
    };
    appearance: {
        theme: 'light' | 'dark' | 'system';
        language: 'th' | 'en';
        dateFormat: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
    };
    company: {
        name: string;
        taxId: string;
    };
}

const defaultSettings: UserSettings = {
    profile: {
        name: 'Admin User',
        username: 'admin',
        email: 'admin@company.com',
        phone: '081-234-5678',
        position: 'Project Manager',
        department: 'Construction'
    },
    notifications: {
        email: true,
        push: true,
        sms: false,
        taskDelay: true,
        progressUpdate: true,
        newComment: true,
        reportComplete: false,
        deadline: true
    },
    appearance: {
        theme: 'light',
        language: 'th',
        dateFormat: 'DD/MM/YYYY'
    },
    company: {
        name: 'SRT-HST Construction Co., Ltd.',
        taxId: '0105562012345'
    }
};

export default function SettingsPage() {
    const [activeTab, setActiveTab] = useState<TabType>('profile');
    const [settings, setSettings] = useState<UserSettings>(defaultSettings);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({ projects: 0, tasks: 0 });
    const [seeding, setSeeding] = useState(false);

    // Load settings from localStorage
    useEffect(() => {
        const savedSettings = localStorage.getItem('srt-hst-settings');
        if (savedSettings) {
            setSettings(JSON.parse(savedSettings));
        }
        fetchStats();
        setLoading(false);
    }, []);

    const fetchStats = async () => {
        try {
            const [projects, tasks] = await Promise.all([
                getProjects(),
                getAllTasks()
            ]);
            setStats({ projects: projects.length, tasks: tasks.length });
        } catch (error) {
            console.error('Error fetching stats:', error);
        }
    };

    const handleSave = async () => {
        setSaving(true);

        // Save to localStorage
        localStorage.setItem('srt-hst-settings', JSON.stringify(settings));

        await new Promise(resolve => setTimeout(resolve, 500));

        setSaving(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    const updateProfile = (field: keyof UserSettings['profile'], value: string) => {
        setSettings(prev => ({
            ...prev,
            profile: { ...prev.profile, [field]: value }
        }));
    };

    const updateNotification = (field: keyof UserSettings['notifications'], value: boolean) => {
        setSettings(prev => ({
            ...prev,
            notifications: { ...prev.notifications, [field]: value }
        }));
    };

    const updateAppearance = (field: keyof UserSettings['appearance'], value: string) => {
        setSettings(prev => ({
            ...prev,
            appearance: { ...prev.appearance, [field]: value }
        }));
    };

    const updateCompany = (field: keyof UserSettings['company'], value: string) => {
        setSettings(prev => ({
            ...prev,
            company: { ...prev.company, [field]: value }
        }));
    };

    const handleSeedData = async () => {
        if (!confirm('ต้องการเพิ่มข้อมูลตัวอย่างหรือไม่? (จะไม่เพิ่มซ้ำถ้ามีข้อมูลอยู่แล้ว)')) return;

        setSeeding(true);
        try {
            await seedSampleData();
            await fetchStats();
            alert('เพิ่มข้อมูลตัวอย่างเรียบร้อย');
        } catch (error) {
            console.error('Error seeding data:', error);
            alert('เกิดข้อผิดพลาด');
        } finally {
            setSeeding(false);
        }
    };

    const tabs = [
        { id: 'profile', label: 'โปรไฟล์', icon: User },
        { id: 'notifications', label: 'การแจ้งเตือน', icon: Bell },
        { id: 'appearance', label: 'รูปแบบ', icon: Palette },
        { id: 'security', label: 'ความปลอดภัย', icon: Shield },
        { id: 'system', label: 'ระบบ', icon: Database },
    ];

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
                        <Settings className="w-6 h-6 text-blue-600" />
                        ตั้งค่า
                    </h1>
                    <p className="text-gray-500 text-sm mt-0.5">จัดการการตั้งค่าระบบและบัญชีผู้ใช้</p>
                </div>

                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                    {saving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : saved ? (
                        <Check className="w-4 h-4" />
                    ) : (
                        <Save className="w-4 h-4" />
                    )}
                    {saved ? 'บันทึกแล้ว!' : 'บันทึกการเปลี่ยนแปลง'}
                </button>
            </div>

            <div className="flex flex-col lg:flex-row gap-6">
                {/* Tabs Sidebar */}
                <div className="lg:w-56 flex-shrink-0">
                    <div className="bg-white rounded-lg border border-gray-200 p-2">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as TabType)}
                                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.id
                                        ? 'bg-blue-50 text-blue-700'
                                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                                    }`}
                            >
                                <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'text-blue-600' : 'text-gray-400'}`} />
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1">
                    {/* Profile Tab */}
                    {activeTab === 'profile' && (
                        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900">ข้อมูลโปรไฟล์</h2>
                                <p className="text-gray-500 text-sm mt-0.5">จัดการข้อมูลส่วนตัวและบัญชีผู้ใช้</p>
                            </div>

                            {/* Avatar */}
                            <div className="flex items-center gap-4">
                                <div className="w-20 h-20 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-2xl font-semibold">
                                    {settings.profile.name.charAt(0)}
                                </div>
                                <div>
                                    <button className="px-3 py-1.5 text-sm font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 flex items-center gap-1.5">
                                        <Camera className="w-4 h-4" />
                                        เปลี่ยนรูปภาพ
                                    </button>
                                    <p className="text-xs text-gray-400 mt-1">JPG, PNG ขนาดไม่เกิน 2MB</p>
                                </div>
                            </div>

                            {/* Form */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">ชื่อ-นามสกุล</label>
                                    <input
                                        type="text"
                                        value={settings.profile.name}
                                        onChange={(e) => updateProfile('name', e.target.value)}
                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:border-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">ชื่อผู้ใช้</label>
                                    <input
                                        type="text"
                                        value={settings.profile.username}
                                        onChange={(e) => updateProfile('username', e.target.value)}
                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:border-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">อีเมล</label>
                                    <input
                                        type="email"
                                        value={settings.profile.email}
                                        onChange={(e) => updateProfile('email', e.target.value)}
                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:border-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">เบอร์โทรศัพท์</label>
                                    <input
                                        type="tel"
                                        value={settings.profile.phone}
                                        onChange={(e) => updateProfile('phone', e.target.value)}
                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:border-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">ตำแหน่ง</label>
                                    <input
                                        type="text"
                                        value={settings.profile.position}
                                        onChange={(e) => updateProfile('position', e.target.value)}
                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:border-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">แผนก</label>
                                    <select
                                        value={settings.profile.department}
                                        onChange={(e) => updateProfile('department', e.target.value)}
                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:border-blue-500"
                                    >
                                        <option>Construction</option>
                                        <option>Engineering</option>
                                        <option>Management</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Notifications Tab */}
                    {activeTab === 'notifications' && (
                        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900">การแจ้งเตือน</h2>
                                <p className="text-gray-500 text-sm mt-0.5">ตั้งค่าการรับการแจ้งเตือนต่างๆ</p>
                            </div>

                            <div className="space-y-4">
                                {[
                                    { id: 'email', label: 'แจ้งเตือนทางอีเมล', desc: 'รับการแจ้งเตือนผ่านอีเมลที่ลงทะเบียน', icon: Mail, key: 'email' as const },
                                    { id: 'push', label: 'Push Notifications', desc: 'รับการแจ้งเตือนบน Browser', icon: Bell, key: 'push' as const },
                                    { id: 'sms', label: 'แจ้งเตือนทาง SMS', desc: 'รับ SMS สำหรับเรื่องสำคัญ', icon: Smartphone, key: 'sms' as const },
                                ].map((item) => (
                                    <div key={item.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-white rounded-lg border border-gray-200">
                                                <item.icon className="w-4 h-4 text-gray-600" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-gray-900">{item.label}</p>
                                                <p className="text-xs text-gray-500">{item.desc}</p>
                                            </div>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                className="sr-only peer"
                                                checked={settings.notifications[item.key]}
                                                onChange={(e) => updateNotification(item.key, e.target.checked)}
                                            />
                                            <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                                        </label>
                                    </div>
                                ))}
                            </div>

                            <div className="pt-4 border-t border-gray-200">
                                <h3 className="font-medium text-gray-900 mb-3">ประเภทการแจ้งเตือน</h3>
                                <div className="space-y-3">
                                    {[
                                        { label: 'งานล่าช้า', key: 'taskDelay' as const },
                                        { label: 'อัปเดตความคืบหน้า', key: 'progressUpdate' as const },
                                        { label: 'ความคิดเห็นใหม่', key: 'newComment' as const },
                                        { label: 'รายงานสำเร็จ', key: 'reportComplete' as const },
                                        { label: 'เตือนก่อนครบกำหนด', key: 'deadline' as const },
                                    ].map((item) => (
                                        <label key={item.key} className="flex items-center gap-3 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={settings.notifications[item.key]}
                                                onChange={(e) => updateNotification(item.key, e.target.checked)}
                                                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                                            />
                                            <span className="text-sm text-gray-700">{item.label}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Appearance Tab */}
                    {activeTab === 'appearance' && (
                        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900">รูปแบบการแสดงผล</h2>
                                <p className="text-gray-500 text-sm mt-0.5">ปรับแต่งรูปแบบและธีมของระบบ</p>
                            </div>

                            {/* Theme */}
                            <div>
                                <h3 className="font-medium text-gray-900 mb-3">ธีม</h3>
                                <div className="grid grid-cols-3 gap-3">
                                    {[
                                        { id: 'light', label: 'สว่าง' },
                                        { id: 'dark', label: 'มืด' },
                                        { id: 'system', label: 'ตามระบบ' },
                                    ].map((theme) => (
                                        <button
                                            key={theme.id}
                                            onClick={() => updateAppearance('theme', theme.id as any)}
                                            className={`p-4 rounded-lg border-2 transition-all ${settings.appearance.theme === theme.id
                                                    ? 'border-blue-500 bg-blue-50'
                                                    : 'border-gray-200 hover:border-gray-300'
                                                }`}
                                        >
                                            <div className={`w-full h-12 rounded mb-2 ${theme.id === 'light' ? 'bg-gray-100' :
                                                    theme.id === 'dark' ? 'bg-gray-800' :
                                                        'bg-gradient-to-r from-gray-100 to-gray-800'
                                                }`} />
                                            <p className={`text-sm font-medium ${settings.appearance.theme === theme.id ? 'text-blue-700' : 'text-gray-700'}`}>
                                                {theme.label}
                                            </p>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Language */}
                            <div>
                                <h3 className="font-medium text-gray-900 mb-3">ภาษา</h3>
                                <div className="flex items-center gap-2">
                                    <Globe className="w-4 h-4 text-gray-400" />
                                    <select
                                        value={settings.appearance.language}
                                        onChange={(e) => updateAppearance('language', e.target.value)}
                                        className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:border-blue-500"
                                    >
                                        <option value="th">ไทย (Thai)</option>
                                        <option value="en">English</option>
                                    </select>
                                </div>
                            </div>

                            {/* Date Format */}
                            <div>
                                <h3 className="font-medium text-gray-900 mb-3">รูปแบบวันที่</h3>
                                <select
                                    value={settings.appearance.dateFormat}
                                    onChange={(e) => updateAppearance('dateFormat', e.target.value)}
                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:border-blue-500"
                                >
                                    <option value="DD/MM/YYYY">DD/MM/YYYY (11/01/2025)</option>
                                    <option value="MM/DD/YYYY">MM/DD/YYYY (01/11/2025)</option>
                                    <option value="YYYY-MM-DD">YYYY-MM-DD (2025-01-11)</option>
                                </select>
                            </div>
                        </div>
                    )}

                    {/* Security Tab */}
                    {activeTab === 'security' && (
                        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900">ความปลอดภัย</h2>
                                <p className="text-gray-500 text-sm mt-0.5">จัดการรหัสผ่านและการรักษาความปลอดภัย</p>
                            </div>

                            {/* Change Password */}
                            <div className="space-y-4">
                                <h3 className="font-medium text-gray-900">เปลี่ยนรหัสผ่าน</h3>
                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">รหัสผ่านปัจจุบัน</label>
                                        <input
                                            type="password"
                                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:border-blue-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">รหัสผ่านใหม่</label>
                                        <input
                                            type="password"
                                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:border-blue-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">ยืนยันรหัสผ่านใหม่</label>
                                        <input
                                            type="password"
                                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:border-blue-500"
                                        />
                                    </div>
                                    <button className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
                                        อัปเดตรหัสผ่าน
                                    </button>
                                </div>
                            </div>

                            {/* Two Factor */}
                            <div className="pt-4 border-t border-gray-200">
                                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-white rounded-lg border border-gray-200">
                                            <Key className="w-4 h-4 text-gray-600" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-gray-900">Two-Factor Authentication</p>
                                            <p className="text-xs text-gray-500">เพิ่มความปลอดภัยด้วยการยืนยันตัวตน 2 ชั้น</p>
                                        </div>
                                    </div>
                                    <button className="px-3 py-1.5 text-sm font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50">
                                        เปิดใช้งาน
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* System Tab */}
                    {activeTab === 'system' && (
                        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900">ตั้งค่าระบบ</h2>
                                <p className="text-gray-500 text-sm mt-0.5">ข้อมูลและการตั้งค่าทั่วไปของระบบ</p>
                            </div>

                            {/* Company Info */}
                            <div className="space-y-4">
                                <h3 className="font-medium text-gray-900">ข้อมูลองค์กร</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">ชื่อบริษัท</label>
                                        <input
                                            type="text"
                                            value={settings.company.name}
                                            onChange={(e) => updateCompany('name', e.target.value)}
                                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:border-blue-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">เลขประจำตัวผู้เสียภาษี</label>
                                        <input
                                            type="text"
                                            value={settings.company.taxId}
                                            onChange={(e) => updateCompany('taxId', e.target.value)}
                                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:border-blue-500"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Data Management */}
                            <div className="pt-4 border-t border-gray-200">
                                <h3 className="font-medium text-gray-900 mb-3">จัดการข้อมูล</h3>
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                        <div>
                                            <p className="text-sm font-medium text-gray-900">เพิ่มข้อมูลตัวอย่าง</p>
                                            <p className="text-xs text-gray-500">เพิ่มโครงการและงานตัวอย่างสำหรับทดสอบ</p>
                                        </div>
                                        <button
                                            onClick={handleSeedData}
                                            disabled={seeding}
                                            className="px-3 py-1.5 text-sm font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 disabled:opacity-50 flex items-center gap-1.5"
                                        >
                                            {seeding && <Loader2 className="w-3 h-3 animate-spin" />}
                                            เพิ่มข้อมูล
                                        </button>
                                    </div>

                                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                        <div>
                                            <p className="text-sm font-medium text-gray-900">Export ข้อมูล</p>
                                            <p className="text-xs text-gray-500">ส่งออกข้อมูลทั้งหมดเป็นไฟล์ JSON</p>
                                        </div>
                                        <button className="px-3 py-1.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 flex items-center gap-1.5">
                                            <Download className="w-3 h-3" />
                                            Export
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* System Info */}
                            <div className="pt-4 border-t border-gray-200">
                                <h3 className="font-medium text-gray-900 mb-3">ข้อมูลระบบ</h3>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                    <div className="p-3 bg-gray-50 rounded-lg">
                                        <p className="text-gray-500 text-xs">เวอร์ชัน</p>
                                        <p className="font-medium text-gray-900">1.0.0</p>
                                    </div>
                                    <div className="p-3 bg-gray-50 rounded-lg">
                                        <p className="text-gray-500 text-xs">Database</p>
                                        <p className="font-medium text-gray-900">Firebase</p>
                                    </div>
                                    <div className="p-3 bg-gray-50 rounded-lg">
                                        <p className="text-gray-500 text-xs">โครงการ</p>
                                        <p className="font-medium text-blue-600">{stats.projects}</p>
                                    </div>
                                    <div className="p-3 bg-gray-50 rounded-lg">
                                        <p className="text-gray-500 text-xs">รายการงาน</p>
                                        <p className="font-medium text-blue-600">{stats.tasks}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
