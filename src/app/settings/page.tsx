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
    Trash2,
    FileSpreadsheet,
    Plus,
    X,
    UserPlus,
    Edit2
} from 'lucide-react';
import { getProjects, getAllTasks, seedSampleData, addProject, addTask, clearAllData, getMembers, createMember, updateMember, deleteMember } from '@/lib/firestore';
import { Task, Project, Member } from '@/types/construction';
import { useAuth } from '@/contexts/AuthContext';

type TabType = 'profile' | 'notifications' | 'appearance' | 'security' | 'members' | 'system';

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
    const { user, refreshUser } = useAuth();
    const [activeTab, setActiveTab] = useState<TabType>('profile');
    const [settings, setSettings] = useState<UserSettings>(defaultSettings);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({ projects: 0, tasks: 0 });
    const [seeding, setSeeding] = useState(false);
    const [importing, setImporting] = useState(false);
    const [clearing, setClearing] = useState(false);

    // Members state
    const [members, setMembers] = useState<Member[]>([]);
    const [currentMemberId, setCurrentMemberId] = useState<string | null>(null);
    const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
    const [editingMember, setEditingMember] = useState<Member | null>(null);
    const [memberForm, setMemberForm] = useState({ name: '', email: '', phone: '', role: 'viewer' as Member['role'] });
    const [savingMember, setSavingMember] = useState(false);

    // Load settings from localStorage and fetch members
    useEffect(() => {
        const savedSettings = localStorage.getItem('srt-hst-settings');
        if (savedSettings) {
            setSettings(JSON.parse(savedSettings));
        }
        fetchStats();
        fetchMembers();
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

    const fetchMembers = async () => {
        try {
            const membersData = await getMembers();
            setMembers(membersData);

            // Sync profile with actual member data
            // 1. Try to find by already linked ID
            let match = currentMemberId ? membersData.find(m => m.id === currentMemberId) : null;

            // 2. If no link yet, try matching email
            if (!match) {
                match = membersData.find(m => m.email === settings.profile.email);
            }

            // 3. Fallback: Default to first Admin or first member if we have data (for demo purposes if no match found)
            if (!match && membersData.length > 0) {
                match = membersData.find(m => m.role === 'admin') || membersData[0];
            }

            if (match) {
                console.log('Syncing profile with member:', match.name);
                setCurrentMemberId(match.id);
                setSettings(prev => ({
                    ...prev,
                    profile: {
                        ...prev.profile,
                        name: match.name,
                        email: match.email,
                        phone: match.phone || '',
                        position: match.position || (match.role === 'admin' ? 'Administrator' : match.role),
                        department: match.department || '',
                        username: match.username || ''
                    }
                }));
            }
        } catch (error) {
            console.error('Error fetching members:', error);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            // 1. Save local settings
            localStorage.setItem('srt-hst-settings', JSON.stringify(settings));

            // 2. Update real member data if linked
            if (currentMemberId) {
                await updateMember(currentMemberId, {
                    name: settings.profile.name,
                    email: settings.profile.email,
                    phone: settings.profile.phone,
                    position: settings.profile.position,
                    department: settings.profile.department,
                    username: settings.profile.username
                });

                // Refresh members to reflect changes in list
                await fetchMembers();
            }

            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (error) {
            console.error('Error saving settings:', error);
            alert('เกิดข้อผิดพลาดในการบันทึก');
        } finally {
            setSaving(false);
        }
    };

    const updateProfile = (field: keyof UserSettings['profile'], value: string) => {
        setSettings(prev => ({ ...prev, profile: { ...prev.profile, [field]: value } }));
    };

    const updateNotification = (field: keyof UserSettings['notifications'], value: boolean) => {
        setSettings(prev => ({ ...prev, notifications: { ...prev.notifications, [field]: value } }));
    };

    const updateAppearance = (field: keyof UserSettings['appearance'], value: string) => {
        setSettings(prev => ({ ...prev, appearance: { ...prev.appearance, [field]: value } }));
    };

    const updateCompany = (field: keyof UserSettings['company'], value: string) => {
        setSettings(prev => ({ ...prev, company: { ...prev.company, [field]: value } }));
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

    const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.csv')) {
            alert('กรุณาเลือกไฟล์ CSV เท่านั้น');
            e.target.value = '';
            return;
        }

        if (!confirm(`ต้องการนำเข้าข้อมูลจากไฟล์ "${file.name}" หรือไม่?\nข้อมูลจะถูกเพิ่มเป็นโครงการใหม่`)) {
            e.target.value = '';
            return;
        }

        setImporting(true);

        try {
            // Read CSV file
            const text = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target?.result as string);
                reader.onerror = reject;
                reader.readAsText(file, 'UTF-8');
            });

            // Parse CSV
            const lines = text.split(/\r?\n/).filter(line => line.trim());
            if (lines.length < 2) {
                throw new Error('CSV file is empty or has no data rows');
            }

            // Parse headers (first line)
            const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));

            // Parse data rows
            const data: any[] = [];
            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
                const row: any = {};
                headers.forEach((header, idx) => {
                    row[header] = values[idx] || '';
                });
                data.push(row);
            }

            // Create a new Project
            const newProject: Omit<Project, 'id' | 'createdAt' | 'updatedAt'> = {
                name: file.name.replace(/\.csv$/i, ''),
                owner: settings.profile.name,
                startDate: new Date().toISOString().split('T')[0],
                endDate: new Date().toISOString().split('T')[0],
                status: 'in-progress',
                overallProgress: 0,
                description: `Imported from ${file.name}`
            };

            const projectId = await addProject(newProject);

            let taskCount = 0;
            let minDate = new Date(8640000000000000);
            let maxDate = new Date(-8640000000000000);

            for (const row of data) {
                // Support various column names
                const taskName = row['Task'] || row['name'] || row['Name'] || row['title'] || row['Title'];

                if (!taskName || taskName === '(Day)' || taskName === '(Baht)') continue;

                const category = row['Category'] || row['category'] || row['No.'] ? `Group ${row['No.']}` : 'Imported Tasks';

                // Date Parsing
                const parseDate = (val: any) => {
                    if (!val) return null;
                    const d = new Date(val);
                    return isNaN(d.getTime()) ? null : d;
                };

                let start = parseDate(row['Start'] || row['planStartDate'] || row['StartDate']) || new Date();
                let end = parseDate(row['End'] || row['planEndDate'] || row['EndDate']) || new Date();

                if (start < minDate) minDate = start;
                if (end > maxDate) maxDate = end;

                // Duration
                let duration = 0;
                if (row['Duration'] || row['planDuration']) {
                    duration = Number(row['Duration'] || row['planDuration']) || 0;
                } else {
                    const diffTime = Math.abs(end.getTime() - start.getTime());
                    duration = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
                }

                const progress = Number(row['Progress'] || row['progress']) || 0;

                // Cost & Quantity
                let cost = 0;
                const rawCost = row['Cost'] || row['cost'] || row['Cost (Baht)'];
                if (rawCost && rawCost !== '-') {
                    cost = parseFloat(String(rawCost).replace(/,/g, '')) || 0;
                }
                const quantity = row["Q'ty"] || row['Qty'] || row['Quantity'] || row['quantity'] || '';

                const newTask: Omit<Task, 'id' | 'createdAt' | 'updatedAt'> = {
                    projectId,
                    name: taskName,
                    category,
                    planStartDate: start.toISOString().split('T')[0],
                    planEndDate: end.toISOString().split('T')[0],
                    progress,
                    status: progress === 100 ? 'completed' : progress > 0 ? 'in-progress' : 'not-started',
                    order: taskCount,
                    planDuration: duration,
                    cost,
                    quantity
                };

                await addTask(newTask);
                taskCount++;
            }

            await fetchStats();
            alert(`นำเข้าข้อมูลสำเร็จ: ${taskCount} งาน`);

        } catch (error) {
            console.error('Import Error:', error);
            alert('เกิดข้อผิดพลาดในการอ่านไฟล์ CSV');
        } finally {
            setImporting(false);
            e.target.value = '';
        }
    };

    const handleClearData = async () => {
        if (!confirm('คำเตือน: ข้อมูลทั้งหมดจะถูกลบและกู้คืนไม่ได้! ต้องการดำเนินการต่อหรือไม่?')) return;
        if (!confirm('ยืนยันครั้งสุดท้าย: ลบข้อมูลทั้งหมดใช่หรือไม่?')) return;

        setClearing(true);
        try {
            await clearAllData(); // Need to ensure this exists or create it
            await fetchStats();
            alert('ลบข้อมูลเรียบร้อยแล้ว');
        } catch (error) {
            console.error('Clear error:', error);
            alert('ลบข้อมูลไม่สำเร็จ');
        } finally {
            setClearing(false);
        }
    };

    const handleExportData = async () => {
        try {
            const tasks = await getAllTasks();

            if (tasks.length === 0) {
                alert('ไม่มีข้อมูลงานให้ส่งออก');
                return;
            }

            // CSV Headers
            const headers = ['Category', 'Task', 'Start', 'End', 'Duration', 'Cost', "Q'ty", 'Progress', 'Status'];

            // CSV Rows
            const rows = tasks.map(task => {
                return [
                    `"${(task.category || '').replace(/"/g, '""')}"`,
                    `"${(task.name || '').replace(/"/g, '""')}"`,
                    task.planStartDate || '',
                    task.planEndDate || '',
                    task.planDuration || '',
                    task.cost || '',
                    `"${(task.quantity || '').replace(/"/g, '""')}"`,
                    task.progress || 0,
                    task.status || 'not-started'
                ].join(',');
            });

            // Combine with BOM for Thai character support in Excel
            const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = url;
            link.download = `srt_hst_backup_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Export error:', error);
            alert('ไม่สามารถส่งออกข้อมูลได้');
        }
    };

    // Member functions
    const handleAddMember = async () => {
        if (!memberForm.name || !memberForm.email) {
            alert('กรุณากรอกชื่อและอีเมล');
            return;
        }

        setSavingMember(true);
        try {
            if (editingMember) {
                await updateMember(editingMember.id, {
                    name: memberForm.name,
                    email: memberForm.email,
                    phone: memberForm.phone,
                    role: memberForm.role
                });

                // If updating self, refresh session to update permissions
                if (user && editingMember.id === user.id) {
                    await refreshUser();
                }
            } else {
                await createMember({
                    name: memberForm.name,
                    email: memberForm.email,
                    phone: memberForm.phone,
                    role: memberForm.role
                });
            }

            await fetchMembers();
            setIsMemberModalOpen(false);
            setEditingMember(null);
            setMemberForm({ name: '', email: '', phone: '', role: 'viewer' });
        } catch (error) {
            console.error('Error saving member:', error);
            alert('เกิดข้อผิดพลาดในการบันทึกข้อมูล');
        } finally {
            setSavingMember(false);
        }
    };

    const handleEditMember = (member: Member) => {
        setEditingMember(member);
        setMemberForm({ name: member.name, email: member.email, phone: member.phone || '', role: member.role });
        setIsMemberModalOpen(true);
    };

    const handleRemoveMember = async (id: string) => {
        if (!confirm('ต้องการลบสมาชิกนี้หรือไม่?')) return;

        try {
            await deleteMember(id);
            await fetchMembers();
        } catch (error) {
            console.error('Error deleting member:', error);
            alert('เกิดข้อผิดพลาดในการลบสมาชิก');
        }
    };

    const getRoleBadge = (role: Member['role']) => {
        const roles = {
            'admin': { label: 'Admin', class: 'bg-red-100 text-red-700' },
            'project_manager': { label: 'Project Manager', class: 'bg-blue-100 text-blue-700' },
            'engineer': { label: 'Engineer', class: 'bg-green-100 text-green-700' },
            'viewer': { label: 'Viewer', class: 'bg-gray-100 text-gray-700' }
        };
        const config = roles[role];
        return <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${config.class}`}>{config.label}</span>;
    };

    const allTabs = [
        { id: 'profile', label: 'โปรไฟล์', icon: User, roles: ['admin', 'project_manager', 'engineer', 'viewer'] },
        { id: 'members', label: 'สมาชิก', icon: Users, roles: ['admin'] },
        { id: 'notifications', label: 'การแจ้งเตือน', icon: Bell, roles: ['admin', 'project_manager', 'engineer', 'viewer'] },
        { id: 'appearance', label: 'รูปแบบ', icon: Palette, roles: ['admin', 'project_manager', 'engineer', 'viewer'] },
        { id: 'security', label: 'ความปลอดภัย', icon: Shield, roles: ['admin', 'project_manager', 'engineer', 'viewer'] },
        { id: 'system', label: 'ระบบ', icon: Database, roles: ['admin'] },
    ];

    const tabs = allTabs.filter(tab => user && tab.roles.includes(user.role));

    if (loading) return <div className="flex justify-center p-10"><Loader2 className="animate-spin text-blue-600" /></div>;

    return (
        <div className="space-y-6">
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
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                    {saved ? 'บันทึกแล้ว!' : 'บันทึกการเปลี่ยนแปลง'}
                </button>
            </div>

            <div className="flex flex-col lg:flex-row gap-6">
                <div className="lg:w-56 flex-shrink-0">
                    <div className="bg-white rounded-lg border border-gray-200 p-2">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as TabType)}
                                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.id ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}
                            >
                                <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'text-blue-600' : 'text-gray-400'}`} />
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex-1">
                    {activeTab === 'profile' && (
                        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900">ข้อมูลโปรไฟล์</h2>
                                <p className="text-gray-500 text-sm mt-0.5">แก้ไขข้อมูลส่วนตัวของคุณ</p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">ชื่อ-นามสกุล</label>
                                        <input
                                            type="text"
                                            value={settings.profile.name}
                                            onChange={(e) => updateProfile('name', e.target.value)}
                                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">ตำแหน่ง</label>
                                        <input
                                            type="text"
                                            value={settings.profile.position}
                                            onChange={(e) => updateProfile('position', e.target.value)}
                                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">แผนก / ฝ่าย</label>
                                        <input
                                            type="text"
                                            value={settings.profile.department}
                                            onChange={(e) => updateProfile('department', e.target.value)}
                                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">อีเมล</label>
                                        <input
                                            type="email"
                                            value={settings.profile.email}
                                            onChange={(e) => updateProfile('email', e.target.value)}
                                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">เบอร์โทรศัพท์</label>
                                        <input
                                            type="tel"
                                            value={settings.profile.phone}
                                            onChange={(e) => updateProfile('phone', e.target.value)}
                                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">ชื่อผู้ใช้งาน (Username)</label>
                                        <input
                                            type="text"
                                            value={settings.profile.username}
                                            onChange={(e) => updateProfile('username', e.target.value)}
                                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'system' && (
                        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900">ตั้งค่าระบบ</h2>
                                <p className="text-gray-500 text-sm mt-0.5">จัดการข้อมูลและการนำเข้า/ส่งออก</p>
                            </div>

                            {/* Data Management Section */}
                            <div className="space-y-4 pt-4 border-t border-gray-100">
                                <h3 className="font-medium text-gray-900">จัดการข้อมูล (Data Management)</h3>

                                <div className="grid gap-4">
                                    {/* Import */}
                                    <div className="flex items-center justify-between p-4 bg-blue-50/50 rounded-lg border border-blue-100">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-white rounded-lg border border-blue-100 text-blue-600">
                                                <FileSpreadsheet className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-gray-900">Import CSV</p>
                                                <p className="text-xs text-gray-500">นำเข้าข้อมูลโครงการจากไฟล์ .csv</p>
                                            </div>
                                        </div>
                                        <label className={`px-4 py-2 text-sm font-medium text-blue-600 bg-white border border-blue-200 rounded-lg hover:bg-blue-50 cursor-pointer flex items-center gap-2 ${importing ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                            {importing ? 'กำลังนำเข้า...' : 'อัปโหลด CSV'}
                                            <input type="file" accept=".csv" className="hidden" onChange={handleImportFile} disabled={importing} />
                                        </label>
                                    </div>

                                    {/* Export */}
                                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                                        <div>
                                            <p className="text-sm font-medium text-gray-900">Backup / Export Data</p>
                                            <p className="text-xs text-gray-500">ดาวน์โหลดข้อมูลทั้งหมดในระบบ</p>
                                        </div>
                                        <button
                                            onClick={handleExportData}
                                            className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 flex items-center gap-2"
                                        >
                                            <Download className="w-4 h-4" />
                                            Export CSV
                                        </button>
                                    </div>

                                    {/* Seed / Reset */}
                                    <div className="flex items-center gap-4 mt-2">
                                        <button
                                            onClick={handleSeedData}
                                            disabled={seeding}
                                            className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded hover:bg-gray-50 flex items-center gap-1"
                                        >
                                            <Database className="w-3 h-3" />
                                            + เพิ่มข้อมูลตัวอย่าง
                                        </button>
                                        <button
                                            onClick={handleClearData}
                                            disabled={clearing}
                                            className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded hover:bg-red-50 flex items-center gap-1 ml-auto"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                            ล้างข้อมูลทั้งหมด (Reset)
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* System Stats */}
                            <div className="pt-6 border-t border-gray-200">
                                <h3 className="font-medium text-gray-900 mb-3">สถานะระบบ</h3>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                    <div className="p-3 bg-gray-50 rounded-lg">
                                        <p className="text-gray-500 text-xs text-center">Projects</p>
                                        <p className="font-bold text-xl text-blue-600 text-center mt-1">{stats.projects}</p>
                                    </div>
                                    <div className="p-3 bg-gray-50 rounded-lg">
                                        <p className="text-gray-500 text-xs text-center">Total Tasks</p>
                                        <p className="font-bold text-xl text-green-600 text-center mt-1">{stats.tasks}</p>
                                    </div>
                                    <div className="p-3 bg-gray-50 rounded-lg">
                                        <p className="text-gray-500 text-xs text-center">Version</p>
                                        <p className="font-medium text-gray-700 text-center mt-2">v1.2.0</p>
                                    </div>
                                    <div className="p-3 bg-gray-50 rounded-lg">
                                        <p className="text-gray-500 text-xs text-center">Status</p>
                                        <p className="font-medium text-green-600 text-center mt-2 flex items-center justify-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500"></span> Online</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Placeholder for other tabs to keep layout intact if user clicks them */}
                    {activeTab !== 'profile' && activeTab !== 'system' && activeTab !== 'members' && (
                        <div className="bg-white rounded-lg border border-gray-200 p-10 flex flex-col items-center text-center text-gray-500">
                            <Settings className="w-10 h-10 mb-4 text-gray-300" />
                            <p>ส่วนนี้ยังไม่เปิดให้แก้ไขในเวอร์ชัน Demo</p>
                        </div>
                    )}

                    {/* Members Tab */}
                    {activeTab === 'members' && (
                        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-lg font-semibold text-gray-900">จัดการสมาชิก</h2>
                                    <p className="text-gray-500 text-sm mt-0.5">เพิ่มหรือลบสมาชิกที่สามารถเข้าถึงระบบได้</p>
                                </div>
                                <button
                                    onClick={() => {
                                        setEditingMember(null);
                                        setMemberForm({ name: '', email: '', phone: '', role: 'viewer' });
                                        setIsMemberModalOpen(true);
                                    }}
                                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                                >
                                    <UserPlus className="w-4 h-4" />
                                    เพิ่มสมาชิก
                                </button>
                            </div>

                            {/* Members List */}
                            <div className="divide-y divide-gray-100">
                                {members.map((member) => (
                                    <div key={member.id} className="py-4 flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold">
                                                {member.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="font-medium text-gray-900">{member.name}</p>
                                                <p className="text-sm text-gray-500">{member.email}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            {getRoleBadge(member.role)}
                                            <button
                                                onClick={() => handleEditMember(member)}
                                                className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-blue-600"
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleRemoveMember(member.id)}
                                                className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-red-600"
                                                disabled={member.role === 'admin' && members.filter(m => m.role === 'admin').length <= 1}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Summary */}
                            <div className="pt-4 border-t border-gray-100">
                                <p className="text-sm text-gray-500">
                                    ทั้งหมด <span className="font-medium text-gray-900">{members.length}</span> สมาชิก
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Add/Edit Member Modal */}
                    {isMemberModalOpen && (
                        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                            <div className="bg-white rounded-xl w-full max-w-md">
                                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                                    <h2 className="text-lg font-semibold text-gray-900">
                                        {editingMember ? 'แก้ไขสมาชิก' : 'เพิ่มสมาชิกใหม่'}
                                    </h2>
                                    <button
                                        onClick={() => {
                                            setIsMemberModalOpen(false);
                                            setEditingMember(null);
                                        }}
                                        className="p-1 hover:bg-gray-100 rounded text-gray-400"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>

                                <div className="p-6 space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">ชื่อ-นามสกุล *</label>
                                        <input
                                            type="text"
                                            value={memberForm.name}
                                            onChange={(e) => setMemberForm({ ...memberForm, name: e.target.value })}
                                            placeholder="เช่น สมชาย ใจดี"
                                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:border-blue-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">อีเมล *</label>
                                        <input
                                            type="email"
                                            value={memberForm.email}
                                            onChange={(e) => setMemberForm({ ...memberForm, email: e.target.value })}
                                            placeholder="example@company.com"
                                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:border-blue-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">เบอร์โทร</label>
                                        <input
                                            type="tel"
                                            value={memberForm.phone}
                                            onChange={(e) => setMemberForm({ ...memberForm, phone: e.target.value })}
                                            placeholder="081-234-5678"
                                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:border-blue-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">บทบาท</label>
                                        <select
                                            value={memberForm.role}
                                            onChange={(e) => setMemberForm({ ...memberForm, role: e.target.value as Member['role'] })}
                                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:border-blue-500"
                                        >
                                            <option value="admin">Admin - สิทธิ์เต็มระบบ</option>
                                            <option value="project_manager">Project Manager - จัดการโครงการ</option>
                                            <option value="engineer">Engineer - วิศวกร</option>
                                            <option value="viewer">Viewer - ดูอย่างเดียว</option>
                                        </select>
                                    </div>

                                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setIsMemberModalOpen(false);
                                                setEditingMember(null);
                                            }}
                                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                                        >
                                            ยกเลิก
                                        </button>
                                        <button
                                            onClick={handleAddMember}
                                            disabled={savingMember}
                                            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50"
                                        >
                                            {savingMember && <Loader2 className="w-4 h-4 animate-spin" />}
                                            {editingMember ? 'บันทึก' : 'เพิ่มสมาชิก'}
                                        </button>
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
