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
    FileDown,
    Save,
    ArrowUp,
    ArrowDown,
    GripVertical,
} from 'lucide-react';
import { format, parseISO, differenceInDays, addDays } from 'date-fns';
import { Project, Task, Member } from '@/types/construction';
import { getProject, getTasks, createTask, updateTask, deleteTask, getMembers, syncGroupProgress, batchCreateTasks, deleteAllTasks, updateProject } from '@/lib/firestore';
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

interface ColorMenuConfig {
    id: string;
    type: 'category' | 'group';
    top: number;
    left: number;
}

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
    const [collapsedSubSubcategories, setCollapsedSubSubcategories] = useState<Set<string>>(new Set());

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
        planStartDate: '',
        planEndDate: '',
    });
    const [savingProgress, setSavingProgress] = useState(false);

    // Move State
    const [movingTaskId, setMovingTaskId] = useState<string | null>(null);

    // Category Reordering State
    const [categoryOrder, setCategoryOrder] = useState<string[]>([]);
    const [dragType, setDragType] = useState<'task' | 'category' | null>(null);
    const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);

    // Alert Dialog
    const [alertDialog, setAlertDialog] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        type: 'info' | 'confirm' | 'error';
        onConfirm?: () => void;
    }>({ isOpen: false, title: '', message: '', type: 'info' });

    // Category Colors State (Synced with Gantt)
    const [categoryColors, setCategoryColors] = useState<Record<string, string>>({});
    const [activeColorMenu, setActiveColorMenu] = useState<ColorMenuConfig | null>(null);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('gantt_category_colors');
            if (saved) {
                try {
                    setCategoryColors(JSON.parse(saved));
                } catch (e) {
                    console.error('Failed to parse category colors', e);
                }
            }
        }
    }, []);

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
            // Sort tasks by order
            setTasks(tasksData.sort((a, b) => (a.order || 0) - (b.order || 0)));
            setMembers(membersData);
            // Initialize category order from project
            if (projectData?.categoryOrder) {
                setCategoryOrder(projectData.categoryOrder);
            }
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

    const toggleSubSubcategory = (key: string) => {
        setCollapsedSubSubcategories(prev => {
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

    const handleDragStart = (e: React.DragEvent, id: string, type: 'task' | 'category' = 'task') => {
        setDraggingTaskId(id);
        setDragType(type);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = async (e: React.DragEvent, target: Task | string) => {
        e.preventDefault();
        const sourceId = draggingTaskId;
        setDraggingTaskId(null);
        setDragType(null);

        if (!sourceId) return;

        // Handle Target as String (Category/Subcategory structure)
        if (typeof target === 'string') {
            // Case 1: Reordering Categories (Drag Category -> Drop Category)
            if (dragType === 'category') {
                const sourceCat = sourceId.replace('cat::', '');
                // Target might be "Cat::Sub" if dropped on sub row, we only care if it's a top level cat for reordering?
                // Actually, if we only support reordering top level, we should check if target is top level.
                // Assuming `category` passed from Row 1 is just identifier.
                // If dropped on Sub row (Cat::Sub), we probably shouldn't reorder Categories based on that?
                // Let's assume Category Reorder only works on top level rows for now.
                if (target.includes('::')) return;

                const targetCat = target;
                if (sourceCat === targetCat) return;

                const allCats = Object.keys(hierarchicalData);
                let currentOrder = categoryOrder.length > 0 ? [...categoryOrder] : [...allCats];

                // Ensure all are present
                allCats.forEach(c => {
                    if (!currentOrder.includes(c)) currentOrder.push(c);
                });

                const sourceIndex = currentOrder.indexOf(sourceCat);
                const targetIndex = currentOrder.indexOf(targetCat);

                if (sourceIndex > -1 && targetIndex > -1) {
                    currentOrder.splice(sourceIndex, 1);
                    currentOrder.splice(targetIndex, 0, sourceCat);
                    setCategoryOrder(currentOrder);

                    // Persist to Firestore
                    try {
                        await updateProject(projectId, { categoryOrder: currentOrder });
                    } catch (error) {
                        console.error('Failed to save category order:', error);
                        alert('บันทึกลำดับหมวดหมู่ล้มเหลว');
                    }
                }
                return;
            }

            // Case 2: Moving Task -> Category/Subcategory (Drag Task -> Drop Group Header)
            if (dragType === 'task') {
                const sourceTask = tasks.find(t => t.id === sourceId);
                if (!sourceTask) return;

                // Parse target string "Cat" or "Cat::Sub" or "Cat::Sub::SubSub"
                const parts = target.split('::');
                const newCategory = parts[0];
                const newSub = parts.length > 1 ? parts[1] : '';
                const newSubSub = parts.length > 2 ? parts[2] : '';

                // Don't update if nothing changed
                if (sourceTask.category === newCategory &&
                    (sourceTask.subcategory || '') === newSub &&
                    (sourceTask.subsubcategory || '') === newSubSub) {
                    return;
                }

                try {
                    // Update task to new location (append to end by default or simple move)
                    await updateTask(sourceId, {
                        ...sourceTask,
                        category: newCategory,
                        subcategory: newSub,
                        subsubcategory: newSubSub,
                        // We might want to reset order or put it last?
                        // For now let backend or default sort handle it.
                        order: 999999
                    });
                    await fetchData();
                } catch (error) {
                    console.error('Error moving task to category:', error);
                    alert('ไม่สามารถย้ายงานได้');
                }
                return;
            }
            return;
        }

        // Handle Task Drop
        const targetTask = target as Task;
        if (dragType === 'category') return; // Can't drop category on task

        if (sourceId === targetTask.id) return;

        const sourceTask = tasks.find(t => t.id === sourceId);
        if (!sourceTask) return;

        // IMPORTANT: Only allow becoming a child of GROUP type tasks
        // If target is not a group, just reorder (swap positions) instead
        if (targetTask.type !== 'group') {
            // Reorder logic - move source next to target in same context
            const updatedSourceTask = {
                ...sourceTask,
                category: targetTask.category,
                subcategory: (targetTask as any).subcategory || '',
                subsubcategory: (targetTask as any).subsubcategory || ''
            };

            const targetSiblings = tasks.filter(t =>
                (t.category || '') === (targetTask.category || '') &&
                ((t as any).subcategory || '') === ((targetTask as any).subcategory || '') &&
                ((t as any).subsubcategory || '') === ((targetTask as any).subsubcategory || '') &&
                t.id !== sourceId
            ).sort((a, b) => (a.order || 0) - (b.order || 0));

            const targetSiblingIndex = targetSiblings.findIndex(t => t.id === targetTask.id);
            targetSiblings.splice(targetSiblingIndex, 0, updatedSourceTask);

            const updates: Promise<any>[] = [];
            targetSiblings.forEach((t, index) => {
                const newOrder = index + 1;
                if (t.order !== newOrder || t.id === sourceId) {
                    updates.push(updateTask(t.id, {
                        order: newOrder,
                        category: t.category,
                        subcategory: (t as any).subcategory,
                        subsubcategory: (t as any).subsubcategory
                    }));
                }
            });

            try {
                await Promise.all(updates);
                await fetchData();
            } catch (error) {
                console.error('Error reordering:', error);
                alert('เกิดข้อผิดพลาดในการจัดเรียง');
            }
            return;
        }

        // If target IS a group, allow becoming a child
        try {
            await updateTask(sourceId, {
                ...sourceTask,
                parentTaskId: targetTask.id,
                category: targetTask.category,
                subcategory: (targetTask as any).subcategory || '',
                subsubcategory: (targetTask as any).subsubcategory || ''
            });
            await fetchData();
        } catch (error) {
            console.error('Error moving task to group:', error);
            alert('ไม่สามารถย้ายงานไปยังกลุ่มได้');
        }
    };

    const handleMoveTask = async (task: Task, direction: 'up' | 'down') => {
        // Find siblings
        const siblings = tasks.filter(t =>
            (t.category || '') === (task.category || '') &&
            ((t as any).subcategory || '') === ((task as any).subcategory || '') &&
            ((t as any).subsubcategory || '') === ((task as any).subsubcategory || '')
        ).sort((a, b) => (a.order || 0) - (b.order || 0));

        const index = siblings.findIndex(t => t.id === task.id);
        if (index === -1) return;

        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= siblings.length) return;

        const targetTask = siblings[targetIndex];

        // Prevent concurrent moves
        if (movingTaskId) return;
        setMovingTaskId(task.id);

        try {
            // Swap orders
            // Note: If orders are equal or not set, we might need a more robust re-indexing strategy.
            // But assuming unique orders or at least sortable, swapping values generally works to swap positions.
            // If they have same order value, swapping does nothing. Maximize difference.
            let taskOrder = task.order || 0;
            let targetOrder = targetTask.order || 0;

            if (taskOrder === targetOrder) {
                // If equal, bump one
                if (direction === 'up') targetOrder = taskOrder - 1;
                else targetOrder = taskOrder + 1;
            }

            await Promise.all([
                updateTask(task.id, { order: targetOrder }),
                updateTask(targetTask.id, { order: taskOrder })
            ]);

            await fetchData();
        } catch (error) {
            console.error('Error moving task:', error);
            alert('เกิดข้อผิดพลาดในการย้ายงาน');
        } finally {
            setMovingTaskId(null);
        }
    };

    const formatDateForCSV = (isoDate: string | undefined | null) => {
        if (!isoDate) return '';
        try {
            return format(parseISO(isoDate), 'dd/MM/yyyy');
        } catch {
            return isoDate;
        }
    };

    const handleExport = () => {
        // Create CSV Content
        const headers = [
            'Category',
            'Subcategory',
            'SubSubcategory',
            'Type',
            'Task Name',
            'Plan Start',
            'Plan End',
            'Duration (Days)',
            'Cost',
            'Quantity',
            'Responsible',
            'Progress (%)',
            'Status',
            'Actual Start',
            'Actual End'
        ];



        const rows = tasks.map(t => [
            `"${(t.category || '').replace(/"/g, '""')}"`,
            `"${(t.subcategory || '').replace(/"/g, '""')}"`,
            `"${(t.subsubcategory || '').replace(/"/g, '""')}"`,
            t.type || 'task',
            `"${(t.name || '').replace(/"/g, '""')}"`,
            formatDateForCSV(t.planStartDate),
            formatDateForCSV(t.planEndDate),
            t.planDuration || 0,
            t.cost || 0,
            `"${(t.quantity || '').replace(/"/g, '""')}"`,
            `"${(t.responsible || '').replace(/"/g, '""')}"`,
            t.progress || 0,
            t.status || 'not-started',
            formatDateForCSV(t.actualStartDate),
            formatDateForCSV(t.actualEndDate)
        ]);

        // Add BOM for Excel Thai support
        const csvContent = '\uFEFF' + [
            headers.join(','),
            ...rows.map(r => r.join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `project-${project?.name || 'tasks'}_${format(new Date(), 'yyyyMMdd')}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const text = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target?.result as string);
                reader.onerror = reject;
                reader.readAsText(file);
            });

            // Use robust CSV parser
            const { parseCSV } = await import('@/lib/csv-utils');
            const data = parseCSV(text.replace(/^\uFEFF/, ''));

            if (data.length === 0) throw new Error('No data found');

            // Filter out instruction row if present (check simple heuristics)
            // If the first row has "หมวดหมู่" in Category column, it's likely instructions
            const cleanData = data.filter(row => {
                const cat = row['Category'] || row['หมวดหมู่'];
                return cat !== 'หมวดหมู่' && cat !== 'Category';
            });

            const newTasks: any[] = [];
            let orderCounter = tasks.length > 0 ? Math.max(...tasks.map(t => t.order || 0)) : 0;

            for (const row of cleanData) {
                // Support multiple header variations for flexibility
                const name = row['Task Name'] || row['Name'] || row['ชื่องาน'];
                if (!name) continue;

                const category = row['Category'] || row['หมวดหมู่'] || 'Uncategorized';
                const subcategory = row['Subcategory'] || row['Sub Category'] || row['หมวดหมู่ย่อย'] || '';
                const subsubcategory = row['SubSubcategory'] || row['Sub Subcategory'] || row['หมวดหมู่ย่อย 2'] || row['หมวดหมู่ย่อยระดับ 3'] || '';
                const type = (row['Type'] || 'task').toLowerCase() as 'task' | 'group';

                const planStart = row['Plan Start'] || row['PlanStartDate'] || row['Start Date'] || row['วันเริ่มต้น'] || row['วันเริ่ม'] || '';
                const planEnd = row['Plan End'] || row['PlanEndDate'] || row['End Date'] || row['วันสิ้นสุด'] || row['วันจบ'] || '';

                // Flexible duration parsing
                const rawDuration = row['Duration'] || row['Duration (Days)'] || row['PlanDuration'] || row['Days'] || row['ระยะเวลา'] || row['จำนวนวัน'] || '0';
                const duration = Math.ceil(parseFloat(String(rawDuration).replace(/,/g, ''))) || 0;

                // Helper to fix dates
                const fixDate = (val: string) => {
                    if (!val || val === '-') return '';
                    const cleaned = String(val).trim();
                    // dd/MM/yyyy or dd-MM-yyyy
                    if (/^\d{1,2}[\/-]\d{1,2}[\/-]\d{4}$/.test(cleaned)) {
                        const [d, m, y] = cleaned.split(/[\/-]/);
                        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
                    }
                    // dd/MM/yy or dd-MM-yy
                    if (/^\d{1,2}[\/-]\d{1,2}[\/-]\d{2}$/.test(cleaned)) {
                        const [d, m, y] = cleaned.split(/[\/-]/);
                        const fullYear = parseInt(y) < 50 ? `20${y}` : `19${y}`;
                        return `${fullYear}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
                    }
                    // yyyy-MM-dd (Auto fallback)
                    if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned;

                    return '';
                };

                const pStart = fixDate(planStart);
                let pEnd = fixDate(planEnd);

                // Automatically calculate Plan End from Duration if Plan Start exists
                // If Plan End is missing, we calculate it.
                if (pStart && duration > 0 && !pEnd) {
                    try {
                        const startDate = parseISO(pStart);
                        pEnd = format(addDays(startDate, duration - 1), 'yyyy-MM-dd');
                    } catch (e) {
                        console.error('Error calculating end date:', e);
                    }
                }

                newTasks.push({
                    projectId,
                    category,
                    subcategory,
                    subsubcategory,
                    type,
                    name,
                    cost: parseFloat((row['Cost'] || row['ค่าใช้จ่าย'] || '0').replace(/,/g, '')),
                    quantity: row['Quantity'] || row['จำนวน'] || '',
                    responsible: row['Responsible'] || row['ผู้รับผิดชอบ'] || '',
                    planStartDate: pStart,
                    planEndDate: pEnd,
                    planDuration: duration || pStart && pEnd ? calcDuration(pStart, pEnd) : 1,
                    progress: parseFloat((row['Progress'] || row['Progress (%)'] || row['ความคืบหน้า'] || '0').replace('%', '')),
                    status: (row['Status'] || 'not-started').toLowerCase(),
                    order: ++orderCounter,
                    actualStartDate: fixDate(row['Actual Start'] || ''),
                    actualEndDate: fixDate(row['Actual End'] || '')
                });
            }

            if (newTasks.length > 0) {
                console.log(`📦 Importing ${newTasks.length} tasks...`);
                await batchCreateTasks(projectId, newTasks);
                await fetchData();
                alert(`นำเข้าข้อมูลสำเร็จ ${newTasks.length} รายการ`);
            } else {
                alert('ไม่พบข้อมูลที่นำเข้าได้');
            }

        } catch (error) {
            console.error('Import error:', error);
            alert('เกิดข้อผิดพลาดในการนำเข้าข้อมูล: ' + (error as Error).message);
        } finally {
            e.target.value = '';
        }
    };

    const handleDownloadTemplate = () => {
        const headers = [
            'Category', 'Subcategory', 'SubSubcategory', 'Task Name',
            'Plan Start', 'Plan End', 'Duration', 'Cost', 'Quantity'
        ];

        const sample = [
            ['งานโครงสร้าง', 'ฐานราก', '', 'ขุดดิน', format(new Date(), 'yyyy-MM-dd'), format(addDays(new Date(), 4), 'yyyy-MM-dd'), '5', '5000', '10 ลบ.ม.']
        ];

        const csvContent = '\uFEFF' + [
            headers.join(','),
            ...sample.map(r => r.map(c => `"${c}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `template_${project?.code || 'project'}.csv`;
        link.click();
    };

    const openProgressModal = (task: Task) => {
        setProgressForm({
            taskId: task.id,
            taskName: task.name,
            newProgress: task.progress,
            updateDate: new Date().toISOString().split('T')[0],
            actualStartDate: task.actualStartDate || '',
            actualEndDate: task.actualEndDate || '',
            planStartDate: task.planStartDate || '',
            planEndDate: task.planEndDate || '',
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
    // Status Badge
    const getStatusBadge = (status: string, progress?: number) => {
        let displayStatus = status;

        // Auto-update status for display based on progress
        if (progress === 100) {
            displayStatus = 'completed';
        } else if (progress !== undefined && progress > 0 && status === 'not-started') {
            displayStatus = 'in-progress';
        }

        const configs: Record<string, { class: string; label: string }> = {
            'completed': { class: 'bg-emerald-50 text-emerald-700 border border-emerald-200', label: 'เสร็จสิ้น' },
            'in-progress': { class: 'bg-blue-50 text-blue-700 border border-blue-200', label: 'กำลังดำเนินการ' },
            'not-started': { class: 'bg-gray-50 text-gray-600 border border-gray-300', label: 'รอดำเนินการ' },
            'delayed': { class: 'bg-red-50 text-red-700 border border-red-200', label: 'ล่าช้า' },
        };
        const config = configs[displayStatus] || configs['not-started'];
        return <span className={`px-2.5 py-0.5 rounded-sm text-[10px] uppercase tracking-wide font-semibold ${config.class}`}>{config.label}</span>;
    };

    // Progress Bar Component
    const ProgressBar = ({ value, size = 'sm' }: { value: number; size?: 'sm' | 'md' }) => {
        const height = size === 'sm' ? 'h-1.5' : 'h-2';
        const color = value === 100 ? 'bg-emerald-500' : value >= 50 ? 'bg-blue-600' : value > 0 ? 'bg-amber-500' : 'bg-gray-300';
        return (
            <div className={`w-full ${height} bg-gray-100 rounded-sm overflow-hidden border border-gray-300`}>
                <div className={`${height} ${color} rounded-sm transition-all duration-500 ease-out`} style={{ width: `${Math.min(100, value)}%` }} />
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
        <div className="space-y-6 p-6">
            {/* Header / Toolbar */}
            <div className="bg-white border border-gray-300 px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4 sticky top-16 z-20">
                <div className="flex items-center gap-4 w-full md:w-auto">
                    <button
                        onClick={() => router.back()}
                        className="p-2 hover:bg-gray-100 rounded-sm text-gray-500 hover:text-gray-900 transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                            {project?.name}
                            <span className={`text-[10px] px-2 py-0.5 rounded-sm border ${project?.status === 'completed' ? 'border-green-300 bg-green-50 text-green-700' : 'borderlue-300 bg-blue-50 text-blue-700'}`}>
                                {project?.status === 'completed' ? 'Completed' : 'Active'}
                            </span>
                        </h1>
                        <p className="text-xs text-gray-500 flex items-center gap-2 mt-1">
                            <Building2 className="w-3 h-3" />
                            {project?.code || 'No Code'}
                            <span className="text-gray-300">|</span>
                            <Calendar className="w-3 h-3" />
                            {formatDateTH(project?.startDate)} - {formatDateTH(project?.endDate)}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 self-end md:self-auto">
                    <Link
                        href={`/gantt/${projectId}`}
                        className="px-3 py-2 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 border border-gray-300 rounded-sm transition-all flex items-center gap-2 shadow-sm"
                    >
                        <Calendar className="w-4 h-4 text-blue-600" />
                        Gantt Chart
                    </Link>
                    <Link
                        href={`/scurve/${projectId}`}
                        className="px-3 py-2 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 border border-gray-300 rounded-sm transition-all flex items-center gap-2 shadow-sm"
                    >
                        <TrendingUp className="w-4 h-4 text-emerald-600" />
                        S-Curve
                    </Link>

                    {canEdit && (
                        <>
                            <div className="hidden md:flex items-center bg-gray-50 rounded-sm p-1 border border-gray-300">
                                <button
                                    onClick={handleDownloadTemplate}
                                    className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-white hover:border border-gray-300 rounded-sm transition-all flex items-center gap-2 mr-1"
                                    title="ดาวน์โหลดไฟล์ตัวอย่าง"
                                >
                                    <FileDown className="w-3.5 h-3.5" /> Template
                                </button>
                                <div className="w-px h-4 bg-gray-300 mx-1"></div>
                                <label htmlFor="import-csv" className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-white hover:border border-gray-300 rounded-sm cursor-pointer transition-all flex items-center gap-2">
                                    <Upload className="w-3.5 h-3.5" /> Import
                                    <input
                                        id="import-csv"
                                        type="file"
                                        accept=".csv"
                                        className="hidden"
                                        onChange={handleImport}
                                    />
                                </label>
                                <div className="w-px h-4 bg-gray-200 mx-1"></div>
                                <button
                                    onClick={handleExport}
                                    className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-white hover:border border-gray-300 rounded-sm transition-all flex items-center gap-2"
                                >
                                    <Download className="w-3.5 h-3.5" /> Export
                                </button>
                            </div>

                            <button
                                onClick={handleDeleteAllTasks}
                                className="px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 rounded-sm transition-colors border border-transparent hover:border-red-300"
                            >
                                Clear All
                            </button>

                            <button
                                onClick={() => openCreateModal()}
                                className="px-4 py-2 text-sm font-medium text-white bg-gray-900 hover:bg-black rounded-sm border border-gray-900 transition-all flex items-center gap-2"
                            >
                                <Plus className="w-4 h-4" />
                                เพิ่มงานใหม่
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Project Stats Banner - Compact & Formal */}
            <div className="bg-white border border-gray-300 px-6 py-3">
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    <div className="p-3 bg-gray-50 rounded-sm border border-gray-300 flex flex-col justify-between">
                        <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Total Cost</span>
                        <span className="text-lg font-bold text-gray-900 mt-1">{projectStats.totalCost.toLocaleString()}</span>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-sm border border-gray-300 flex flex-col justify-between">
                        <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Progress</span>
                        <div className="mt-1">
                            <span className={`text-lg font-bold ${projectStats.overallProgress >= 100 ? 'text-green-600' : 'text-blue-600'}`}>
                                {projectStats.overallProgress.toFixed(1)}%
                            </span>
                            <div className="w-full bg-gray-200 rounded-sm h-1 mt-1.5">
                                <div className={`h-1 rounded-sm ${projectStats.overallProgress >= 100 ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${projectStats.overallProgress}%` }}></div>
                            </div>
                        </div>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-sm border border-gray-300 flex flex-col justify-between">
                        <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Duration</span>
                        <span className="text-lg font-bold text-gray-900 mt-1">{calcDuration(project?.startDate || '', project?.endDate || '')} <span className="text-xs font-normal text-gray-500">Days</span></span>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-sm border border-gray-300 flex flex-col justify-between">
                        <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Tasks</span>
                        <div className="flex items-baseline gap-2 mt-1">
                            <span className="text-lg font-bold text-gray-900">{projectStats.total}</span>
                            <span className="text-xs text-gray-500">({projectStats.completed} Done)</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Task List Table */}
            <div className="flex-1 overflow-hidden flex flex-col bg-gray-50">
                {tasks.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                        <div className="w-16 h-16 bg-gray-100 rounded-sm flex items-center justify-center mb-4">
                            <ListTodo className="w-8 h-8 text-gray-300" />
                        </div>
                        <p className="text-lg font-medium text-gray-600">ยังไม่มีรายการงาน</p>
                        <p className="text-sm">เริ่มต้นด้วยการเพิ่มงานใหม่ หรือนำเข้าจาก CSV</p>
                        <button
                            onClick={() => openCreateModal()}
                            className="mt-6 px-4 py-2 text-sm font-medium text-white bg-gray-900 hover:bg-black rounded-md shadow-sm transition-all"
                        >
                            เพิ่มงานแรก
                        </button>
                    </div>
                ) : (
                    <div className="flex-1 overflow-auto custom-scrollbar">
                        <table className="w-full border-collapse bg-white rounded-sm overflow-hidden border border-gray-300">
                            <thead className="bg-gray-50 border border-gray-300 sticky top-0 z-10">
                                <tr>
                                    <th className="w-10 py-3 text-center"></th>
                                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 uppercase tracking-wide border-r border-transparent">รายการงาน</th>
                                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 uppercase tracking-wide w-32 border-r border-transparent">ผู้รับผิดชอบ</th>
                                    <th className="px-4 py-3 text-center text-xs font-bold text-gray-900 uppercase tracking-wide w-60 border-r border-transparent">ระยะเวลา</th>
                                    <th className="px-4 py-3 text-right text-xs font-bold text-gray-900 uppercase tracking-wide w-40 border-r border-transparent">ต้นทุน/ค่าใช้จ่าย</th>
                                    <th className="px-4 py-3 text-center text-xs font-bold text-gray-900 uppercase tracking-wide w-24 border-r border-transparent">ปริมาณ</th>
                                    <th className="px-4 py-3 text-center text-xs font-bold text-gray-900 uppercase tracking-wide w-48 border-r border-transparent">ความคืบหน้า</th>
                                    <th className="px-4 py-3 text-center text-xs font-bold text-gray-900 uppercase tracking-wide w-40 border-r border-transparent">สถานะ</th>
                                    <th className="px-4 py-3 text-center text-xs font-bold text-gray-900 uppercase tracking-wide w-28">จัดการ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {Object.keys(hierarchicalData)
                                    .sort((a, b) => {
                                        if (categoryOrder.length === 0) return 0;
                                        const ia = categoryOrder.indexOf(a);
                                        const ib = categoryOrder.indexOf(b);
                                        return ia - ib;
                                    })
                                    .map((category) => {
                                        const catData = hierarchicalData[category];
                                        const isCatCollapsed = collapsedCategories.has(category);
                                        const catColor = categoryColors[category] || '#2563eb'; // Default blue-600

                                        // Count total items for badge
                                        let totalItems = catData.tasks.length;
                                        Object.values(catData.subcategories).forEach(s => {
                                            totalItems += s.tasks.length;
                                            Object.values(s.subsubcategories).forEach(ss => totalItems += ss.length);
                                        });

                                        return (
                                            <React.Fragment key={category}>
                                                {/* Level 1: Category Row */}
                                                <tr
                                                    className={`group transition-colors ${draggingTaskId === `cat::${category}` ? 'opacity-40 bg-gray-50' : 'bg-white hover:bg-gray-50'}`}
                                                    draggable={canEdit}
                                                    onDragStart={(e) => handleDragStart(e, `cat::${category}`, 'category')}
                                                    onDragOver={handleDragOver}
                                                    onDrop={(e) => handleDrop(e, category)}
                                                >
                                                    <td className="px-2 py-4 text-center cursor-move text-gray-300 hover:text-gray-500" onClick={(e) => e.stopPropagation()}>
                                                        {canEdit && <GripVertical className="w-4 h-4 mx-auto" />}
                                                    </td>
                                                    <td className="px-4 py-4 cursor-pointer" onClick={() => toggleCategory(category)}>
                                                        <div className="flex items-center gap-2">
                                                            {isCatCollapsed ? <ChevronRight className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                                                            <button
                                                                className="w-3 h-3 rounded-sm shadow-sm hover:scale-110 transition-transform"
                                                                style={{ backgroundColor: catColor }}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    const rect = e.currentTarget.getBoundingClientRect();
                                                                    setActiveColorMenu({
                                                                        id: category,
                                                                        type: 'category',
                                                                        top: rect.bottom,
                                                                        left: rect.left
                                                                    });
                                                                }}
                                                            />
                                                            <span className="font-bold text-gray-900">{category}</span>
                                                            <span className="text-xs text-gray-500">({totalItems} รายการ)</span>
                                                            {canEdit && (
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        openCreateModal(category);
                                                                    }}
                                                                    className="ml-2 p-1 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                                                                    title="เพิ่มงานในหมวดนี้"
                                                                >
                                                                    <Plus className="w-4 h-4" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-4 text-center text-sm text-gray-300">-</td>
                                                    <td className="px-4 py-4 text-center text-xs text-gray-600 font-medium tabular-nums">
                                                        {catData.stats.minStartDate ? `${formatDateTH(catData.stats.minStartDate)} - ${formatDateTH(catData.stats.maxEndDate)}` : '-'}
                                                    </td>
                                                    <td className="px-4 py-4 text-right text-sm font-bold text-gray-900 tabular-nums">{catData.stats.totalCost.toLocaleString()}</td>
                                                    <td className="px-4 py-4 text-center text-sm text-gray-600">-</td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-2">
                                                            <div className="flex-1 bg-gray-100 rounded-sm h-1.5 overflow-hidden border border-gray-300">
                                                                <div className="h-full rounded-sm transition-all duration-500"
                                                                    style={{ width: `${catData.stats.weightedProgress}%`, backgroundColor: catColor }}></div>
                                                            </div>
                                                            <span className="text-xs text-gray-600 w-8 text-right tabular-nums">{catData.stats.weightedProgress.toFixed(0)}%</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 text-center">-</td>
                                                    <td className="px-4 py-3 text-center">-</td>
                                                </tr>

                                                {/* Level 1 Content */}
                                                {!isCatCollapsed && (
                                                    <>
                                                        {Object.entries(catData.subcategories).map(([subcat, subData]) => {
                                                            const uniqueSubcatId = `${category}::${subcat}`;
                                                            const isSubCollapsed = collapsedSubcategories.has(uniqueSubcatId);
                                                            const subColor = categoryColors[uniqueSubcatId] || catColor;

                                                            // Calculate sub-stats
                                                            const subAllTasks = [...subData.tasks, ...Object.values(subData.subsubcategories).flat()];
                                                            const subStats = getSubcategoryStats(subAllTasks);

                                                            return (
                                                                <React.Fragment key={uniqueSubcatId}>
                                                                    {/* Level 2: Subcategory Row */}
                                                                    <tr
                                                                        className="bg-gray-50/50 hover:bg-gray-100 cursor-pointer"
                                                                        onClick={() => toggleSubcategory(uniqueSubcatId)}
                                                                        onDragOver={handleDragOver}
                                                                        onDrop={(e) => handleDrop(e, uniqueSubcatId)}
                                                                    >
                                                                        <td className="px-2 py-2.5 border border-gray-50 text-center cursor-move text-gray-300 hover:text-gray-500" onClick={(e) => e.stopPropagation()}>
                                                                            {canEdit && <GripVertical className="w-4 h-4 mx-auto" />}
                                                                        </td>
                                                                        <td className="px-4 py-2.5 pl-10">
                                                                            <div className="flex items-center gap-2">
                                                                                {isSubCollapsed ? <ChevronRight className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                                                                                <button
                                                                                    className="w-2.5 h-2.5 rounded-sm shadow-sm opacity-80 hover:scale-110 transition-transform"
                                                                                    style={{ backgroundColor: subColor }}
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        const rect = e.currentTarget.getBoundingClientRect();
                                                                                        setActiveColorMenu({
                                                                                            id: uniqueSubcatId,
                                                                                            type: 'category',
                                                                                            top: rect.bottom,
                                                                                            left: rect.left
                                                                                        });
                                                                                    }}
                                                                                />
                                                                                <span className="font-medium text-gray-800">{subcat}</span>
                                                                                <span className="text-xs text-gray-400">({subAllTasks.length})</span>
                                                                                {canEdit && (
                                                                                    <button
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            openCreateModal(category, subcat);
                                                                                        }}
                                                                                        className="ml-2 p-1 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                                                                                        title="เพิ่มงานในหมวดย่อยนี้"
                                                                                    >
                                                                                        <Plus className="w-3 h-3" />
                                                                                    </button>
                                                                                )}
                                                                            </div>
                                                                        </td>
                                                                        <td className="px-4 py-2.5 text-center text-sm text-gray-300">-</td>
                                                                        <td className="px-4 py-2.5 text-center text-xs text-gray-600 tabular-nums">
                                                                            {subStats.minStartDate ? `${formatDateTH(subStats.minStartDate)} - ${formatDateTH(subStats.maxEndDate)}` : '-'}
                                                                        </td>
                                                                        <td className="px-4 py-2.5 text-right text-sm font-medium text-gray-900 tabular-nums">{subStats.totalCost.toLocaleString()}</td>
                                                                        <td className="px-4 py-2.5 text-center text-sm text-gray-500">-</td>
                                                                        <td className="px-4 py-2.5">
                                                                            <div className="flex items-center gap-2">
                                                                                <div className="flex-1 bg-gray-100 rounded-sm h-1.5 overflow-hidden border border-gray-300">
                                                                                    <div className="h-full rounded-sm transition-all duration-500"
                                                                                        style={{ width: `${subStats.avgProgress}%`, backgroundColor: subColor }}></div>
                                                                                </div>
                                                                                <span className="text-xs text-gray-600 w-8 text-right tabular-nums">{subStats.avgProgress.toFixed(0)}%</span>
                                                                            </div>
                                                                        </td>
                                                                        <td className="px-4 py-2.5 text-center">-</td>
                                                                        <td className="px-4 py-2.5 text-center">-</td>
                                                                    </tr>

                                                                    {/* Level 2 Content */}
                                                                    {!isSubCollapsed && (
                                                                        <>
                                                                            {/* Level 3: Sub-subcategories */}
                                                                            {Object.entries(subData.subsubcategories).map(([subsub, tasks]) => {
                                                                                const uniqueSubsubId = `${category}::${subcat}::${subsub}`;
                                                                                const isSubSubCollapsed = collapsedSubSubcategories.has(uniqueSubsubId);
                                                                                const subSubStats = getSubcategoryStats(tasks);
                                                                                const subSubColor = categoryColors[uniqueSubsubId] || subColor;

                                                                                return (
                                                                                    <React.Fragment key={subsub}>
                                                                                        {/* Level 3 Group Row */}
                                                                                        <tr
                                                                                            className="hover:bg-gray-50/80 cursor-pointer transition-colors"
                                                                                            onClick={() => toggleSubSubcategory(uniqueSubsubId)}
                                                                                            onDragOver={handleDragOver}
                                                                                            onDrop={(e) => handleDrop(e, uniqueSubsubId)}
                                                                                        >
                                                                                            <td className="px-2 py-2 text-center cursor-move text-gray-300 hover:text-gray-500" onClick={(e) => e.stopPropagation()}>
                                                                                                {canEdit && <GripVertical className="w-4 h-4 mx-auto" />}
                                                                                            </td>
                                                                                            <td className="px-4 py-2 pl-16">
                                                                                                <div className="flex items-center gap-2">
                                                                                                    {isSubSubCollapsed ? <ChevronRight className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                                                                                                    <button
                                                                                                        className="w-2 h-2 rounded-sm shadow-sm opacity-60 hover:scale-110 transition-transform"
                                                                                                        style={{ backgroundColor: subSubColor }}
                                                                                                        onClick={(e) => {
                                                                                                            e.stopPropagation();
                                                                                                            const rect = e.currentTarget.getBoundingClientRect();
                                                                                                            setActiveColorMenu({
                                                                                                                id: uniqueSubsubId,
                                                                                                                type: 'group',
                                                                                                                top: rect.bottom,
                                                                                                                left: rect.left
                                                                                                            });
                                                                                                        }}
                                                                                                    />
                                                                                                    <span className="text-sm font-medium text-gray-700 italic">{subsub}</span>
                                                                                                    <span className="text-xs text-gray-400">({tasks.length})</span>
                                                                                                    {canEdit && (
                                                                                                        <button
                                                                                                            onClick={(e) => {
                                                                                                                e.stopPropagation();
                                                                                                                openCreateModal(category, subcat, subsub);
                                                                                                            }}
                                                                                                            className="ml-2 p-1 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                                                                                                            title="เพิ่มงานในกลุ่มนี้"
                                                                                                        >
                                                                                                            <Plus className="w-3 h-3" />
                                                                                                        </button>
                                                                                                    )}
                                                                                                </div>
                                                                                            </td>
                                                                                            <td className="px-4 py-2 text-center text-sm text-gray-300">-</td>
                                                                                            <td className="px-4 py-2 text-center text-xs text-gray-600 tabular-nums">
                                                                                                {subSubStats.minStartDate ? `${formatDateTH(subSubStats.minStartDate)} - ${formatDateTH(subSubStats.maxEndDate)}` : '-'}
                                                                                            </td>
                                                                                            <td className="px-4 py-2 text-right text-xs text-gray-900 tabular-nums">{subSubStats.totalCost.toLocaleString()}</td>
                                                                                            <td className="px-4 py-2 text-center text-sm text-gray-500">-</td>
                                                                                            <td className="px-4 py-2">
                                                                                                <div className="flex items-center gap-2">
                                                                                                    <div className="flex-1 bg-gray-100 rounded-sm h-1 overflow-hidden border border-gray-300">
                                                                                                        <div className="h-full rounded-sm transition-all duration-500"
                                                                                                            style={{ width: `${subSubStats.avgProgress}%`, backgroundColor: subSubColor }}></div>
                                                                                                    </div>
                                                                                                    <span className="text-xs text-gray-600 w-8 text-right tabular-nums">{subSubStats.avgProgress.toFixed(0)}%</span>
                                                                                                </div>
                                                                                            </td>
                                                                                            <td className="px-4 py-2 text-center">-</td>
                                                                                            <td className="px-4 py-2 text-center">-</td>
                                                                                        </tr>

                                                                                        {/* Level 3 Tasks */}
                                                                                        {!isSubSubCollapsed && tasks.map(task => (
                                                                                            <tr
                                                                                                key={task.id}
                                                                                                draggable={canEdit}
                                                                                                onDragStart={(e) => handleDragStart(e, task.id)}
                                                                                                onDragOver={handleDragOver}
                                                                                                onDrop={(e) => handleDrop(e, task)}
                                                                                                className={`hover:bg-gray-50 transition-colors ${draggingTaskId === task.id ? 'opacity-40 bg-gray-100 border-2 border-dashed border-gray-400' : ''}`}
                                                                                            >
                                                                                                <td className="px-2 py-2 text-center cursor-move text-gray-400 hover:text-gray-600">
                                                                                                    {canEdit && <GripVertical className="w-4 h-4 mx-auto" />}
                                                                                                </td>
                                                                                                <td className="px-4 py-2 pl-24 border-l-2 border-transparent hover:borderlue-200">
                                                                                                    <span className="text-sm text-gray-900 font-medium">{task.name}</span>
                                                                                                </td>
                                                                                                <td className="px-4 py-2 text-left text-xs text-gray-600 border-l border-transparent truncate max-w-[120px]">
                                                                                                    {task.responsible || '-'}
                                                                                                </td>
                                                                                                <td className="px-4 py-2 text-center text-xs text-gray-600 tabular-nums">
                                                                                                    <div className="flex flex-col gap-0.5">
                                                                                                        <span>{formatDateTH(task.planStartDate)} - {formatDateTH(task.planEndDate)}</span>
                                                                                                        {task.actualStartDate && (
                                                                                                            <span className="text-emerald-600 font-medium">
                                                                                                                {formatDateTH(task.actualStartDate)} - {task.actualEndDate ? formatDateTH(task.actualEndDate) : '...'}
                                                                                                            </span>
                                                                                                        )}
                                                                                                    </div>
                                                                                                </td>
                                                                                                <td className="px-4 py-2 text-right text-xs text-gray-900 tabular-nums">
                                                                                                    {(task.cost || 0).toLocaleString()}
                                                                                                </td>
                                                                                                <td className="px-4 py-2 text-center text-xs text-gray-500">{task.quantity || '-'}</td>
                                                                                                <td className="px-4 py-2">
                                                                                                    <div className="flex items-center gap-2">
                                                                                                        <div className="flex-1 bg-gray-100 rounded-sm h-1.5 overflow-hidden border border-gray-300">
                                                                                                            <div className={`h-full ${task.progress === 100 ? 'bg-emerald-500' : 'bg-blue-600'}`} style={{ width: `${task.progress}%` }}></div>
                                                                                                        </div>
                                                                                                        <span className="text-xs text-gray-600 w-8 text-right tabular-nums">{task.progress}%</span>
                                                                                                    </div>
                                                                                                </td>
                                                                                                <td className="px-4 py-2 text-center">
                                                                                                    {getStatusBadge(task.status, task.progress)}
                                                                                                </td>
                                                                                                <td className="px-4 py-2">
                                                                                                    <div className="flex items-center justify-center gap-1 opacity-100">
                                                                                                        {canUpdateProgress && <button onClick={() => openProgressModal(task)} className="p-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-all"><TrendingUp className="w-4 h-4" /></button>}
                                                                                                        {canEdit && (
                                                                                                            <>
                                                                                                                <button onClick={() => openEditModal(task)} className="p-1 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-all"><Edit2 className="w-4 h-4" /></button>
                                                                                                                <button onClick={() => handleDelete(task)} className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-all"><Trash2 className="w-4 h-4" /></button>
                                                                                                            </>
                                                                                                        )}
                                                                                                    </div>
                                                                                                </td>
                                                                                            </tr>
                                                                                        ))}
                                                                                    </React.Fragment>
                                                                                );
                                                                            })}

                                                                            {/* Level 2 Direct Tasks */}
                                                                            {subData.tasks.map(task => (
                                                                                <tr
                                                                                    key={task.id}
                                                                                    draggable={canEdit}
                                                                                    onDragStart={(e) => handleDragStart(e, task.id)}
                                                                                    onDragOver={handleDragOver}
                                                                                    onDrop={(e) => handleDrop(e, task)}
                                                                                    className={`hover:bg-gray-50 transition-colors ${draggingTaskId === task.id ? 'opacity-50 bg-blue-50' : ''}`}
                                                                                >
                                                                                    <td className="px-2 py-2 text-center cursor-move text-gray-400 hover:text-gray-600">
                                                                                        {canEdit && <GripVertical className="w-4 h-4 mx-auto" />}
                                                                                    </td>
                                                                                    <td className="px-4 py-2 pl-16 border-l-2 border-transparent hover:border-amber-200">
                                                                                        <span className="text-sm text-gray-900 font-medium">{task.name}</span>
                                                                                    </td>
                                                                                    <td className="px-4 py-2 text-left text-xs text-gray-600 border-l border-transparent truncate max-w-[120px]">
                                                                                        {task.responsible || '-'}
                                                                                    </td>
                                                                                    <td className="px-4 py-2 text-center text-xs text-gray-600 tabular-nums">
                                                                                        <div className="flex flex-col gap-0.5">
                                                                                            <span>{formatDateTH(task.planStartDate)} - {formatDateTH(task.planEndDate)}</span>
                                                                                            {task.actualStartDate && (
                                                                                                <span className="text-emerald-600 font-medium">
                                                                                                    {formatDateTH(task.actualStartDate)} - {task.actualEndDate ? formatDateTH(task.actualEndDate) : '...'}
                                                                                                </span>
                                                                                            )}
                                                                                        </div>
                                                                                    </td>
                                                                                    <td className="px-4 py-2 text-right text-xs text-gray-900 tabular-nums">
                                                                                        {(task.cost || 0).toLocaleString()}
                                                                                    </td>
                                                                                    <td className="px-4 py-2 text-center text-xs text-gray-500">{task.quantity || '-'}</td>
                                                                                    <td className="px-4 py-2">
                                                                                        <div className="flex items-center gap-2">
                                                                                            <div className="flex-1 bg-gray-100 rounded-sm h-1.5 overflow-hidden border border-gray-300">
                                                                                                <div className={`h-full ${task.progress === 100 ? 'bg-emerald-500' : 'bg-blue-600'}`} style={{ width: `${task.progress}%` }}></div>
                                                                                            </div>
                                                                                            <span className="text-xs text-gray-600 w-8 text-right tabular-nums">{task.progress}%</span>
                                                                                        </div>
                                                                                    </td>
                                                                                    <td className="px-4 py-2 text-center">
                                                                                        {getStatusBadge(task.status, task.progress)}
                                                                                    </td>
                                                                                    <td className="px-4 py-2 text-center">
                                                                                        <div className="flex items-center justify-center gap-1">
                                                                                            {canUpdateProgress && <button onClick={() => openProgressModal(task)} className="p-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-all"><TrendingUp className="w-4 h-4" /></button>}
                                                                                            {canEdit && (
                                                                                                <>
                                                                                                    <button onClick={() => openEditModal(task)} className="p-1 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-all"><Edit2 className="w-4 h-4" /></button>
                                                                                                    <button onClick={() => handleDelete(task)} className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-all"><Trash2 className="w-4 h-4" /></button>
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
                                                            <tr
                                                                key={task.id}
                                                                draggable={canEdit}
                                                                onDragStart={(e) => handleDragStart(e, task.id)}
                                                                onDragOver={handleDragOver}
                                                                onDrop={(e) => handleDrop(e, task)}
                                                                className={`hover:bg-gray-50 transition-colors ${draggingTaskId === task.id ? 'opacity-50 bg-blue-50' : ''}`}
                                                            >
                                                                <td className="px-2 py-2 text-center cursor-move text-gray-400 hover:text-gray-600">
                                                                    {canEdit && <GripVertical className="w-4 h-4 mx-auto" />}
                                                                </td>
                                                                <td className="px-4 py-2 pl-12 border-l-2 border-transparent hover:borderlue-200">
                                                                    <span className="text-sm text-gray-900 font-medium">{task.name}</span>
                                                                </td>
                                                                <td className="px-4 py-2 text-left text-xs text-gray-600 border-l border-transparent truncate max-w-[120px]">
                                                                    {task.responsible || '-'}
                                                                </td>
                                                                <td className="px-4 py-2 text-center text-xs text-gray-600 tabular-nums">
                                                                    <div className="flex flex-col gap-0.5">
                                                                        <span>{formatDateTH(task.planStartDate)} - {formatDateTH(task.planEndDate)}</span>
                                                                        {task.actualStartDate && (
                                                                            <span className="text-emerald-600 font-medium">
                                                                                {formatDateTH(task.actualStartDate)} - {task.actualEndDate ? formatDateTH(task.actualEndDate) : '...'}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                <td className="px-4 py-2 text-right text-xs text-gray-900 tabular-nums">{task.cost?.toLocaleString()}</td>
                                                                <td className="px-4 py-2 text-center text-xs text-gray-500">{task.quantity || '-'}</td>
                                                                <td className="px-4 py-2">
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="flex-1 bg-gray-100 rounded-sm h-1.5 overflow-hidden border border-gray-300">
                                                                            <div className={`h-full ${task.progress === 100 ? 'bg-emerald-500' : 'bg-blue-600'}`} style={{ width: `${task.progress}%` }}></div>
                                                                        </div>
                                                                        <span className="text-xs text-gray-600 w-8 text-right tabular-nums">{task.progress}%</span>
                                                                    </div>
                                                                </td>
                                                                <td className="px-4 py-2 text-center">{getStatusBadge(task.status, task.progress)}</td>
                                                                <td className="px-4 py-2">
                                                                    <div className="flex items-center justify-center gap-1 opacity-100">
                                                                        {canUpdateProgress && <button onClick={() => openProgressModal(task)} className="p-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-all"><TrendingUp className="w-4 h-4" /></button>}
                                                                        {canEdit && (
                                                                            <>
                                                                                <button onClick={() => openEditModal(task)} className="p-1 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-all"><Edit2 className="w-4 h-4" /></button>
                                                                                <button onClick={() => handleDelete(task)} className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-all"><Trash2 className="w-4 h-4" /></button>
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
            {
                isModalOpen && (
                    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-[2px]">
                        <div className="bg-white rounded-sm w-full max-w-4xl border border-gray-300 flex flex-col max-h-[90vh]">
                            <div className="flex items-center justify-between px-6 py-4 border border-gray-100 bg-white rounded-t-sm shrink-0">
                                <div>
                                    <h2 className="text-lg font-bold text-gray-900">
                                        {editingTask ? 'แก้ไขรายละเอียดงาน' : 'เพิ่มรายการงานใหม่'}
                                    </h2>
                                </div>
                                <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-900 transition-colors bg-gray-50 hover:bg-gray-100 p-1.5 rounded-sm">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="overflow-y-auto custom-scrollbar p-8">
                                <form onSubmit={handleSubmit} className="space-y-6">

                                    {/* Row 1: Categories */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">หมวดหมู่ <span className="text-red-500">*</span></label>
                                            <input
                                                type="text"
                                                list="categories"
                                                required
                                                value={taskForm.category}
                                                onChange={(e) => setTaskForm({ ...taskForm, category: e.target.value })}
                                                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-sm text-sm text-gray-900 focus:ring-1 focus:ring-black focus:borderlack outline-none transition-all placeholder:text-gray-400"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">หมวดหมู่ย่อย</label>
                                            <input
                                                type="text"
                                                list="subcategories"
                                                value={taskForm.subcategory}
                                                onChange={(e) => setTaskForm({ ...taskForm, subcategory: e.target.value })}
                                                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-sm text-sm text-gray-900 focus:ring-1 focus:ring-black focus:borderlack outline-none transition-all placeholder:text-gray-400"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">หมวดหมู่ย่อย 2</label>
                                            <input
                                                type="text"
                                                value={taskForm.subsubcategory}
                                                onChange={(e) => setTaskForm({ ...taskForm, subsubcategory: e.target.value })}
                                                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-sm text-sm text-gray-900 focus:ring-1 focus:ring-black focus:borderlack outline-none transition-all placeholder:text-gray-400"
                                            />
                                        </div>
                                    </div>

                                    {/* DataLists */}
                                    <datalist id="categories">
                                        {existingCategories.map((c, i) => <option key={i} value={c} />)}
                                    </datalist>
                                    <datalist id="subcategories">
                                        {existingSubcategories.map((s, i) => <option key={i} value={s} />)}
                                    </datalist>

                                    {/* Row 2: Task Name */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">ชื่อกิจกรรม / งาน <span className="text-red-500">*</span></label>
                                        <input
                                            type="text"
                                            required
                                            value={taskForm.name}
                                            onChange={(e) => setTaskForm({ ...taskForm, name: e.target.value })}
                                            placeholder="เช่น งานขุดดินฐานราก"
                                            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-sm text-sm text-gray-900 focus:ring-1 focus:ring-black focus:borderlack outline-none transition-all placeholder:text-gray-400"
                                        />
                                    </div>

                                    {/* Row 3: Dates */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">วันเริ่มต้น</label>
                                            <div className="relative">
                                                <input
                                                    type="date"
                                                    value={taskForm.planStartDate}
                                                    onChange={(e) => {
                                                        const newStart = e.target.value;
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
                                                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-sm text-sm text-gray-900 focus:ring-1 focus:ring-black focus:borderlack outline-none transition-all"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">ระยะเวลา (วัน)</label>
                                            <input
                                                type="number"
                                                min="1"
                                                value={taskForm.planDuration}
                                                onChange={(e) => {
                                                    const duration = parseInt(e.target.value) || 0;
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
                                                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-sm text-sm text-gray-900 font-semibold text-center focus:ring-1 focus:ring-black focus:borderlack outline-none transition-all"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">วันสิ้นสุด</label>
                                            <input
                                                type="date"
                                                value={taskForm.planEndDate}
                                                readOnly
                                                className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-sm text-sm text-gray-500 cursor-not-allowed"
                                            />
                                        </div>
                                    </div>

                                    {/* Row 4: Details */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">งบประมาณ (บาท)</label>
                                            <input
                                                type="number"
                                                min="0"
                                                value={taskForm.cost}
                                                onChange={(e) => setTaskForm({ ...taskForm, cost: parseFloat(e.target.value) || 0 })}
                                                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-sm text-sm text-gray-900 focus:ring-1 focus:ring-black focus:borderlack outline-none transition-all"
                                                placeholder="0"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">ปริมาณ</label>
                                            <input
                                                type="text"
                                                value={taskForm.quantity}
                                                onChange={(e) => setTaskForm({ ...taskForm, quantity: e.target.value })}
                                                placeholder="เช่น 20 ตร.ม."
                                                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-sm text-sm text-gray-900 focus:ring-1 focus:ring-black focus:borderlack outline-none transition-all placeholder:text-gray-400"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">ผู้รับผิดชอบ</label>
                                            <input
                                                type="text"
                                                list="members"
                                                value={taskForm.responsible}
                                                onChange={(e) => setTaskForm({ ...taskForm, responsible: e.target.value })}
                                                placeholder="ระบุชื่อ"
                                                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-sm text-sm text-gray-900 focus:ring-1 focus:ring-black focus:borderlack outline-none transition-all placeholder:text-gray-400"
                                            />
                                        </div>
                                    </div>
                                </form>
                            </div>

                            {/* Footer Actions */}
                            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 border-t border-gray-100 rounded-b-sm shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-sm hover:bg-gray-50 focus:outline-none transition-all"
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    onClick={handleSubmit}
                                    disabled={saving}
                                    className="px-4 py-2 text-sm font-medium text-white bg-gray-900 border border-transparent rounded-sm hover:bg-black focus:outline-none transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    {editingTask ? 'บันทึกการแก้ไข' : 'สร้างงานใหม่'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Progress Update Modal */}
            {
                isProgressModalOpen && (
                    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-sm w-full max-w-md border border-gray-300">
                            <div className="flex items-center justify-between px-6 py-4 border border-gray-300 bg-gray-50 rounded-t-sm">
                                <h2 className="text-lg font-bold text-gray-900">อัปเดทความคืบหน้า</h2>
                                <button onClick={() => setIsProgressModalOpen(false)} className="p-1.5 hover:bg-gray-200 rounded-sm transition-colors">
                                    <X className="w-4 h-4 text-gray-500" />
                                </button>
                            </div>
                            <div className="p-6 space-y-4">
                                <div className="bg-gray-50 p-3 rounded-sm">
                                    <p className="text-xs text-gray-500">งาน</p>
                                    <p className="font-medium text-gray-900">{progressForm.taskName}</p>
                                    <div className="mt-2 pt-2 border-t border-gray-300 flex items-center text-xs text-gray-500 gap-2">
                                        <span className="font-medium">แผนงาน:</span>
                                        <span>{formatDateTH(progressForm.planStartDate)} - {formatDateTH(progressForm.planEndDate)}</span>
                                    </div>
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
                                            className="flex-1 h-2 bg-gray-200 rounded-sm appearance-none cursor-pointer accent-black"
                                        />
                                        <span className="text-2xl font-bold text-gray-900 w-16 text-right">{progressForm.newProgress}%</span>
                                    </div>
                                    <div className="flex justify-between mt-2">
                                        {[0, 25, 50, 75, 100].map(v => (
                                            <button
                                                key={v}
                                                type="button"
                                                onClick={() => setProgressForm({ ...progressForm, newProgress: v })}
                                                className={`px-2 py-1 text-xs rounded-sm font-medium border ${progressForm.newProgress === v ? 'bg-black text-white borderlack' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
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
                                            className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:ring-1 focus:ring-black focus:borderlack"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">วันที่เสร็จจริง</label>
                                        <input
                                            type="date"
                                            value={progressForm.actualEndDate}
                                            onChange={(e) => setProgressForm({ ...progressForm, actualEndDate: e.target.value })}
                                            disabled={progressForm.newProgress < 100}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm disabled:bg-gray-50 focus:ring-1 focus:ring-black focus:borderlack"
                                        />
                                    </div>
                                </div>

                                <div className="flex justify-end gap-3 pt-4 border-t border-gray-300">
                                    <button type="button" onClick={() => setIsProgressModalOpen(false)} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-sm text-sm font-medium border border-gray-300">
                                        ยกเลิก
                                    </button>
                                    <button
                                        onClick={handleProgressSubmit}
                                        disabled={savingProgress}
                                        className="px-6 py-2 bg-black text-white rounded-sm hover:bg-gray-800 text-sm font-medium flex items-center gap-2 disabled:opacity-50"
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
                        <div className="bg-white rounded-sm shadow-none border border-gray-300 max-w-sm w-full p-6 text-center">
                            <div className={`w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center ${alertDialog.type === 'error' ? 'bg-red-100' : alertDialog.type === 'confirm' ? 'bg-blue-100' : 'bg-gray-100'}`}>
                                {alertDialog.type === 'error' ? <AlertTriangle className="w-6 h-6 text-red-600" /> : <Info className="w-6 h-6 text-blue-600" />}
                            </div>
                            <h3 className="text-lg font-bold text-gray-900 mb-2">{alertDialog.title}</h3>
                            <p className="text-sm text-gray-500 mb-6">{alertDialog.message}</p>
                            <div className="flex gap-3 justify-center">
                                {alertDialog.type === 'confirm' && (
                                    <button onClick={() => setAlertDialog(prev => ({ ...prev, isOpen: false }))} className="px-4 py-2 text-gray-700 bg-gray-100 rounded-sm hover:bg-gray-200 text-sm font-medium">
                                        ยกเลิก
                                    </button>
                                )}
                                <button
                                    onClick={alertDialog.onConfirm || (() => setAlertDialog(prev => ({ ...prev, isOpen: false })))}
                                    className={`px-4 py-2 text-white rounded-sm text-sm font-medium ${alertDialog.type === 'error' ? 'bg-red-600 hover:bg-red-700' : 'bg-black hover:bg-gray-800'}`}
                                >
                                    ตกลง
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
            {/* Color Menu Popup */}
            {
                activeColorMenu && (
                    <>
                        <div
                            className="fixed inset-0 z-[998]"
                            onClick={() => setActiveColorMenu(null)}
                        />
                        <div
                            className="fixed z-[999] bg-white rounded-sm shadow-none border border-gray-300 p-3 w-40"
                            style={{ top: activeColorMenu.top, left: activeColorMenu.left }}
                        >
                            <div className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">Select Color</div>
                            <div className="grid grid-cols-4 gap-2">
                                {[
                                    '#3b82f6', // Blue
                                    '#ef4444', // Red
                                    '#22c55e', // Green
                                    '#eab308', // Yellow
                                    '#a855f7', // Purple
                                    '#ec4899', // Pink
                                    '#f97316', // Orange
                                    '#6b7280'  // Gray
                                ].map(color => (
                                    <button
                                        key={color}
                                        className="w-6 h-6 rounded-full border border-gray-300 hover:scale-110 transition-transform focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-400"
                                        style={{ backgroundColor: color }}
                                        onClick={() => {
                                            const newColors = { ...categoryColors, [activeColorMenu.id]: color };
                                            setCategoryColors(newColors);
                                            localStorage.setItem('gantt_category_colors', JSON.stringify(newColors));
                                            setActiveColorMenu(null);
                                        }}
                                        title={color}
                                    />
                                ))}
                            </div>
                        </div>
                    </>
                )
            }
        </div >
    );
}
