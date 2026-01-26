'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    ArrowLeft,
    Building2,
    Calendar,
    TrendingUp,
    Clock,
    CheckCircle2,
    AlertTriangle,
    Plus,
    Edit2,
    Trash2,
    Loader2,
    ListTodo,
    Target,
    X,
    ChevronDown,
    ChevronRight,
    Layers,
    FolderOpen,
    Info,
    Download,
    Upload,
} from 'lucide-react';
import { format, parseISO, differenceInDays, addDays } from 'date-fns';
import { Project, Task, Member } from '@/types/construction';
import { getProject, getTasks, createTask, updateTask, deleteTask, getMembers, syncGroupProgress, batchCreateTasks, deleteAllTasks } from '@/lib/firestore';
import { useAuth } from '@/contexts/AuthContext';

// Helper: Format date to Thai format
const formatDateTH = (dateStr: string | undefined | null) => {
    if (!dateStr) return '-';
    try {
        const date = parseISO(dateStr);
        return format(date, 'dd/MM/yy');
    } catch {
        return '-';
    }
};

// Helper: Calculate duration in days
const calcDuration = (start: string, end: string) => {
    if (!start || !end) return 0;
    try {
        return differenceInDays(parseISO(end), parseISO(start)) + 1;
    } catch {
        return 0;
    }
};

export default function ProjectDetailPage() {
    const { user } = useAuth();
    const params = useParams();
    const router = useRouter();
    const projectId = params.id as string;

    // Data State
    const [project, setProject] = useState<Project | null>(null);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [members, setMembers] = useState<Member[]>([]);
    const [loading, setLoading] = useState(true);

    // UI State
    const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
    const [collapsedSubcategories, setCollapsedSubcategories] = useState<Set<string>>(new Set());

    // Form Expansion State
    const [showSubcategory, setShowSubcategory] = useState(false);
    const [showSubSubcategory, setShowSubSubcategory] = useState(false);

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTask, setEditingTask] = useState<Task | null>(null);
    const [saving, setSaving] = useState(false);

    // Form State
    const [taskForm, setTaskForm] = useState({
        category: '',
        subcategory: '',
        subsubcategory: '',
        name: '',
        cost: 0,
        quantity: '',
        planStartDate: '',
        planEndDate: '',
        planDuration: 0,
        progress: 0,
        responsible: '',
    });

    // Progress Modal
    const [isProgressModalOpen, setIsProgressModalOpen] = useState(false);
    const [progressForm, setProgressForm] = useState({
        taskId: '',
        taskName: '',
        newProgress: 0,
        updateDate: new Date().toISOString().split('T')[0],
        actualStartDate: '',
        actualEndDate: '',
    });
    const [savingProgress, setSavingProgress] = useState(false);

    // Alert Dialog
    const [alertDialog, setAlertDialog] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        type: 'info' | 'confirm' | 'error';
        onConfirm?: () => void;
    }>({ isOpen: false, title: '', message: '', type: 'info' });

    // Fetch Data
    useEffect(() => {
        if (projectId) fetchData();
    }, [projectId]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [projectData, tasksData, membersData] = await Promise.all([
                getProject(projectId),
                getTasks(projectId),
                getMembers()
            ]);
            setProject(projectData);
            setTasks(tasksData);
            setMembers(membersData);
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    };

    // ===========================================
    // HIERARCHICAL DATA STRUCTURE
    // ===========================================
    // ===========================================
    // HIERARCHICAL DATA STRUCTURE (LEVEL 1 > 2 > 3)
    // ===========================================
    const hierarchicalData = useMemo(() => {
        const structure: Record<string, {
            tasks: Task[]; // Direct tasks in Category
            subcategories: Record<string, {
                tasks: Task[]; // Direct tasks in Subcategory
                subsubcategories: Record<string, Task[]>; // Level 3
            }>;
            stats: {
                totalCost: number;
                totalDuration: number;
                weightedProgress: number;
                minStartDate: string;
                maxEndDate: string;
            }
        }> = {};

        tasks.forEach(task => {
            const cat = task.category || 'ไม่ระบุหมวดหมู่';
            const subcat = task.subcategory || '';
            const subsubcat = task.subsubcategory || '';

            // Init Category
            if (!structure[cat]) {
                structure[cat] = {
                    tasks: [],
                    subcategories: {},
                    stats: { totalCost: 0, totalDuration: 0, weightedProgress: 0, minStartDate: '', maxEndDate: '' }
                };
            }

            if (subcat) {
                // Init Subcategory
                if (!structure[cat].subcategories[subcat]) {
                    structure[cat].subcategories[subcat] = {
                        tasks: [],
                        subsubcategories: {}
                    };
                }

                if (subsubcat) {
                    // Level 3
                    if (!structure[cat].subcategories[subcat].subsubcategories[subsubcat]) {
                        structure[cat].subcategories[subcat].subsubcategories[subsubcat] = [];
                    }
                    structure[cat].subcategories[subcat].subsubcategories[subsubcat].push(task);
                } else {
                    // Level 2 direct task
                    structure[cat].subcategories[subcat].tasks.push(task);
                }
            } else {
                // Level 1 direct task
                structure[cat].tasks.push(task);
            }
        });

        // Calculate Stats Recursive Helper
        const calcStats = (taskList: Task[]) => {
            let cost = 0;
            let duration = 0;
            let weighted = 0;
            let minStart = '';
            let maxEnd = '';

            taskList.forEach(t => {
                const d = t.planDuration || calcDuration(t.planStartDate, t.planEndDate);
                const p = t.progress || 0;
                cost += t.cost || 0;
                duration += d;
                weighted += d * p;

                if (t.planStartDate) {
                    if (!minStart || t.planStartDate < minStart) minStart = t.planStartDate;
                }
                if (t.planEndDate) {
                    if (!maxEnd || t.planEndDate > maxEnd) maxEnd = t.planEndDate;
                }
            });
            return { cost, duration, weighted, minStart, maxEnd };
        };

        // Aggregate Stats for Categories
        Object.keys(structure).forEach(cat => {
            const catData = structure[cat];
            let allTasks: Task[] = [...catData.tasks];

            Object.values(catData.subcategories).forEach(sub => {
                allTasks = [...allTasks, ...sub.tasks];
                Object.values(sub.subsubcategories).forEach(subsubTasks => {
                    allTasks = [...allTasks, ...subsubTasks];
                });
            });

            const stats = calcStats(allTasks);
            catData.stats = {
                totalCost: stats.cost,
                totalDuration: stats.duration,
                weightedProgress: stats.duration > 0 ? stats.weighted / stats.duration : 0,
                minStartDate: stats.minStart,
                maxEndDate: stats.maxEnd
            };
        });

        return structure;
    }, [tasks]);

    // Calculate subcategory aggregates
    const getSubcategoryStats = (subTasks: Task[]) => {
        let totalCost = 0;
        let totalDuration = 0;
        let weightedProgress = 0;
        let minStart = '';
        let maxEnd = '';

        subTasks.forEach(t => {
            const dur = t.planDuration || calcDuration(t.planStartDate, t.planEndDate);
            totalCost += t.cost || 0;
            totalDuration += dur;
            weightedProgress += dur * (t.progress || 0);

            // Update date range
            if (t.planStartDate) {
                if (!minStart || t.planStartDate < minStart) minStart = t.planStartDate;
            }
            if (t.planEndDate) {
                if (!maxEnd || t.planEndDate > maxEnd) maxEnd = t.planEndDate;
            }
        });

        return {
            totalCost,
            totalDuration,
            avgProgress: totalDuration > 0 ? weightedProgress / totalDuration : 0,
            minStartDate: minStart,
            maxEndDate: maxEnd
        };
    };

    // Project Stats
    const projectStats = useMemo(() => {
        const total = tasks.length;
        const completed = tasks.filter(t => t.status === 'completed').length;
        const inProgress = tasks.filter(t => t.status === 'in-progress').length;
        const notStarted = tasks.filter(t => t.status === 'not-started').length;

        let totalDuration = 0;
        let weightedProgress = 0;
        let totalCost = 0;

        tasks.forEach(t => {
            const dur = t.planDuration || calcDuration(t.planStartDate, t.planEndDate);
            totalDuration += dur;
            weightedProgress += dur * (t.progress || 0);
            totalCost += t.cost || 0;
        });

        return {
            total,
            completed,
            inProgress,
            notStarted,
            totalCost,
            overallProgress: totalDuration > 0 ? weightedProgress / totalDuration : 0
        };
    }, [tasks]);

    // ===========================================
    // HANDLERS
    // ===========================================

    const toggleCategory = (cat: string) => {
        setCollapsedCategories(prev => {
            const next = new Set(prev);
            if (next.has(cat)) next.delete(cat);
            else next.add(cat);
            return next;
        });
    };

    const toggleSubcategory = (key: string) => {
        setCollapsedSubcategories(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const openCreateModal = (initialCategory = '', initialSubcategory = '', initialSubSubcategory = '') => {
        setEditingTask(null);
        setTaskForm({
            category: initialCategory,
            subcategory: initialSubcategory,
            subsubcategory: initialSubSubcategory,
            name: '',
            cost: 0,
            quantity: '',
            planStartDate: project?.startDate || new Date().toISOString().split('T')[0],
            planEndDate: project?.endDate || '',
            progress: 0,
            responsible: '',
            planDuration: 1
        });
        setIsModalOpen(true);
        setShowSubcategory(!!initialSubcategory);
        setShowSubSubcategory(!!initialSubSubcategory);
    };

    const openEditModal = (task: Task) => {
        setEditingTask(task);
        setTaskForm({
            category: task.category || '',
            subcategory: (task as any).subcategory || '',
            subsubcategory: (task as any).subsubcategory || '',
            name: task.name || '',
            cost: task.cost || 0,
            quantity: task.quantity || '',
            planStartDate: task.planStartDate || '',
            planEndDate: task.planEndDate || '',
            progress: task.progress || 0,
            responsible: task.responsible || '',
            planDuration: task.planDuration || (task.planStartDate && task.planEndDate ? differenceInDays(parseISO(task.planEndDate), parseISO(task.planStartDate)) + 1 : 1)
        });
        setIsModalOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!taskForm.name || !taskForm.category) {
            alert('กรุณากรอกชื่องานและหมวดหมู่');
            return;
        }

        setSaving(true);
        try {
            const duration = calcDuration(taskForm.planStartDate, taskForm.planEndDate);
            let status: Task['status'] = 'not-started';
            if (taskForm.progress === 100) status = 'completed';
            else if (taskForm.progress > 0) status = 'in-progress';

            const taskData = {
                projectId,
                category: taskForm.category,
                subcategory: taskForm.subcategory,
                subsubcategory: taskForm.subsubcategory,
                name: taskForm.name,
                cost: taskForm.cost,
                quantity: taskForm.quantity,
                planStartDate: taskForm.planStartDate,
                planEndDate: taskForm.planEndDate,
                planDuration: duration,
                progress: taskForm.progress,
                responsible: taskForm.responsible,
                status,
                type: 'task' as const,
            };

            if (editingTask) {
                await updateTask(editingTask.id, taskData);
            } else {
                const maxOrder = tasks.reduce((max, t) => Math.max(max, t.order || 0), 0);
                await createTask({ ...taskData, order: maxOrder + 1 });
            }

            setIsModalOpen(false);
            await fetchData();
        } catch (error) {
            console.error('Error saving task:', error);
            alert('เกิดข้อผิดพลาดในการบันทึก');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = (task: Task) => {
        setAlertDialog({
            isOpen: true,
            title: 'ยืนยันการลบ',
            message: `ต้องการลบงาน "${task.name}" หรือไม่?`,
            type: 'confirm',
            onConfirm: async () => {
                try {
                    await deleteTask(task.id);
                    await fetchData();
                    setAlertDialog(prev => ({ ...prev, isOpen: false }));
                } catch (error) {
                    console.error('Error deleting task:', error);
                    alert('ไม่สามารถลบงานได้');
                }
            }
        });
    };

    const handleDeleteAllTasks = () => {
        if (tasks.length === 0) return;
        setAlertDialog({
            isOpen: true,
            title: 'ยืนยันการลบทั้งหมด',
            message: `คุณแน่ใจหรือไม่ที่จะลบงานทั้งหมด ${tasks.length} รายการ? การกระทำนี้ไม่สามารถย้อนกลับได้`,
            type: 'confirm',
            onConfirm: async () => {
                try {
                    setLoading(true);
                    await deleteAllTasks(projectId);
                    await fetchData();
                    setAlertDialog(prev => ({ ...prev, isOpen: false }));
                    alert('ลบข้อมูลเรียบร้อยแล้ว');
                } catch (error) {
                    console.error('Error deleting all tasks:', error);
                    alert('ไม่สามารถลบข้อมูลได้');
                } finally {
                    setLoading(false);
                }
            }
        });
    };

    const handleExport = () => {
        // Create CSV Content
        const headers = [
            'Category',
            'Subcategory',
            'SubSubcategory',
            'Name',
            'Cost',
            'Quantity',
            'PlanStartDate',
            'PlanEndDate',
            'PlanDuration',
            'Progress',
            'Status',
            'Responsible'
        ];

        // Map tasks to rows with quote escaping
        const rows = tasks.map(t => [
            `"${(t.category || '').replace(/"/g, '""')}"`,
            `"${(t.subcategory || '').replace(/"/g, '""')}"`,
            `"${(t.subsubcategory || '').replace(/"/g, '""')}"`,
            `"${(t.name || '').replace(/"/g, '""')}"`,
            `${t.cost || 0}`,
            `"${(t.quantity || '').replace(/"/g, '""')}"`,
            `"${t.planStartDate || ''}"`,
            `"${t.planEndDate || ''}"`,
            `${t.planDuration || 0}`,
            `${t.progress || 0}`,
            `"${t.status || 'not-started'}"`,
            `"${(t.responsible || '').replace(/"/g, '""')}"`
        ]);

        // Add BOM for Excel Thai support and join rows
        const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

        // Trigger download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `project-${project?.name || 'tasks'}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                let text = event.target?.result as string;
                if (!text) return;

                // Remove BOM if present
                text = text.replace(/^\uFEFF/, '');

                // Split lines and remove carriage returns
                const lines = text.split('\n').map(line => line.replace(/\r/g, ''));
                if (lines.length < 2) throw new Error('No data found');

                console.log('📊 CSV Import - Total lines:', lines.length);
                console.log('📋 Header:', lines[0]);

                // CSV Line Parser
                const parseCSVLine = (line: string) => {
                    const result = [];
                    let start = 0;
                    let underQuote = false;
                    for (let i = 0; i < line.length; i++) {
                        if (line[i] === '"') underQuote = !underQuote;
                        else if (line[i] === ',' && !underQuote) {
                            result.push(line.slice(start, i).replace(/^"|"$/g, '').trim());
                            start = i + 1;
                        }
                    }
                    result.push(line.slice(start).replace(/^"|"$/g, '').trim());
                    return result;
                };

                // Helper: Parse date in various formats
                const parseDate = (dateStr: string): string => {
                    if (!dateStr || dateStr.trim() === '') return '';

                    const cleaned = dateStr.trim();

                    // Already in YYYY-MM-DD format
                    if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
                        return cleaned;
                    }

                    // DD/MM/YYYY format
                    if (/^\d{2}\/\d{2}\/\d{4}$/.test(cleaned)) {
                        const [day, month, year] = cleaned.split('/');
                        return `${year}-${month}-${day}`;
                    }

                    // DD/MM/YY format (assume 20xx)
                    if (/^\d{2}\/\d{2}\/\d{2}$/.test(cleaned)) {
                        const [day, month, year] = cleaned.split('/');
                        const fullYear = parseInt(year) < 50 ? `20${year}` : `19${year}`;
                        return `${fullYear}-${month}-${day}`;
                    }

                    console.warn('⚠️ Unknown date format:', cleaned);
                    return cleaned; // Return as-is if format unknown
                };

                const newTasks: any[] = [];
                // Process rows (skip header)
                for (let i = 1; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line) continue;

                    const cols = parseCSVLine(line);

                    // Skip instruction row (check if first column contains Thai instruction text)
                    if (i === 1 && cols[0] && cols[0].includes('หมวดหมู่')) {
                        console.log('⏭️ Skipping instruction row');
                        continue;
                    }

                    // Debug first data row
                    if (newTasks.length === 0) {
                        console.log('📝 First data row columns:', cols.length);
                        console.log('📅 Date columns - Start:', cols[6], 'End:', cols[7]);
                    }

                    // Minimal check: Category, Name, Cost must exist roughly (at least 5 columns)
                    if (cols.length < 5) {
                        console.warn(`⚠️ Row ${i} skipped - insufficient columns:`, cols.length);
                        continue;
                    }

                    const planStartDate = parseDate(cols[6]);
                    const planEndDate = parseDate(cols[7]);
                    const planDuration = cols[8] ? parseFloat(cols[8]) : (planStartDate && planEndDate ? calcDuration(planStartDate, planEndDate) : 0);

                    const task = {
                        category: cols[0] || 'Uncategorized',
                        subcategory: cols[1] || '',
                        subsubcategory: cols[2] || '',
                        name: cols[3],
                        cost: parseFloat(cols[4]) || 0,
                        quantity: cols[5] || '',
                        planStartDate,
                        planEndDate,
                        planDuration,
                        progress: parseFloat(cols[9]) || 0,
                        status: (cols[10] || 'not-started') as Task['status'],
                        responsible: cols[11] || '',
                        type: 'task',
                        order: i // Preserve order from CSV
                    };

                    newTasks.push(task);

                    // Debug first task
                    if (newTasks.length === 1) {
                        console.log('✅ First task parsed:', task);
                    }
                }

                console.log(`📦 Total tasks to import: ${newTasks.length}`);

                if (newTasks.length > 0) {
                    await batchCreateTasks(projectId, newTasks);
                    await fetchData();
                    alert(`นำเข้าข้อมูลสำเร็จ ${newTasks.length} รายการ`);
                } else {
                    alert('ไม่พบข้อมูลที่ถูกต้องในไฟล์');
                }
            } catch (error) {
                console.error('❌ Import error:', error);
                alert('เกิดข้อผิดพลาดในการนำเข้าข้อมูล: ' + (error as Error).message);
            }
        };
        reader.readAsText(file);
    };

    const handleDownloadTemplate = () => {
        const headers = [
            'Category',
            'Subcategory',
            'SubSubcategory',
            'Name',
            'Cost',
            'Quantity',
            'PlanStartDate',
            'PlanEndDate',
            'PlanDuration',
            'Progress',
            'Status',
            'Responsible'
        ];

        // Add instruction row
        const instructionRow = [
            'หมวดหมู่',
            'หมวดหมู่ย่อย',
            'หมวดหมู่ย่อยระดับ 3',
            'ชื่องาน',
            'ค่าใช้จ่าย (ตัวเลข)',
            'จำนวน',
            'วันเริ่มต้น (YYYY-MM-DD, DD/MM/YYYY, DD/MM/YY)',
            'วันสิ้นสุด (YYYY-MM-DD, DD/MM/YYYY, DD/MM/YY)',
            'ระยะเวลา (วัน)',
            'ความคืบหน้า (0-100)',
            'สถานะ (not-started, in-progress, completed)',
            'ผู้รับผิดชอบ'
        ];

        const sampleRows = [
            ['งานเตรียมการ', '', '', 'งานเขียนแบบและตรวจสร้าง', '50000', '1', '2024-09-01', '2024-09-15', '15', '100', 'completed', 'วิศวกร ก.'],
            ['งานเตรียมการ', '', '', 'งานเตรียมการในการก่อสร้าง', '30000', '1', '2024-09-16', '2024-09-30', '15', '80', 'in-progress', 'วิศวกร ข.'],
            ['งานรั้ว Area 1', 'งานรั้วชั่วคราว', '', 'Fence type F (No.123-144)', '120000', '22', '2024-10-01', '2024-10-31', '31', '50', 'in-progress', 'ช่าง ค.'],
            ['งานรั้ว Area 1', 'งานรั้วชั่วคราว', 'งานฐานราก', 'เทคอนกรีตฐานราก', '45000', '100 ตร.ม.', '2024-10-01', '2024-10-10', '10', '0', 'not-started', 'ช่าง ง.']
        ];

        const csvContent = '\uFEFF' + [
            headers.join(','),
            instructionRow.map(cell => `"${cell}"`).join(','),
            ...sampleRows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', 'template-import.csv');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const openProgressModal = (task: Task) => {
        setProgressForm({
            taskId: task.id,
            taskName: task.name,
            newProgress: task.progress,
            updateDate: new Date().toISOString().split('T')[0],
            actualStartDate: task.actualStartDate || '',
            actualEndDate: task.actualEndDate || '',
        });
        setIsProgressModalOpen(true);
    };

    const handleProgressSubmit = async () => {
        if (!progressForm.taskId) return;

        setSavingProgress(true);
        try {
            let status: Task['status'] = 'not-started';
            if (progressForm.newProgress === 100) status = 'completed';
            else if (progressForm.newProgress > 0) status = 'in-progress';

            await updateTask(progressForm.taskId, {
                progress: progressForm.newProgress,
                progressUpdatedAt: progressForm.updateDate,
                actualStartDate: progressForm.actualStartDate || undefined,
                actualEndDate: progressForm.actualEndDate || undefined,
                status
            });

            setIsProgressModalOpen(false);
            await fetchData();
        } catch (error) {
            console.error('Error updating progress:', error);
            alert('เกิดข้อผิดพลาด');
        } finally {
            setSavingProgress(false);
        }
    };

    // Get unique categories/subcategories for datalist
    const existingCategories = useMemo(() => [...new Set(tasks.map(t => t.category).filter(Boolean))], [tasks]);
    const existingSubcategories = useMemo(() => [...new Set(tasks.map(t => (t as any).subcategory).filter(Boolean))], [tasks]);

    // Status Badge
    const getStatusBadge = (status: string) => {
        const configs: Record<string, { class: string; label: string }> = {
            'completed': { class: 'bg-green-100 text-green-700', label: 'เสร็จสิ้น' },
            'in-progress': { class: 'bg-blue-100 text-blue-700', label: 'กำลังดำเนินการ' },
            'not-started': { class: 'bg-gray-100 text-gray-600', label: 'ยังไม่เริ่ม' },
            'delayed': { class: 'bg-red-100 text-red-700', label: 'ล่าช้า' },
        };
        const config = configs[status] || configs['not-started'];
        return <span className={`px-2 py-0.5 rounded text-xs font-medium ${config.class}`}>{config.label}</span>;
    };

    // Progress Bar Component
    const ProgressBar = ({ value, size = 'sm' }: { value: number; size?: 'sm' | 'md' }) => {
        const height = size === 'sm' ? 'h-1.5' : 'h-2';
        const color = value === 100 ? 'bg-green-500' : value >= 50 ? 'bg-blue-500' : value > 0 ? 'bg-amber-500' : 'bg-gray-300';
        return (
            <div className={`w-full ${height} bg-gray-200 rounded-full overflow-hidden`}>
                <div className={`${height} ${color} rounded-full transition-all`} style={{ width: `${Math.min(100, value)}%` }} />
            </div>
        );
    };

    // ===========================================
    // RENDER
    // ===========================================

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                <span className="ml-3 text-gray-600">กำลังโหลดข้อมูล...</span>
            </div>
        );
    }

    if (!project) {
        return (
            <div className="text-center py-20">
                <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                <p className="text-gray-600">ไม่พบโครงการ</p>
                <Link href="/projects" className="text-blue-600 hover:underline mt-2 inline-block">กลับไปหน้าโครงการ</Link>
            </div>
        );
    }

    const canEdit = ['admin', 'project_manager'].includes(user?.role || '');
    const canUpdateProgress = ['admin', 'project_manager', 'engineer'].includes(user?.role || '');

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/projects" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                        <ArrowLeft className="w-5 h-5 text-gray-600" />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
                        <p className="text-sm text-gray-500 mt-0.5">{project.description || 'ไม่มีคำอธิบาย'}</p>
                    </div>
                </div>
                {canEdit && (
                    <div className="flex gap-2">
                        <button
                            onClick={handleDeleteAllTasks}
                            className="px-3 py-2 bg-red-50 border border-red-200 text-red-600 rounded-lg hover:bg-red-100 transition-colors flex items-center gap-2 text-sm font-medium"
                            title="ลบงานทั้งหมด"
                        >
                            <Trash2 className="w-4 h-4" />
                            ลบทั้งหมด
                        </button>
                        <button
                            onClick={handleExport}
                            className="px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2 text-sm font-medium"
                            title="Export to CSV"
                        >
                            <Download className="w-4 h-4" />
                            Export
                        </button>
                        <button
                            onClick={handleDownloadTemplate}
                            className="px-3 py-2 bg-green-50 border border-green-200 text-green-700 rounded-lg hover:bg-green-100 transition-colors flex items-center gap-2 text-sm font-medium"
                            title="ดาวน์โหลดตัวอย่าง CSV"
                        >
                            <Download className="w-4 h-4" />
                            ตัวอย่าง CSV
                        </button>
                        <label className="px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2 text-sm font-medium cursor-pointer">
                            <Upload className="w-4 h-4" />
                            Import
                            <input type="file" accept=".csv" onChange={handleImport} className="hidden" />
                        </label>
                        <button
                            onClick={() => openCreateModal()}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm font-medium"
                        >
                            <Plus className="w-4 h-4" />
                            เพิ่มงานใหม่
                        </button>
                    </div>
                )}
            </div>

            {/* Project Overview Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                            <Target className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                            <p className="text-xs text-gray-500">ความคืบหน้า</p>
                            <p className="text-xl font-bold text-gray-900">{projectStats.overallProgress.toFixed(1)}%</p>
                        </div>
                    </div>
                    <div className="mt-3">
                        <ProgressBar value={projectStats.overallProgress} size="md" />
                    </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                            <CheckCircle2 className="w-5 h-5 text-green-600" />
                        </div>
                        <div>
                            <p className="text-xs text-gray-500">เสร็จสิ้น</p>
                            <p className="text-xl font-bold text-gray-900">{projectStats.completed}/{projectStats.total}</p>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                            <Clock className="w-5 h-5 text-amber-600" />
                        </div>
                        <div>
                            <p className="text-xs text-gray-500">กำลังดำเนินการ</p>
                            <p className="text-xl font-bold text-gray-900">{projectStats.inProgress}</p>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                            <TrendingUp className="w-5 h-5 text-purple-600" />
                        </div>
                        <div>
                            <p className="text-xs text-gray-500">งบประมาณรวม</p>
                            <p className="text-xl font-bold text-gray-900">{projectStats.totalCost.toLocaleString()}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Task Table */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                    <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                        <ListTodo className="w-5 h-5 text-blue-600" />
                        รายการงาน ({tasks.length} รายการ)
                    </h2>
                </div>

                {tasks.length === 0 ? (
                    <div className="p-12 text-center">
                        <ListTodo className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500 mb-4">ยังไม่มีงานในโครงการนี้</p>
                        {canEdit && (
                            <button onClick={() => openCreateModal()} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
                                เพิ่มงานแรก
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase w-1/3">ชื่องาน</th>
                                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">วันที่แผน</th>
                                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Cost</th>
                                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Q'ty</th>
                                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase w-32">Progress</th>
                                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">สถานะ</th>
                                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase w-28">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {Object.entries(hierarchicalData).map(([category, catData]) => {
                                    const isCatCollapsed = collapsedCategories.has(category);

                                    // Count total items for badge
                                    let totalItems = catData.tasks.length;
                                    Object.values(catData.subcategories).forEach(s => {
                                        totalItems += s.tasks.length;
                                        Object.values(s.subsubcategories).forEach(ss => totalItems += ss.length);
                                    });

                                    return (
                                        <React.Fragment key={category}>
                                            {/* Level 1: Category Row */}
                                            <tr className="bg-blue-50/50 hover:bg-blue-50 cursor-pointer" onClick={() => toggleCategory(category)}>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        {isCatCollapsed ? <ChevronRight className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                                                        <Layers className="w-4 h-4 text-blue-600" />
                                                        <span className="font-semibold text-gray-900">{category}</span>
                                                        <span className="text-xs text-gray-500">({totalItems} รายการ)</span>
                                                        {canEdit && (
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    openCreateModal(category);
                                                                }}
                                                                className="ml-2 p-1 text-blue-600 hover:bg-blue-100 rounded-full transition-colors"
                                                                title="เพิ่มงานในหมวดนี้"
                                                            >
                                                                <Plus className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-center text-xs text-gray-600">
                                                    {catData.stats.minStartDate ? `${formatDateTH(catData.stats.minStartDate)} - ${formatDateTH(catData.stats.maxEndDate)}` : '-'}
                                                </td>
                                                <td className="px-4 py-3 text-center text-sm font-medium text-gray-900">{catData.stats.totalCost.toLocaleString()}</td>
                                                <td className="px-4 py-3 text-center text-sm text-gray-600">-</td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2 justify-center">
                                                        <div className="w-16"><ProgressBar value={catData.stats.weightedProgress} /></div>
                                                        <span className="text-sm font-medium text-gray-700">{catData.stats.weightedProgress.toFixed(0)}%</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-center">-</td>
                                                <td className="px-4 py-3 text-center">-</td>
                                            </tr>

                                            {/* Level 1 Content */}
                                            {!isCatCollapsed && (
                                                <>
                                                    {Object.entries(catData.subcategories).map(([subcat, subData]) => {
                                                        const subKey = `${category}::${subcat}`;
                                                        const isSubCollapsed = collapsedSubcategories.has(subKey);

                                                        // Calculate sub-stats
                                                        const subAllTasks = [...subData.tasks, ...Object.values(subData.subsubcategories).flat()];
                                                        const subStats = getSubcategoryStats(subAllTasks);

                                                        return (
                                                            <React.Fragment key={subKey}>
                                                                {/* Level 2: Subcategory Row */}
                                                                <tr className="bg-gray-50/50 hover:bg-gray-100 cursor-pointer" onClick={() => toggleSubcategory(subKey)}>
                                                                    <td className="px-4 py-2.5 pl-10">
                                                                        <div className="flex items-center gap-2">
                                                                            {isSubCollapsed ? <ChevronRight className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                                                                            <FolderOpen className="w-4 h-4 text-amber-500" />
                                                                            <span className="font-medium text-gray-800">{subcat}</span>
                                                                            <span className="text-xs text-gray-400">({subAllTasks.length})</span>
                                                                            {canEdit && (
                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        openCreateModal(category, subcat);
                                                                                    }}
                                                                                    className="ml-2 p-1 text-blue-600 hover:bg-blue-100 rounded-full transition-colors"
                                                                                    title="เพิ่มงานในหมวดย่อยนี้"
                                                                                >
                                                                                    <Plus className="w-3 h-3" />
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-4 py-2.5 text-center text-xs text-gray-500">
                                                                        {subStats.minStartDate ? `${formatDateTH(subStats.minStartDate)} - ${formatDateTH(subStats.maxEndDate)}` : '-'}
                                                                    </td>
                                                                    <td className="px-4 py-2.5 text-center text-sm font-medium text-gray-700">{subStats.totalCost.toLocaleString()}</td>
                                                                    <td className="px-4 py-2.5 text-center text-sm text-gray-500">-</td>
                                                                    <td className="px-4 py-2.5">
                                                                        <div className="flex items-center gap-2 justify-center">
                                                                            <div className="w-16"><ProgressBar value={subStats.avgProgress} /></div>
                                                                            <span className="text-sm text-gray-600">{subStats.avgProgress.toFixed(0)}%</span>
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-4 py-2.5 text-center">-</td>
                                                                    <td className="px-4 py-2.5 text-center">-</td>
                                                                </tr>

                                                                {/* Level 2 Content */}
                                                                {!isSubCollapsed && (
                                                                    <>
                                                                        {/* Level 3: Sub-subcategories */}
                                                                        {Object.entries(subData.subsubcategories).map(([subsub, tasks]) => (
                                                                            <React.Fragment key={subsub}>
                                                                                <tr className="hover:bg-gray-50/80">
                                                                                    <td className="px-4 py-2 pl-16">
                                                                                        <div className="flex items-center gap-2">
                                                                                            <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                                                                                            <span className="text-sm font-medium text-gray-700">{subsub}</span>
                                                                                            <span className="text-xs text-gray-400">({tasks.length})</span>
                                                                                            {canEdit && (
                                                                                                <button
                                                                                                    onClick={(e) => {
                                                                                                        e.stopPropagation();
                                                                                                        openCreateModal(category, subcat, subsub);
                                                                                                    }}
                                                                                                    className="ml-2 p-1 text-blue-600 hover:bg-blue-100 rounded-full transition-colors"
                                                                                                    title="เพิ่มงานในกลุ่มนี้"
                                                                                                >
                                                                                                    <Plus className="w-3 h-3" />
                                                                                                </button>
                                                                                            )}
                                                                                        </div>
                                                                                    </td>
                                                                                    {(() => {
                                                                                        const subSubStats = getSubcategoryStats(tasks);
                                                                                        return (
                                                                                            <>
                                                                                                <td className="px-4 py-2 text-center text-xs text-gray-500">
                                                                                                    {subSubStats.minStartDate ? `${formatDateTH(subSubStats.minStartDate)} - ${formatDateTH(subSubStats.maxEndDate)}` : '-'}
                                                                                                </td>
                                                                                                <td className="px-4 py-2 text-center text-sm font-medium text-gray-600">{subSubStats.totalCost.toLocaleString()}</td>
                                                                                                <td className="px-4 py-2 text-center text-sm text-gray-500">-</td>
                                                                                                <td className="px-4 py-2">
                                                                                                    <div className="flex items-center gap-2 justify-center">
                                                                                                        <div className="w-12"><ProgressBar value={subSubStats.avgProgress} /></div>
                                                                                                        <span className="text-xs text-gray-500">{subSubStats.avgProgress.toFixed(0)}%</span>
                                                                                                    </div>
                                                                                                </td>
                                                                                                <td className="px-4 py-2 text-center">-</td>
                                                                                                <td className="px-4 py-2 text-center">-</td>
                                                                                            </>
                                                                                        );
                                                                                    })()}
                                                                                </tr>
                                                                                {tasks.map(task => (
                                                                                    <tr key={task.id} className="hover:bg-gray-50">
                                                                                        <td className="px-4 py-2 pl-24 border-l-2 border-transparent hover:border-blue-200">
                                                                                            <span className="text-sm text-gray-600">{task.name}</span>
                                                                                        </td>
                                                                                        <td className="px-4 py-2 text-center text-xs text-gray-500">{formatDateTH(task.planStartDate)} - {formatDateTH(task.planEndDate)}</td>
                                                                                        <td className="px-4 py-2 text-center text-sm text-gray-600">{task.cost?.toLocaleString()}</td>
                                                                                        <td className="px-4 py-2 text-center text-sm text-gray-500">{task.quantity}</td>
                                                                                        <td className="px-4 py-2">
                                                                                            <div className="flex items-center gap-2 justify-center">
                                                                                                <div className="w-12"><ProgressBar value={task.progress} /></div>
                                                                                                <span className="text-xs text-gray-500">{task.progress}%</span>
                                                                                            </div>
                                                                                        </td>
                                                                                        <td className="px-4 py-2 text-center">{getStatusBadge(task.status)}</td>
                                                                                        <td className="px-4 py-2">
                                                                                            <div className="flex items-center justify-center gap-1">
                                                                                                {canUpdateProgress && <button onClick={() => openProgressModal(task)} className="p-1 text-blue-600 hover:bg-blue-50 rounded"><TrendingUp className="w-4 h-4" /></button>}
                                                                                                {canEdit && (
                                                                                                    <>
                                                                                                        <button onClick={() => openEditModal(task)} className="p-1 text-gray-500 hover:bg-gray-100 rounded"><Edit2 className="w-4 h-4" /></button>
                                                                                                        <button onClick={() => handleDelete(task)} className="p-1 text-red-500 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4" /></button>
                                                                                                    </>
                                                                                                )}
                                                                                            </div>
                                                                                        </td>
                                                                                    </tr>
                                                                                ))}
                                                                            </React.Fragment>
                                                                        ))}

                                                                        {/* Level 2 Direct Tasks */}
                                                                        {subData.tasks.map(task => (
                                                                            <tr key={task.id} className="hover:bg-gray-50">
                                                                                <td className="px-4 py-2 pl-16 border-l-2 border-transparent hover:border-amber-200">
                                                                                    <span className="text-sm text-gray-800">{task.name}</span>
                                                                                </td>
                                                                                <td className="px-4 py-2 text-center text-xs text-gray-500">{formatDateTH(task.planStartDate)} - {formatDateTH(task.planEndDate)}</td>
                                                                                <td className="px-4 py-2 text-center text-sm text-gray-600">{task.cost?.toLocaleString()}</td>
                                                                                <td className="px-4 py-2 text-center text-sm text-gray-500">{task.quantity}</td>
                                                                                <td className="px-4 py-2">
                                                                                    <div className="flex items-center gap-2 justify-center">
                                                                                        <div className="w-12"><ProgressBar value={task.progress} /></div>
                                                                                        <span className="text-xs text-gray-500">{task.progress}%</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td className="px-4 py-2 text-center">{getStatusBadge(task.status)}</td>
                                                                                <td className="px-4 py-2">
                                                                                    <div className="flex items-center justify-center gap-1">
                                                                                        {canUpdateProgress && <button onClick={() => openProgressModal(task)} className="p-1 text-blue-600 hover:bg-blue-50 rounded"><TrendingUp className="w-4 h-4" /></button>}
                                                                                        {canEdit && (
                                                                                            <>
                                                                                                <button onClick={() => openEditModal(task)} className="p-1 text-gray-500 hover:bg-gray-100 rounded"><Edit2 className="w-4 h-4" /></button>
                                                                                                <button onClick={() => handleDelete(task)} className="p-1 text-red-500 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4" /></button>
                                                                                            </>
                                                                                        )}
                                                                                    </div>
                                                                                </td>
                                                                            </tr>
                                                                        ))}
                                                                    </>
                                                                )}
                                                            </React.Fragment>
                                                        );
                                                    })}

                                                    {/* Level 1 Direct Tasks */}
                                                    {catData.tasks.map(task => (
                                                        <tr key={task.id} className="hover:bg-gray-50">
                                                            <td className="px-4 py-2 pl-12 border-l-2 border-transparent hover:border-blue-200">
                                                                <span className="text-sm text-gray-800">{task.name}</span>
                                                            </td>
                                                            <td className="px-4 py-2 text-center text-xs text-gray-500">{formatDateTH(task.planStartDate)} - {formatDateTH(task.planEndDate)}</td>
                                                            <td className="px-4 py-2 text-center text-sm text-gray-600">{task.cost?.toLocaleString()}</td>
                                                            <td className="px-4 py-2 text-center text-sm text-gray-500">{task.quantity}</td>
                                                            <td className="px-4 py-2">
                                                                <div className="flex items-center gap-2 justify-center">
                                                                    <div className="w-12"><ProgressBar value={task.progress} /></div>
                                                                    <span className="text-xs text-gray-500">{task.progress}%</span>
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-2 text-center">{getStatusBadge(task.status)}</td>
                                                            <td className="px-4 py-2">
                                                                <div className="flex items-center justify-center gap-1">
                                                                    {canUpdateProgress && <button onClick={() => openProgressModal(task)} className="p-1 text-blue-600 hover:bg-blue-50 rounded"><TrendingUp className="w-4 h-4" /></button>}
                                                                    {canEdit && (
                                                                        <>
                                                                            <button onClick={() => openEditModal(task)} className="p-1 text-gray-500 hover:bg-gray-100 rounded"><Edit2 className="w-4 h-4" /></button>
                                                                            <button onClick={() => handleDelete(task)} className="p-1 text-red-500 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4" /></button>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Create/Edit Task Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl w-full max-w-xl shadow-xl">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                            <h2 className="text-lg font-bold text-gray-900">{editingTask ? 'แก้ไขงาน' : 'เพิ่มงานใหม่'}</h2>
                            <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-full">
                                <X className="w-5 h-5 text-gray-500" />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            {/* Category & Subcategory */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">หมวดหมู่ *</label>
                                    <input
                                        type="text"
                                        list="categories"
                                        required
                                        value={taskForm.category}
                                        onChange={(e) => setTaskForm({ ...taskForm, category: e.target.value })}
                                        placeholder="เลือกหรือพิมพ์ใหม่..."
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                    <datalist id="categories">
                                        {existingCategories.map((c, i) => <option key={i} value={c} />)}
                                    </datalist>
                                </div>
                                <datalist id="categories">
                                    {existingCategories.map((c, i) => <option key={i} value={c} />)}
                                </datalist>
                            </div>
                            <div className="space-y-4">
                                {/* Subcategory (Hidden by default) */}
                                {!showSubcategory && !taskForm.subcategory ? (
                                    <button
                                        type="button"
                                        onClick={() => setShowSubcategory(true)}
                                        className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 mt-6"
                                    >
                                        <Plus className="w-4 h-4" />
                                        เพิ่มหมวดหมู่ย่อย
                                    </button>
                                ) : (
                                    <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                                        <div className="flex justify-between items-center mb-1">
                                            <label className="block text-sm font-medium text-gray-700">หมวดหมู่ย่อย</label>
                                            {!taskForm.subcategory && (
                                                <button
                                                    type="button"
                                                    onClick={() => setShowSubcategory(false)}
                                                    className="text-xs text-red-500 hover:text-red-700"
                                                >
                                                    ยกเลิก
                                                </button>
                                            )}
                                        </div>
                                        <input
                                            type="text"
                                            list="subcategories"
                                            value={taskForm.subcategory}
                                            onChange={(e) => setTaskForm({ ...taskForm, subcategory: e.target.value })}
                                            placeholder="(ไม่บังคับ)"
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        />
                                        <datalist id="subcategories">
                                            {existingSubcategories.map((s, i) => <option key={i} value={s} />)}
                                        </datalist>
                                    </div>
                                )}

                                {/* Sub-subcategory (Hidden by default, shown only if subcategory is active) */}
                                {showSubcategory && (
                                    <>
                                        {!showSubSubcategory && !taskForm.subsubcategory ? (
                                            <button
                                                type="button"
                                                onClick={() => setShowSubSubcategory(true)}
                                                className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                                            >
                                                <Plus className="w-4 h-4" />
                                                เพิ่มหมวดหมู่ย่อย 2
                                            </button>
                                        ) : (
                                            <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                                                <div className="flex justify-between items-center mb-1">
                                                    <label className="block text-sm font-medium text-gray-700">หมวดหมู่ย่อย 2</label>
                                                    {!taskForm.subsubcategory && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setShowSubSubcategory(false)}
                                                            className="text-xs text-red-500 hover:text-red-700"
                                                        >
                                                            ยกเลิก
                                                        </button>
                                                    )}
                                                </div>
                                                <input
                                                    type="text"
                                                    value={taskForm.subsubcategory}
                                                    onChange={(e) => setTaskForm({ ...taskForm, subsubcategory: e.target.value })}
                                                    placeholder="ระบุ (ไม่บังคับ)..."
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                />
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>


                            {/* Hidden field remover hack if needed, but react handles unmounting cleanly */}

                            {/* Task Name */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">ชื่องาน *</label>
                                <input
                                    type="text"
                                    required
                                    value={taskForm.name}
                                    onChange={(e) => setTaskForm({ ...taskForm, name: e.target.value })}
                                    placeholder="ระบุชื่องาน..."
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>

                            {/* Dates & Duration */}
                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">วันเริ่มต้น</label>
                                    <input
                                        type="date"
                                        value={taskForm.planStartDate}
                                        onChange={(e) => {
                                            const newStart = e.target.value;
                                            // Auto-calc end date if duration exists
                                            if (newStart && taskForm.planDuration > 0) {
                                                const endDate = addDays(parseISO(newStart), taskForm.planDuration - 1);
                                                setTaskForm(prev => ({
                                                    ...prev,
                                                    planStartDate: newStart,
                                                    planEndDate: format(endDate, 'yyyy-MM-dd')
                                                }));
                                            } else {
                                                setTaskForm(prev => ({ ...prev, planStartDate: newStart }));
                                            }
                                        }}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">จำนวนวัน</label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={taskForm.planDuration}
                                        onChange={(e) => {
                                            const duration = parseInt(e.target.value) || 0;
                                            // Auto-calc end date if start date exists
                                            if (taskForm.planStartDate && duration > 0) {
                                                const endDate = addDays(parseISO(taskForm.planStartDate), duration - 1);
                                                setTaskForm(prev => ({
                                                    ...prev,
                                                    planDuration: duration,
                                                    planEndDate: format(endDate, 'yyyy-MM-dd')
                                                }));
                                            } else {
                                                setTaskForm(prev => ({ ...prev, planDuration: duration }));
                                            }
                                        }}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">วันสิ้นสุด</label>
                                    <input
                                        type="date"
                                        value={taskForm.planEndDate}
                                        readOnly
                                        className="w-full px-3 py-2 border border-gray-300 bg-gray-50 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 cursor-not-allowed"
                                        title="คำนวณจาก วันเริ่ม + จำนวนวัน"
                                    />
                                </div>
                            </div>

                            {/* Cost, Quantity, Progress */}
                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Cost (บาท)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={taskForm.cost}
                                        onChange={(e) => setTaskForm({ ...taskForm, cost: parseFloat(e.target.value) || 0 })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Q'ty</label>
                                    <input
                                        type="text"
                                        value={taskForm.quantity}
                                        onChange={(e) => setTaskForm({ ...taskForm, quantity: e.target.value })}
                                        placeholder="เช่น 50 m2"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Progress (%)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={taskForm.progress}
                                        onChange={(e) => setTaskForm({ ...taskForm, progress: parseInt(e.target.value) || 0 })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>
                            </div>

                            {/* Responsible */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">ผู้รับผิดชอบ</label>
                                <input
                                    type="text"
                                    list="members"
                                    value={taskForm.responsible}
                                    onChange={(e) => setTaskForm({ ...taskForm, responsible: e.target.value })}
                                    placeholder="ระบุชื่อผู้รับผิดชอบ..."
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                                <datalist id="members">
                                    {members.map(m => <option key={m.id} value={m.name} />)}
                                </datalist>
                            </div>

                            {/* Actions */}
                            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg text-sm font-medium">
                                    ยกเลิก
                                </button>
                                <button type="submit" disabled={saving} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium flex items-center gap-2 disabled:opacity-50">
                                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                                    {editingTask ? 'บันทึกการแก้ไข' : 'สร้างงาน'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div >
            )
            }

            {/* Progress Update Modal */}
            {
                isProgressModalOpen && (
                    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
                            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                                <h2 className="text-lg font-bold text-gray-900">อัปเดทความคืบหน้า</h2>
                                <button onClick={() => setIsProgressModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-full">
                                    <X className="w-5 h-5 text-gray-500" />
                                </button>
                            </div>
                            <div className="p-6 space-y-4">
                                <div className="bg-gray-50 p-3 rounded-lg">
                                    <p className="text-xs text-gray-500">งาน</p>
                                    <p className="font-medium text-gray-900">{progressForm.taskName}</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Progress (%)</label>
                                    <div className="flex items-center gap-4">
                                        <input
                                            type="range"
                                            min="0"
                                            max="100"
                                            step="5"
                                            value={progressForm.newProgress}
                                            onChange={(e) => setProgressForm({ ...progressForm, newProgress: parseInt(e.target.value) })}
                                            className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                        />
                                        <span className="text-2xl font-bold text-gray-900 w-16 text-right">{progressForm.newProgress}%</span>
                                    </div>
                                    <div className="flex justify-between mt-2">
                                        {[0, 25, 50, 75, 100].map(v => (
                                            <button
                                                key={v}
                                                type="button"
                                                onClick={() => setProgressForm({ ...progressForm, newProgress: v })}
                                                className={`px-2 py-1 text-xs rounded ${progressForm.newProgress === v ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                            >
                                                {v}%
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">วันที่เริ่มจริง</label>
                                        <input
                                            type="date"
                                            value={progressForm.actualStartDate}
                                            onChange={(e) => setProgressForm({ ...progressForm, actualStartDate: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">วันที่เสร็จจริง</label>
                                        <input
                                            type="date"
                                            value={progressForm.actualEndDate}
                                            onChange={(e) => setProgressForm({ ...progressForm, actualEndDate: e.target.value })}
                                            disabled={progressForm.newProgress < 100}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100"
                                        />
                                    </div>
                                </div>

                                <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                                    <button type="button" onClick={() => setIsProgressModalOpen(false)} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg text-sm font-medium">
                                        ยกเลิก
                                    </button>
                                    <button
                                        onClick={handleProgressSubmit}
                                        disabled={savingProgress}
                                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium flex items-center gap-2 disabled:opacity-50"
                                    >
                                        {savingProgress && <Loader2 className="w-4 h-4 animate-spin" />}
                                        บันทึก
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Alert Dialog */}
            {
                alertDialog.isOpen && (
                    <div className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center p-4">
                        <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 text-center">
                            <div className={`w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center ${alertDialog.type === 'error' ? 'bg-red-100' : alertDialog.type === 'confirm' ? 'bg-blue-100' : 'bg-gray-100'}`}>
                                {alertDialog.type === 'error' ? <AlertTriangle className="w-6 h-6 text-red-600" /> : <Info className="w-6 h-6 text-blue-600" />}
                            </div>
                            <h3 className="text-lg font-bold text-gray-900 mb-2">{alertDialog.title}</h3>
                            <p className="text-sm text-gray-500 mb-6">{alertDialog.message}</p>
                            <div className="flex gap-3 justify-center">
                                {alertDialog.type === 'confirm' && (
                                    <button onClick={() => setAlertDialog(prev => ({ ...prev, isOpen: false }))} className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 text-sm font-medium">
                                        ยกเลิก
                                    </button>
                                )}
                                <button
                                    onClick={alertDialog.onConfirm || (() => setAlertDialog(prev => ({ ...prev, isOpen: false })))}
                                    className={`px-4 py-2 text-white rounded-lg text-sm font-medium ${alertDialog.type === 'error' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                                >
                                    ตกลง
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
