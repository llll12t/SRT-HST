'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { isSameWeek, subWeeks, parseISO } from 'date-fns';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
    Settings,
    User,
    Building2,
    Bell,
    Database,
    Users,
    Save,
    Check,
    Loader2,
    Upload,
    Download,
    Trash2,
    FileSpreadsheet,
    X,
    UserPlus,
    Edit2,
    Info,
    AlertTriangle,
    CheckCircle2,
    LogOut,
    Send
} from 'lucide-react';
import {
    getWeeklyCostStats,
    generateWeeklyReportFlexMessage
} from '@/lib/report-service';
import {
    generateTasksFlexMessage,
    generateProjectProgressFlexMessage,
    generateProcurementFlexMessage
} from '@/lib/line-flex-templates';
import { sendLineFlexMessageAction } from '@/app/actions/line';
import { getProjects, getAllTasks, seedSampleData, seedFullDemoProject, addProject, addTask, clearAllData, getMembers, createMember, updateMember, deleteMember, getUserSettings, saveUserSettings } from '@/lib/firestore';
import { Task, Project, Member } from '@/types/construction';
import { useAuth } from '@/contexts/AuthContext';

type TabType = 'profile' | 'notifications' | 'company' | 'members' | 'system';

interface UserSettings {
    profile: {
        name: string;

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
        telegramEnabled: boolean;
        telegramBotToken: string;
        telegramChatId: string;
        lineEnabled: boolean;
        lineChannelAccessToken: string;
        lineGroupId: string;
        lineUserIds: string[];
    };
    appearance: {
        theme: 'light' | 'dark' | 'system';
        language: 'th' | 'en';
        dateFormat: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
    };
    company: {
        name: string;
        taxId: string;
        logoBase64: string;
    };
}

const defaultSettings: UserSettings = {
    profile: {
        name: 'Admin User',

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
        deadline: true,
        telegramEnabled: false,
        telegramBotToken: '',
        telegramChatId: '',
        lineEnabled: false,
        lineChannelAccessToken: '',
        lineGroupId: '',
        lineUserIds: []
    },
    appearance: {
        theme: 'light',
        language: 'th',
        dateFormat: 'DD/MM/YYYY'
    },
    company: {
        name: 'SRT-HST Construction Co., Ltd.',
        taxId: '0105562012345',
        logoBase64: ''
    }
};

const mergeSettingsWithDefault = (stored: Partial<UserSettings>): UserSettings => ({
    ...defaultSettings,
    ...stored,
    profile: {
        ...defaultSettings.profile,
        ...(stored.profile || {})
    },
    notifications: {
        ...defaultSettings.notifications,
        ...(stored.notifications || {})
    },
    appearance: {
        ...defaultSettings.appearance,
        ...(stored.appearance || {})
    },
    company: {
        ...defaultSettings.company,
        ...(stored.company || {})
    }
});

export default function SettingsPage() {
    const router = useRouter();
    const { user, refreshUser, logout } = useAuth();
    const [activeTab, setActiveTab] = useState<TabType>('profile');
    const [settings, setSettings] = useState<UserSettings>(defaultSettings);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({ projects: 0, tasks: 0 });
    const [seeding, setSeeding] = useState(false);
    const [seedingFullDemo, setSeedingFullDemo] = useState(false);
    const [importing, setImporting] = useState(false);
    const [clearing, setClearing] = useState(false);
    const [sendingTelegram, setSendingTelegram] = useState(false);
    const [sendingLine, setSendingLine] = useState(false);


    // Alert Dialog State
    const [alertDialog, setAlertDialog] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        type: 'info' | 'success' | 'warning' | 'error' | 'confirm';
        onConfirm?: () => void;
        onCancel?: () => void;
    }>({
        isOpen: false,
        title: '',
        message: '',
        type: 'info'
    });

    // Members state
    const [members, setMembers] = useState<Member[]>([]);
    const [currentMemberId, setCurrentMemberId] = useState<string | null>(null);
    const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
    const [editingMember, setEditingMember] = useState<Member | null>(null);
    const [memberForm, setMemberForm] = useState({ name: '', email: '', phone: '', role: 'viewer' as Member['role'] });
    const [savingMember, setSavingMember] = useState(false);

    const fetchStats = useCallback(async () => {
        try {
            const [projects, tasks] = await Promise.all([
                getProjects(),
                getAllTasks()
            ]);
            setStats({ projects: projects.length, tasks: tasks.length });
        } catch (error) {
            console.error('Error fetching stats:', error);
        }
    }, []);

    const fetchMembers = useCallback(async (matchEmail?: string) => {
        try {
            const membersData = await getMembers();
            setMembers(membersData);

            // Sync profile with actual member data
            // 1. Try to find by already linked ID
            let match = currentMemberId ? membersData.find(m => m.id === currentMemberId) : null;

            // 2. If no link yet, try matching email
            if (!match) {
                const normalizedMatchEmail = (matchEmail || '').trim().toLowerCase();
                if (normalizedMatchEmail) {
                    match = membersData.find(m => (m.email || '').toLowerCase() === normalizedMatchEmail);
                }
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
                        department: match.department || ''
                    }
                }));
            }
        } catch (error) {
            console.error('Error fetching members:', error);
        }
    }, [currentMemberId]);

    // Load local settings and base data
    useEffect(() => {
        let cancelled = false;

        const initialize = async () => {
            setLoading(true);
            let nextSettings = defaultSettings;

            const savedSettings = localStorage.getItem('srt-hst-settings');
            try {
                if (savedSettings) {
                    const parsed = JSON.parse(savedSettings) as Partial<UserSettings>;
                    nextSettings = mergeSettingsWithDefault(parsed);
                }
            } catch (error) {
                console.error('Failed to parse settings:', error);
                nextSettings = defaultSettings;
            }

            if (!cancelled) {
                setSettings(nextSettings);
            }

            await Promise.all([
                fetchStats(),
                fetchMembers(nextSettings.profile.email)
            ]);

            if (!cancelled) {
                setLoading(false);
            }
        };

        initialize();

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Sync cloud settings when user session is ready
    useEffect(() => {
        let cancelled = false;

        const syncCloudSettings = async () => {
            if (!user?.id) return;

            try {
                const cloudSettings = await getUserSettings(user.id);
                // IF no settings found in cloud, skip overriding local
                if (!cloudSettings || Object.keys(cloudSettings).length === 0 || cancelled) return;

                const merged = mergeSettingsWithDefault(cloudSettings as Partial<UserSettings>);
                setSettings(merged);

                // ALSO WE SHOULD SAVE TO LOCAL STORAGE SO WE STAY IN SYNC
                localStorage.setItem('srt-hst-settings', JSON.stringify(merged));

                await fetchMembers(merged.profile.email);
            } catch (error) {
                console.error('Failed to load settings from Firebase:', error);
            }
        };

        syncCloudSettings();

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id]);

    const handleSave = async () => {
        setSaving(true);
        try {
            // 1. Save local settings
            localStorage.setItem('srt-hst-settings', JSON.stringify(settings));
            window.dispatchEvent(new CustomEvent('srt-hst-settings-updated'));

            // 2. Save all settings to Firebase (including company)
            if (user?.id) {
                await saveUserSettings(user.id, settings as unknown as Record<string, unknown>);
            }

            // 3. Update real member data if linked
            if (currentMemberId) {
                await updateMember(currentMemberId, {
                    name: settings.profile.name,
                    email: settings.profile.email,
                    phone: settings.profile.phone,
                    position: settings.profile.position,
                    department: settings.profile.department
                });

                // Refresh members to reflect changes in list
                await fetchMembers(settings.profile.email);
            }

            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (error) {
            console.error('Error saving settings:', error);
            setAlertDialog({
                isOpen: true,
                title: 'ข้อผิดพลาด',
                message: 'เกิดข้อผิดพลาดในการบันทึก',
                type: 'error',
                onConfirm: () => setAlertDialog(prev => ({ ...prev, isOpen: false }))
            });
        } finally {
            setSaving(false);
        }
    };

    const updateProfile = (field: keyof UserSettings['profile'], value: string) => {
        setSettings(prev => ({ ...prev, profile: { ...prev.profile, [field]: value } }));
    };

    const updateNotification = <K extends keyof UserSettings['notifications']>(
        field: K,
        value: UserSettings['notifications'][K]
    ) => {
        setSettings(prev => ({ ...prev, notifications: { ...prev.notifications, [field]: value } }));
    };

    const updateCompany = (field: keyof UserSettings['company'], value: string) => {
        setSettings(prev => ({ ...prev, company: { ...prev.company, [field]: value } }));
    };

    const handleCompanyLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            setAlertDialog({
                isOpen: true,
                title: 'ข้อผิดพลาด',
                message: 'กรุณาเลือกไฟล์รูปภาพเท่านั้น',
                type: 'error',
                onConfirm: () => setAlertDialog(prev => ({ ...prev, isOpen: false }))
            });
            e.target.value = '';
            return;
        }

        try {
            const base64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result || ''));
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
            updateCompany('logoBase64', base64);
        } catch (error) {
            console.error('Error converting logo to base64:', error);
            setAlertDialog({
                isOpen: true,
                title: 'ข้อผิดพลาด',
                message: 'ไม่สามารถแปลงไฟล์โลโก้ได้',
                type: 'error',
                onConfirm: () => setAlertDialog(prev => ({ ...prev, isOpen: false }))
            });
        } finally {
            e.target.value = '';
        }
    };

    const handleLogout = async () => {
        try {
            await logout();
        } finally {
            router.push('/login');
        }
    };

    const handleSeedData = async () => {
        setAlertDialog({
            isOpen: true,
            title: 'ยืนยัน',
            message: 'ต้องการเพิ่มข้อมูลตัวอย่างหรือไม่? (จะไม่เพิ่มซ้ำถ้ามีข้อมูลอยู่แล้ว)',
            type: 'confirm',
            onConfirm: async () => {
                setAlertDialog(prev => ({ ...prev, isOpen: false }));
                setSeeding(true);
                try {
                    await seedSampleData();
                    await fetchStats();
                    setAlertDialog({
                        isOpen: true,
                        title: 'สำเร็จ',
                        message: 'เพิ่มข้อมูลตัวอย่างเรียบร้อย',
                        type: 'success',
                        onConfirm: () => setAlertDialog(prev => ({ ...prev, isOpen: false }))
                    });
                } catch (error) {
                    console.error('Error seeding data:', error);
                    setAlertDialog({
                        isOpen: true,
                        title: 'ข้อผิดพลาด',
                        message: 'เกิดข้อผิดพลาด',
                        type: 'error',
                        onConfirm: () => setAlertDialog(prev => ({ ...prev, isOpen: false }))
                    });
                } finally {
                    setSeeding(false);
                }
            },
            onCancel: () => setAlertDialog(prev => ({ ...prev, isOpen: false }))
        });
    };

    const handleSeedFullDemoProject = async () => {
        setAlertDialog({
            isOpen: true,
            title: 'Create Full Demo Project',
            message: 'Do you want to create a complete demo project with tasks, expenses, and weekly logs?',
            type: 'confirm',
            onConfirm: async () => {
                setAlertDialog(prev => ({ ...prev, isOpen: false }));
                setSeedingFullDemo(true);
                try {
                    const result = await seedFullDemoProject();
                    await fetchStats();
                    setAlertDialog({
                        isOpen: true,
                        title: result.created ? 'Success' : 'Info',
                        message: result.created
                            ? `Project created\n- Tasks: ${result.taskCount}\n- Expenses: ${result.expenseCount}\n- Weekly Logs: ${result.weeklyLogCount}`
                            : result.message,
                        type: result.created ? 'success' : 'info',
                        onConfirm: () => setAlertDialog(prev => ({ ...prev, isOpen: false }))
                    });
                } catch (error) {
                    console.error('Error creating full demo project:', error);
                    setAlertDialog({
                        isOpen: true,
                        title: 'Error',
                        message: 'Failed to create full demo project',
                        type: 'error',
                        onConfirm: () => setAlertDialog(prev => ({ ...prev, isOpen: false }))
                    });
                } finally {
                    setSeedingFullDemo(false);
                }
            },
            onCancel: () => setAlertDialog(prev => ({ ...prev, isOpen: false }))
        });
    };

    const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.csv')) {
            setAlertDialog({
                isOpen: true,
                title: 'ข้อผิดพลาด',
                message: 'กรุณาเลือกไฟล์ CSV เท่านั้น',
                type: 'error',
                onConfirm: () => setAlertDialog(prev => ({ ...prev, isOpen: false }))
            });
            e.target.value = '';
            return;
        }

        setAlertDialog({
            isOpen: true,
            title: 'ยืนยันการนำเข้า',
            message: `ต้องการนำเข้าข้อมูลจากไฟล์ "${file.name}" หรือไม่?\nข้อมูลจะถูกเพิ่มเป็นโครงการใหม่`,
            type: 'confirm',
            onConfirm: async () => {
                setAlertDialog(prev => ({ ...prev, isOpen: false }));
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
                    const data: Record<string, string>[] = [];
                    for (let i = 1; i < lines.length; i++) {
                        const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
                        const row: Record<string, string> = {};
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
                        const parseDate = (val: unknown) => {
                            if (!val) return null;
                            const d = new Date(String(val));
                            return isNaN(d.getTime()) ? null : d;
                        };

                        const start = parseDate(row['Start'] || row['planStartDate'] || row['StartDate']) || new Date();
                        const end = parseDate(row['End'] || row['planEndDate'] || row['EndDate']) || new Date();

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
                    setAlertDialog({
                        isOpen: true,
                        title: 'สำเร็จ',
                        message: `นำเข้าข้อมูลสำเร็จ: ${taskCount} งาน`,
                        type: 'success',
                        onConfirm: () => setAlertDialog(prev => ({ ...prev, isOpen: false }))
                    });

                } catch (error) {
                    console.error('Import Error:', error);
                    setAlertDialog({
                        isOpen: true,
                        title: 'ข้อผิดพลาด',
                        message: 'เกิดข้อผิดพลาดในการอ่านไฟล์ CSV',
                        type: 'error',
                        onConfirm: () => setAlertDialog(prev => ({ ...prev, isOpen: false }))
                    });
                } finally {
                    setImporting(false);
                    e.target.value = '';
                }
            },
            onCancel: () => {
                setAlertDialog(prev => ({ ...prev, isOpen: false }));
                e.target.value = '';
            }
        });
    };

    const handleClearData = async () => {
        setAlertDialog({
            isOpen: true,
            title: 'คำเตือน: ลบข้อมูล',
            message: 'ข้อมูลทั้งหมดจะถูกลบและกู้คืนไม่ได้! ต้องการดำเนินการต่อหรือไม่?',
            type: 'warning',
            onConfirm: () => {
                setAlertDialog(prev => ({ ...prev, isOpen: false }));
                // Second confirmation
                setTimeout(() => {
                    setAlertDialog({
                        isOpen: true,
                        title: 'ยืนยันครั้งสุดท้าย',
                        message: 'คุณแน่ใจว่าต้องการลบข้อมูลทั้งหมดใช่หรือไม่?',
                        type: 'error',
                        onConfirm: async () => {
                            setAlertDialog(prev => ({ ...prev, isOpen: false }));

                            setClearing(true);
                            try {
                                await clearAllData();
                                await fetchStats();
                                setAlertDialog({
                                    isOpen: true,
                                    title: 'สำเร็จ',
                                    message: 'ลบข้อมูลเรียบร้อยแล้ว',
                                    type: 'success',
                                    onConfirm: () => setAlertDialog(prev => ({ ...prev, isOpen: false }))
                                });
                            } catch (error) {
                                console.error('Clear error:', error);
                                setAlertDialog({
                                    isOpen: true,
                                    title: 'ข้อผิดพลาด',
                                    message: 'ลบข้อมูลไม่สำเร็จ',
                                    type: 'error',
                                    onConfirm: () => setAlertDialog(prev => ({ ...prev, isOpen: false }))
                                });
                            } finally {
                                setClearing(false);
                            }
                        },
                        onCancel: () => setAlertDialog(prev => ({ ...prev, isOpen: false }))
                    });
                }, 300);
            },
            onCancel: () => setAlertDialog(prev => ({ ...prev, isOpen: false }))
        });
    };

    const handleExportData = async () => {
        try {
            const tasks = await getAllTasks();

            if (tasks.length === 0) {
                setAlertDialog({
                    isOpen: true,
                    title: 'แจ้งเตือน',
                    message: 'ไม่มีข้อมูลงานให้ส่งออก',
                    type: 'info',
                    onConfirm: () => setAlertDialog(prev => ({ ...prev, isOpen: false }))
                });
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
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Export error:', error);
            setAlertDialog({
                isOpen: true,
                title: 'ข้อผิดพลาด',
                message: 'ไม่สามารถส่งออกข้อมูลได้',
                type: 'error',
                onConfirm: () => setAlertDialog(prev => ({ ...prev, isOpen: false }))
            });
        }
    };

    // Member functions
    const handleSendTelegramTest = async () => {
        if (!settings.notifications.telegramBotToken || !settings.notifications.telegramChatId) {
            setAlertDialog({
                isOpen: true,
                title: 'ไม่สามารถส่งข้อความได้',
                message: 'กรุณากรอก Telegram Bot Token และ Chat ID ให้ครบถ้วนก่อนส่ง',
                type: 'warning',
                onConfirm: () => setAlertDialog(prev => ({ ...prev, isOpen: false }))
            });
            return;
        }

        setSendingTelegram(true);
        try {
            // Send test message
            const response = await fetch(`https://api.telegram.org/bot${settings.notifications.telegramBotToken}/sendMessage`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    chat_id: settings.notifications.telegramChatId,
                    text: '🔔 ทดสอบการแจ้งเตือนจาก SRT-HST App\n\nระบบเชื่อมต่อ Telegram เรียบร้อยแล้ว!',
                    parse_mode: 'Markdown'
                })
            });

            if (response.ok) {
                setAlertDialog({
                    isOpen: true,
                    title: 'สำเร็จ',
                    message: 'ส่งข้อความทดสอบไปยัง Telegram เรียบร้อยแล้ว',
                    type: 'success',
                    onConfirm: () => setAlertDialog(prev => ({ ...prev, isOpen: false }))
                });
            } else {
                throw new Error('Telegram API Error: ' + response.statusText);
            }
        } catch (error: any) {
            console.error('Failed to send Telegram message:', error);
            setAlertDialog({
                isOpen: true,
                title: 'เกิดข้อผิดพลาด',
                message: `ไม่สามารถส่งข้อความได้: ${error.message || 'Unknown error'}`,
                type: 'error',
                onConfirm: () => setAlertDialog(prev => ({ ...prev, isOpen: false }))
            });
        } finally {
            setSendingTelegram(false);
        }
    };

    const handleSendLineTest = async () => {
        if (!settings.notifications.lineChannelAccessToken) {
            setAlertDialog({
                isOpen: true,
                title: 'ไม่สามารถส่งข้อความได้',
                message: 'กรุณากรอก LINE Messaging API Token ก่อนส่ง',
                type: 'warning',
                onConfirm: () => setAlertDialog(prev => ({ ...prev, isOpen: false }))
            });
            return;
        }

        const targets = [];
        if (settings.notifications.lineGroupId) targets.push(settings.notifications.lineGroupId);
        if (settings.notifications.lineUserIds && settings.notifications.lineUserIds.length > 0) {
            targets.push(...settings.notifications.lineUserIds.filter(id => id.trim() !== ''));
        }

        if (targets.length === 0) {
            setAlertDialog({
                isOpen: true,
                title: 'ไม่สามารถส่งข้อความได้',
                message: 'กรุณากรอก Group ID หรือ User ID อย่างน้อย 1 รายการ',
                type: 'warning',
                onConfirm: () => setAlertDialog(prev => ({ ...prev, isOpen: false }))
            });
            return;
        }

        setSendingLine(true);
        try {
            // Fetch stats and tasks for demo reports
            const { stats, project } = await getWeeklyCostStats('all');
            const tasks = await getAllTasks();

            // 1. Weekly S-Curve Report
            const sCurveMessage = generateWeeklyReportFlexMessage(stats, project, new Date());

            // 2. Project Progress Summary
            const progressMessage = project
                ? generateProjectProgressFlexMessage(project)
                : generateProjectProgressFlexMessage({ name: 'สรุปทุกโครงการ', overallProgress: stats.totalBudget > 0 ? (stats.earnedToDate / stats.totalBudget) * 100 : 0 } as any);

            const now = new Date();
            const lastWeek = subWeeks(now, 1);

            // 3. This Week Tasks (งานแผนสัปดาห์นี้) - Tasks that are planned/active this week
            const thisWeekTasks = tasks.filter(t => {
                if (!t.planStartDate || !t.planEndDate) return false;
                try {
                    const start = parseISO(t.planStartDate);
                    const end = parseISO(t.planEndDate);
                    return t.status !== 'completed' &&
                        (isSameWeek(start, now, { weekStartsOn: 1 }) ||
                            isSameWeek(end, now, { weekStartsOn: 1 }) ||
                            (start <= now && end >= now));
                } catch { return false; }
            });
            const thisWeekMessage = generateTasksFlexMessage('📅 แผนงานสัปดาห์นี้', thisWeekTasks, project, '#2563eb');

            // 4. Last Week Tasks (งานสัปดาห์ที่ผ่านมา)
            const lastWeekTasks = tasks.filter(t => {
                if (!t.planStartDate || !t.planEndDate) return false;
                try {
                    const start = parseISO(t.planStartDate);
                    const end = parseISO(t.planEndDate);
                    return (isSameWeek(start, lastWeek, { weekStartsOn: 1 }) ||
                        isSameWeek(end, lastWeek, { weekStartsOn: 1 }) ||
                        (start <= lastWeek && end >= lastWeek));
                } catch { return false; }
            });
            const lastWeekMessage = generateTasksFlexMessage('⏮️ งานสัปดาห์ที่ผ่านมา', lastWeekTasks, project, '#64748b');

            // 5. Procurement Alerts
            const procTasks = tasks.filter(t => t.procurementStatus && t.procurementStatus !== 'delivered' && t.dateOfUse);
            const procMessage = generateProcurementFlexMessage(procTasks, project);

            // Send all messages in sequence to all targets
            const messagesToSend = [
                progressMessage,
                sCurveMessage,
                thisWeekMessage,
                lastWeekMessage,
                ...((procTasks.length > 0) ? [procMessage] : [])
            ];

            let allFailures = 0;

            for (const targetId of targets) {
                for (const message of messagesToSend) {
                    const res = await sendLineFlexMessageAction(
                        settings.notifications.lineChannelAccessToken,
                        targetId,
                        message
                    );
                    if (!res.success) allFailures++;
                }
            }

            if (allFailures === 0) {
                setAlertDialog({
                    isOpen: true,
                    title: 'สำเร็จ',
                    message: `ส่งรายงานจำนวน ${messagesToSend.length} รูปแบบ ไปยัง ${targets.length} ปลายทางเรียบร้อยแล้ว`,
                    type: 'success',
                    onConfirm: () => setAlertDialog(prev => ({ ...prev, isOpen: false }))
                });
            } else {
                throw new Error(`${allFailures} messages failed to send.`);
            }
        } catch (error: any) {
            console.error('Failed to send Line message:', error);
            setAlertDialog({
                isOpen: true,
                title: 'เกิดข้อผิดพลาด',
                message: `การส่งข้อความบางส่วนล้มเหลว: ${error.message || 'Unknown error'}`,
                type: 'error',
                onConfirm: () => setAlertDialog(prev => ({ ...prev, isOpen: false }))
            });
        } finally {
            setSendingLine(false);
        }
    };

    const addLineUserId = () => {
        setSettings(prev => ({
            ...prev,
            notifications: {
                ...prev.notifications,
                lineUserIds: [...(prev.notifications.lineUserIds || []), '']
            }
        }));
    };

    const updateLineUserId = (index: number, value: string) => {
        const newIds = [...(settings.notifications.lineUserIds || [])];
        newIds[index] = value;
        setSettings(prev => ({
            ...prev,
            notifications: {
                ...prev.notifications,
                lineUserIds: newIds
            }
        }));
    };

    const removeLineUserId = (index: number) => {
        const newIds = [...(settings.notifications.lineUserIds || [])];
        newIds.splice(index, 1);
        setSettings(prev => ({
            ...prev,
            notifications: {
                ...prev.notifications,
                lineUserIds: newIds
            }
        }));
    };

    const handleAddMember = async () => {
        if (!memberForm.name || !memberForm.email) {
            setAlertDialog({
                isOpen: true,
                title: 'ข้อผิดพลาด',
                message: 'กรุณากรอกชื่อและอีเมล',
                type: 'error',
                onConfirm: () => setAlertDialog(prev => ({ ...prev, isOpen: false }))
            });
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
            setMemberForm({ name: '', email: '', phone: '', role: 'viewer' });
        } catch (error) {
            console.error('Error saving member:', error);
            setAlertDialog({
                isOpen: true,
                title: 'ข้อผิดพลาด',
                message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล',
                type: 'error',
                onConfirm: () => setAlertDialog(prev => ({ ...prev, isOpen: false }))
            });
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
        setAlertDialog({
            isOpen: true,
            title: 'ยืนยันการลบ',
            message: 'ต้องการลบสมาชิกนี้หรือไม่?',
            type: 'confirm',
            onConfirm: async () => {
                setAlertDialog(prev => ({ ...prev, isOpen: false }));
                try {
                    await deleteMember(id);
                    await fetchMembers();
                } catch (error) {
                    console.error('Error deleting member:', error);
                    setAlertDialog({
                        isOpen: true,
                        title: 'ข้อผิดพลาด',
                        message: 'เกิดข้อผิดพลาดในการลบสมาชิก',
                        type: 'error',
                        onConfirm: () => setAlertDialog(prev => ({ ...prev, isOpen: false }))
                    });
                }
            },
            onCancel: () => setAlertDialog(prev => ({ ...prev, isOpen: false }))
        });
    };

    const getRoleBadge = (role: Member['role']) => {
        const roles = {
            'admin': { label: 'Admin', class: 'bg-red-100 text-red-700' },
            'project_manager': { label: 'Project Manager', class: 'bg-blue-100 text-blue-700' },
            'engineer': { label: 'Engineer', class: 'bg-green-100 text-green-700' },
            'viewer': { label: 'Viewer', class: 'bg-gray-100 text-gray-700' }
        };
        const config = roles[role];
        return <span className={`px-2 py-0.5 text-xs font-medium rounded-sm ${config.class}`}>{config.label}</span>;
    };

    const allTabs = [
        { id: 'profile', label: 'โปรไฟล์', icon: User, roles: ['admin', 'project_manager', 'engineer', 'viewer'] },
        { id: 'notifications', label: 'การแจ้งเตือน', icon: Bell, roles: ['admin', 'project_manager', 'engineer', 'viewer'] },
        { id: 'company', label: 'บริษัท', icon: Building2, roles: ['admin'] },
        { id: 'members', label: 'สมาชิก', icon: Users, roles: ['admin'] },
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
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-sm hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                    {saved ? 'บันทึกแล้ว!' : 'บันทึกการเปลี่ยนแปลง'}
                </button>
            </div>

            <div className="flex flex-col lg:flex-row gap-6">
                <div className="lg:w-60 flex-shrink-0">
                    <div className="bg-white rounded border border-gray-200 p-2 space-y-1">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as TabType)}
                                className={`w-full flex items-center gap-3 px-3 py-2 rounded text-sm font-medium transition-all ${activeTab === tab.id ? 'bg-blue-50 text-blue-700 border-l-2 border-blue-600' : 'text-gray-600 hover:bg-gray-50 border-l-2 border-transparent'}`}
                            >
                                <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'text-blue-600' : 'text-gray-400'}`} />
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex-1">
                    {activeTab === 'profile' && (
                        <div className="bg-white rounded border border-gray-200 p-5 space-y-5">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900">ข้อมูลโปรไฟล์</h2>
                                <p className="text-gray-500 text-sm mt-0.5">แก้ไขข้อมูลส่วนตัวของคุณ</p>
                            </div>
                            <div className="flex justify-end">
                                <button
                                    type="button"
                                    onClick={handleLogout}
                                    className="px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-sm hover:bg-red-100 transition-colors inline-flex items-center gap-2"
                                >
                                    <LogOut className="w-4 h-4" />
                                    Logout
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">ชื่อ-นามสกุล</label>
                                        <input
                                            type="text"
                                            value={settings.profile.name}
                                            onChange={(e) => updateProfile('name', e.target.value)}
                                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">ตำแหน่ง</label>
                                        <input
                                            type="text"
                                            value={settings.profile.position}
                                            onChange={(e) => updateProfile('position', e.target.value)}
                                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">แผนก / ฝ่าย</label>
                                        <input
                                            type="text"
                                            value={settings.profile.department}
                                            onChange={(e) => updateProfile('department', e.target.value)}
                                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
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
                                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">เบอร์โทรศัพท์</label>
                                        <input
                                            type="tel"
                                            value={settings.profile.phone}
                                            onChange={(e) => updateProfile('phone', e.target.value)}
                                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                                        />
                                    </div>

                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'notifications' && (
                        <div className="bg-white rounded border border-gray-200 p-5 space-y-5">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900">ตั้งค่าการแจ้งเตือน</h2>
                                <p className="text-gray-500 text-sm mt-0.5">กำหนดช่องทางแจ้งเตือน และตั้งค่า LINE สำหรับพัฒนาต่อในอนาคต</p>
                            </div>

                            <div className="space-y-4 pt-4 border-t border-gray-100">
                                <h3 className="text-sm font-semibold text-gray-900">Telegram Notification</h3>

                                <label className="flex items-center justify-between gap-3 p-3 border border-gray-200 rounded-sm">
                                    <span className="text-sm text-gray-700">เปิดใช้งานแจ้งเตือนผ่าน Telegram</span>
                                    <input
                                        type="checkbox"
                                        checked={settings.notifications.telegramEnabled}
                                        onChange={(e) => updateNotification('telegramEnabled', e.target.checked)}
                                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                </label>

                                {settings.notifications.telegramEnabled && (
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Telegram Bot Token</label>
                                            <input
                                                type="password"
                                                value={settings.notifications.telegramBotToken}
                                                onChange={(e) => updateNotification('telegramBotToken', e.target.value)}
                                                placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxYZ"
                                                className="w-full px-3 py-2 bg-white border border-gray-200 rounded text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors font-mono"
                                            />
                                            <p className="text-xs text-gray-500 mt-1">รับ Token จาก @BotFather</p>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Chat ID / Channel ID</label>
                                            <input
                                                type="text"
                                                value={settings.notifications.telegramChatId}
                                                onChange={(e) => updateNotification('telegramChatId', e.target.value)}
                                                placeholder="@channelname หรือ -100xxxxxxxxxx"
                                                className="w-full px-3 py-2 bg-white border border-gray-200 rounded text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors font-mono"
                                            />
                                            <p className="text-xs text-gray-500 mt-1">ต้องเพิ่ม Bot เข้ากลุ่ม/Channel และกำหนดให้เป็น Admin ก่อน</p>
                                        </div>

                                        <div className="flex justify-start gap-3 pt-2">
                                            <button
                                                onClick={handleSendTelegramTest}
                                                disabled={sendingTelegram || !settings.notifications.telegramBotToken || !settings.notifications.telegramChatId}
                                                className="px-4 py-2 text-sm font-medium text-white bg-blue-500 rounded-sm hover:bg-blue-600 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {sendingTelegram ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                                ทดสอบส่งข้อความ (Test Message)
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-4 pt-4 border-t border-gray-100">
                                <h3 className="text-sm font-semibold text-gray-900">LINE Notification (Messaging API)</h3>

                                <label className="flex items-center justify-between gap-3 p-3 border border-gray-200 rounded-sm">
                                    <span className="text-sm text-gray-700">เปิดใช้งานแจ้งเตือนผ่าน LINE</span>
                                    <input
                                        type="checkbox"
                                        checked={settings.notifications.lineEnabled}
                                        onChange={(e) => updateNotification('lineEnabled', e.target.checked)}
                                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                </label>

                                {settings.notifications.lineEnabled && (
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1.5">LINE Messaging API Token</label>
                                            <input
                                                type="password"
                                                value={settings.notifications.lineChannelAccessToken}
                                                onChange={(e) => updateNotification('lineChannelAccessToken', e.target.value)}
                                                placeholder="Channel Access Token (Long string ending with =)"
                                                className="w-full px-3 py-2 bg-white border border-gray-200 rounded text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors font-mono"
                                            />
                                            <p className="text-xs text-gray-500 mt-1">ใช้ Channel Access Token จาก LINE Developers Console</p>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Group ID (Target)</label>
                                            <input
                                                type="text"
                                                value={settings.notifications.lineGroupId}
                                                onChange={(e) => updateNotification('lineGroupId', e.target.value)}
                                                placeholder="Cxxxxxxxxxxxxxxxx"
                                                className="w-full px-3 py-2 bg-white border border-gray-200 rounded text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors font-mono"
                                            />
                                        </div>

                                        <div>
                                            <div className="flex justify-between items-center mb-1.5">
                                                <label className="block text-sm font-medium text-gray-700">User IDs (Personal)</label>
                                                <button
                                                    onClick={addLineUserId}
                                                    className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                                                >
                                                    <UserPlus className="w-3 h-3" /> เพิ่ม User ID
                                                </button>
                                            </div>
                                            <div className="space-y-2">
                                                {(settings.notifications.lineUserIds || []).map((userId, index) => (
                                                    <div key={index} className="flex gap-2">
                                                        <input
                                                            type="text"
                                                            value={userId}
                                                            onChange={(e) => updateLineUserId(index, e.target.value)}
                                                            placeholder="Uxxxxxxxxxxxxxxxx"
                                                            className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors font-mono"
                                                        />
                                                        <button
                                                            onClick={() => removeLineUserId(index)}
                                                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                ))}
                                                {(settings.notifications.lineUserIds || []).length === 0 && (
                                                    <p className="text-xs text-gray-400 italic">ไม่มี User ID ที่ระบุ</p>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex justify-start gap-3 pt-2">
                                            <button
                                                onClick={handleSendLineTest}
                                                disabled={sendingLine || !settings.notifications.lineChannelAccessToken || (!settings.notifications.lineGroupId && (!settings.notifications.lineUserIds || settings.notifications.lineUserIds.length === 0))}
                                                className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-sm hover:bg-green-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {sendingLine ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                                Test Send (All Targets)
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'company' && (
                        <div className="bg-white rounded border border-gray-200 p-5 space-y-5">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900">ข้อมูลบริษัท</h2>
                                <p className="text-gray-500 text-sm mt-0.5">ตั้งค่าชื่อบริษัท เลขประจำตัวผู้เสียภาษี และโลโก้</p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">ชื่อบริษัท</label>
                                        <input
                                            type="text"
                                            value={settings.company.name}
                                            onChange={(e) => updateCompany('name', e.target.value)}
                                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">เลขประจำตัวผู้เสียภาษี</label>
                                        <input
                                            type="text"
                                            value={settings.company.taxId}
                                            onChange={(e) => updateCompany('taxId', e.target.value)}
                                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">อัปโหลดโลโก้ (บันทึกเป็น Base64)</label>
                                        <label className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 bg-white border border-blue-200 rounded-sm hover:bg-blue-50 cursor-pointer">
                                            <Upload className="w-4 h-4" />
                                            เลือกรูปภาพ
                                            <input
                                                type="file"
                                                accept="image/*"
                                                className="hidden"
                                                onChange={handleCompanyLogoUpload}
                                            />
                                        </label>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <label className="block text-sm font-medium text-gray-700">ตัวอย่างโลโก้</label>
                                    <div className="h-40 w-full border border-dashed border-gray-300 rounded-sm bg-gray-50 flex items-center justify-center overflow-hidden relative">
                                        {settings.company.logoBase64 ? (
                                            <Image
                                                src={settings.company.logoBase64}
                                                alt="Company logo preview"
                                                fill
                                                unoptimized
                                                sizes="(max-width: 768px) 100vw, 40vw"
                                                className="object-contain"
                                            />
                                        ) : (
                                            <div className="text-gray-400 text-sm text-center px-4">
                                                ยังไม่ได้อัปโหลดโลโก้
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => updateCompany('logoBase64', '')}
                                        className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-sm hover:bg-red-50"
                                        disabled={!settings.company.logoBase64}
                                    >
                                        ลบโลโก้
                                    </button>
                                </div>
                            </div>

                        </div>
                    )}

                    {activeTab === 'system' && (
                        <div className="bg-white rounded border border-gray-200 p-5 space-y-5">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900">ตั้งค่าระบบ</h2>
                                <p className="text-gray-500 text-sm mt-0.5">จัดการข้อมูลและการนำเข้า/ส่งออก</p>
                            </div>

                            {/* Data Management Section */}
                            <div className="space-y-4 pt-4 border-t border-gray-100">
                                <h3 className="font-medium text-gray-900">จัดการข้อมูล (Data Management)</h3>

                                <div className="grid gap-4">
                                    {/* Import */}
                                    <div className="flex items-center justify-between p-4 bg-blue-50/50 rounded-sm border border-blue-100">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-white rounded-sm border border-blue-100 text-blue-600">
                                                <FileSpreadsheet className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-gray-900">Import CSV</p>
                                                <p className="text-xs text-gray-500">นำเข้าข้อมูลโครงการจากไฟล์ .csv</p>
                                            </div>
                                        </div>
                                        <label className={`px-4 py-2 text-sm font-medium text-blue-600 bg-white border border-blue-200 rounded-sm hover:bg-blue-50 cursor-pointer flex items-center gap-2 ${importing ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                            {importing ? 'กำลังนำเข้า...' : 'อัปโหลด CSV'}
                                            <input type="file" accept=".csv" className="hidden" onChange={handleImportFile} disabled={importing} />
                                        </label>
                                    </div>

                                    {/* Export */}
                                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-sm border border-gray-200">
                                        <div>
                                            <p className="text-sm font-medium text-gray-900">Backup / Export Data</p>
                                            <p className="text-xs text-gray-500">ดาวน์โหลดข้อมูลทั้งหมดในระบบ</p>
                                        </div>
                                        <button
                                            onClick={handleExportData}
                                            className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-sm hover:bg-gray-100 flex items-center gap-2"
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
                                            className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-sm hover:bg-gray-50 flex items-center gap-1"
                                        >
                                            <Database className="w-3 h-3" />
                                            + เพิ่มข้อมูลตัวอย่าง
                                        </button>
                                        <button
                                            onClick={handleSeedFullDemoProject}
                                            disabled={seedingFullDemo}
                                            className="px-3 py-1.5 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-sm hover:bg-indigo-50 flex items-center gap-1"
                                        >
                                            <Database className="w-3 h-3" />
                                            {seedingFullDemo ? 'Creating...' : 'Create Full Demo Project'}
                                        </button>
                                        <button
                                            onClick={handleClearData}
                                            disabled={clearing}
                                            className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-sm hover:bg-red-50 flex items-center gap-1 ml-auto"
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
                                    <div className="p-3 bg-gray-50 rounded-sm">
                                        <p className="text-gray-500 text-xs text-center">Projects</p>
                                        <p className="font-bold text-xl text-blue-600 text-center mt-1">{stats.projects}</p>
                                    </div>
                                    <div className="p-3 bg-gray-50 rounded-sm">
                                        <p className="text-gray-500 text-xs text-center">Total Tasks</p>
                                        <p className="font-bold text-xl text-green-600 text-center mt-1">{stats.tasks}</p>
                                    </div>
                                    <div className="p-3 bg-gray-50 rounded-sm">
                                        <p className="text-gray-500 text-xs text-center">Version</p>
                                        <p className="font-medium text-gray-700 text-center mt-2">v1.2.0</p>
                                    </div>
                                    <div className="p-3 bg-gray-50 rounded-sm">
                                        <p className="text-gray-500 text-xs text-center">Status</p>
                                        <p className="font-medium text-green-600 text-center mt-2 flex items-center justify-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500"></span> Online</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Placeholder for other tabs to keep layout intact if user clicks them */}
                    {activeTab !== 'profile' && activeTab !== 'notifications' && activeTab !== 'company' && activeTab !== 'system' && activeTab !== 'members' && (
                        <div className="bg-white rounded border border-gray-200 p-10 flex flex-col items-center text-center text-gray-500">
                            <Settings className="w-10 h-10 mb-4 text-gray-300" />
                            <p>ส่วนนี้ยังไม่เปิดให้แก้ไขในเวอร์ชัน Demo</p>
                        </div>
                    )}

                    {/* Members Tab */}
                    {activeTab === 'members' && (
                        <div className="bg-white rounded border border-gray-200 p-5 space-y-5">
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
                                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-sm hover:bg-blue-700 transition-colors flex items-center gap-2"
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
                                            <div className="w-10 h-10 rounded-sm bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold">
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
                                                className="p-1.5 hover:bg-gray-100 rounded-sm text-gray-400 hover:text-blue-600"
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleRemoveMember(member.id)}
                                                className="p-1.5 hover:bg-gray-100 rounded-sm text-gray-400 hover:text-red-600"
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
                            <div className="bg-white rounded border border-gray-200 shadow-none w-full max-w-md">
                                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                                    <h2 className="text-lg font-semibold text-gray-900">
                                        {editingMember ? 'แก้ไขสมาชิก' : 'เพิ่มสมาชิกใหม่'}
                                    </h2>
                                    <button
                                        onClick={() => {
                                            setIsMemberModalOpen(false);
                                            setEditingMember(null);
                                        }}
                                        className="p-1 hover:bg-gray-100 rounded-sm text-gray-400"
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
                                            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-sm text-sm focus:border-black"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">อีเมล *</label>
                                        <input
                                            type="email"
                                            value={memberForm.email}
                                            onChange={(e) => setMemberForm({ ...memberForm, email: e.target.value })}
                                            placeholder="example@company.com"
                                            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-sm text-sm focus:border-black"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">เบอร์โทร</label>
                                        <input
                                            type="tel"
                                            value={memberForm.phone}
                                            onChange={(e) => setMemberForm({ ...memberForm, phone: e.target.value })}
                                            placeholder="081-234-5678"
                                            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-sm text-sm focus:border-black"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">บทบาท</label>
                                        <select
                                            value={memberForm.role}
                                            onChange={(e) => setMemberForm({ ...memberForm, role: e.target.value as Member['role'] })}
                                            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-sm text-sm focus:border-black"
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
                                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-sm hover:bg-gray-200"
                                        >
                                            ยกเลิก
                                        </button>
                                        <button
                                            onClick={handleAddMember}
                                            disabled={savingMember}
                                            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-sm hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50"
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
            {
                alertDialog.isOpen && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-white rounded-lg border border-gray-200 shadow-none max-w-sm w-full overflow-hidden scale-100 animate-in zoom-in-95 duration-200">
                            <div className="p-6 text-center">
                                <div className={`w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center ${alertDialog.type === 'error' ? 'bg-red-100 text-red-600' :
                                    alertDialog.type === 'success' ? 'bg-green-100 text-green-600' :
                                        alertDialog.type === 'confirm' ? 'bg-blue-100 text-blue-600' :
                                            'bg-gray-100 text-gray-600'
                                    }`}>
                                    {alertDialog.type === 'error' && <AlertTriangle className="w-6 h-6" />}
                                    {alertDialog.type === 'success' && <CheckCircle2 className="w-6 h-6" />}
                                    {(alertDialog.type === 'confirm' || alertDialog.type === 'info') && <Info className="w-6 h-6" />}
                                    {alertDialog.type === 'warning' && <AlertTriangle className="w-6 h-6" />}
                                </div>

                                <h3 className="text-lg font-bold text-gray-900 mb-2">
                                    {alertDialog.title}
                                </h3>
                                <p className="text-sm text-gray-500 mb-6 whitespace-pre-line">
                                    {alertDialog.message}
                                </p>

                                <div className="flex gap-3 justify-center">
                                    {(alertDialog.type === 'confirm' || alertDialog.type === 'warning') && (
                                        <button
                                            onClick={alertDialog.onCancel}
                                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                                        >
                                            ยกเลิก
                                        </button>
                                    )}
                                    <button
                                        onClick={alertDialog.onConfirm}
                                        className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${alertDialog.type === 'error' ? 'bg-red-600 hover:bg-red-700' :
                                            alertDialog.type === 'success' ? 'bg-green-600 hover:bg-green-700' :
                                                alertDialog.type === 'warning' ? 'bg-orange-500 hover:bg-orange-600' :
                                                    'bg-black hover:bg-gray-800'
                                            }`}
                                    >
                                        ตกลง
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
