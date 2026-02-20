
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
    Save,
    ArrowUp,
    ArrowDown,
    GripVertical,
    Settings2,
    MoreHorizontal,
    FileInput,
    Layout
} from 'lucide-react';
import { format, parseISO, differenceInDays, addDays } from 'date-fns';
import { todayISO, formatDateShort, calcDurationDays, parseLocalDate } from '@/lib/dateUtils';
import { Project, Task, Employee } from '@/types/construction';
import { getProject, getTasks, createTask, updateTask, deleteTask, getEmployees, syncGroupProgress, batchCreateTasks, deleteAllTasks } from '@/lib/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { COST_CODES, getCostCodeName } from '@/constants/costCodes';

// Helper: Format date to Thai short format (uses centralized dateUtils)
const formatDateTH = (dateStr: string | undefined | null) => formatDateShort(dateStr);

// Helper: Calculate duration in days (uses centralized dateUtils)
const calcDuration = (start: string, end: string) => calcDurationDays(start, end);

export default function ProjectDetailPage() {
    const { user } = useAuth();
    const params = useParams();
    const router = useRouter();
    const projectId = params.id as string;

    // Data State
    const [project, setProject] = useState<Project | null>(null);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
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
        assignedEmployeeIds: [] as string[],
        costCode: '',
    });

    // Progress Modal
    const [isProgressModalOpen, setIsProgressModalOpen] = useState(false);
    const [progressForm, setProgressForm] = useState({
        taskId: '',
        taskName: '',
        newProgress: 0,
        updateDate: todayISO(),
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
    type OptionalColumnKey = 'planDate' | 'cost' | 'quantity' | 'duration' | 'responsible' | 'progress' | 'status' | 'actions' | 'costCode';
    const [visibleColumns, setVisibleColumns] = useState<Record<OptionalColumnKey, boolean>>({
        planDate: true,
        cost: true,
        quantity: true,
        duration: true,
        responsible: true,
        progress: true,
        status: true,
        costCode: true,
        actions: true,
    });
    const [isColumnMenuOpen, setIsColumnMenuOpen] = useState(false);
    const columnMenuRef = React.useRef<HTMLDivElement | null>(null);

    // Alert Dialog
    const [alertDialog, setAlertDialog] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        type: 'info' | 'confirm' | 'error';
        onConfirm?: () => void;
    }>({ isOpen: false, title: '', message: '', type: 'info' });

    // Menu States
    const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
    const [isManageMenuOpen, setIsManageMenuOpen] = useState(false);
    const viewMenuRef = React.useRef<HTMLDivElement>(null);
    const manageMenuRef = React.useRef<HTMLDivElement>(null);


    // Category Colors State (Synced with Gantt)
    const [categoryColors, setCategoryColors] = useState<Record<string, string>>({});
    const [activeColorMenu, setActiveColorMenu] = useState<{ key: string; top: number; left: number } | null>(null);
    const COLORS = ['#2563eb', '#16a34a', '#dc2626', '#ca8a04', '#7c3aed', '#ea580c', '#0891b2', '#6b7280'];

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

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (columnMenuRef.current && !columnMenuRef.current.contains(event.target as Node)) {
                setIsColumnMenuOpen(false);
            }
            if (viewMenuRef.current && !viewMenuRef.current.contains(event.target as Node)) {
                setIsViewMenuOpen(false);
            }
            if (manageMenuRef.current && !manageMenuRef.current.contains(event.target as Node)) {
                setIsManageMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [projectData, tasksData, employeesData] = await Promise.all([
                getProject(projectId),
                getTasks(projectId),
                getEmployees()
            ]);
            setProject(projectData);
            // Sort tasks by order
            setTasks(tasksData.sort((a, b) => (a.order || 0) - (b.order || 0)));
            setEmployees(employeesData);
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

    const getEffectiveStatus = (task: Task): Task['status'] => {
        if ((task.progress || 0) >= 100) return 'completed';
        return task.status || 'not-started';
    };

    // Project Stats
    const projectStats = useMemo(() => {
        const total = tasks.length;
        const completed = tasks.filter(t => getEffectiveStatus(t) === 'completed').length;
        const inProgress = tasks.filter(t => getEffectiveStatus(t) === 'in-progress').length;
        const notStarted = tasks.filter(t => getEffectiveStatus(t) === 'not-started').length;

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
            planStartDate: project?.startDate || todayISO(),
            planEndDate: project?.endDate || '',
            progress: 0,
            responsible: '',
            assignedEmployeeIds: [],
            planDuration: 1,
            costCode: ''
        });
        setIsModalOpen(true);
        setShowSubcategory(!!initialSubcategory);
        setShowSubSubcategory(!!initialSubSubcategory);
    };

    const openEditModal = (task: Task) => {
        const fallbackAssignedIds = task.responsible
            ? task.responsible
                .split(',')
                .map(name => name.trim().toLowerCase())
                .filter(Boolean)
                .map(name => employees.find(emp => emp.name.trim().toLowerCase() === name)?.id)
                .filter((id): id is string => Boolean(id))
            : [];

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
            assignedEmployeeIds: task.assignedEmployeeIds || fallbackAssignedIds,
            planDuration: task.planDuration || calcDurationDays(task.planStartDate, task.planEndDate) || 1,
            costCode: task.costCode || ''
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

            const assignedEmployeeIds = taskForm.assignedEmployeeIds || [];
            const responsibleNames = employees
                .filter(emp => assignedEmployeeIds.includes(emp.id))
                .map(emp => emp.name)
                .join(', ');

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
                costCode: taskForm.costCode,
                progress: taskForm.progress,
                responsible: responsibleNames,
                assignedEmployeeIds,
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
            message: `ต้องการลบงาน "${task.name}" หรือไม่ ? `,
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
            message: `คุณแน่ใจหรือไม่ที่จะลบงานทั้งหมด ${tasks.length} รายการ ? การกระทำนี้ไม่สามารถย้อนกลับได้`,
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
                // Let's assume Category Reorder only works on top level rows for now.
                if (target.includes('::')) return;

                const targetCat = target;
                if (sourceCat === targetCat) return;

                const allCats = Object.keys(hierarchicalData);
                const currentOrder = categoryOrder.length > 0 ? [...categoryOrder] : [...allCats];

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

        // Optimistic Update
        const newTasks = [...tasks];
        const sourceIndex = newTasks.findIndex(t => t.id === sourceId);
        newTasks.splice(sourceIndex, 1);

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
            const taskOrder = task.order || 0;
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
            'Actual End',
            'Cost Code'
        ];

        // Add instruction row
        const instructionRow = [
            'หมวดหมู่',
            'หมวดหมู่ย่อย',
            'หมวดหมู่ย่อยระดับ 3',
            'ประเภท (task/group)',
            'ชื่องาน',
            'วันเริ่มต้น (dd/MM/yyyy)',
            'วันสิ้นสุด (dd/MM/yyyy)',
            'ระยะเวลา (วัน)',
            'ค่าใช้จ่าย',
            'จำนวน',
            'ผู้รับผิดชอบ',
            'ความคืบหน้า (%)',
            'สถานะ',
            'วันเริ่มจริง (dd/MM/yyyy)',
            'วันสิ้นสุดจริง (dd/MM/yyyy)',
            'รหัสต้นทุน'
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
            getEffectiveStatus(t),
            formatDateForCSV(t.actualStartDate),
            formatDateForCSV(t.actualEndDate),
            `"${(t.costCode || '').replace(/"/g, '""')}"`
        ]);

        // Add BOM for Excel Thai support
        const csvContent = '\uFEFF' + [
            headers.join(','),
            instructionRow.map(c => `"${c}"`).join(','),
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

                const planStart = row['Plan Start'] || row['PlanStartDate'] || row['วันเริ่มต้น'] || '';
                const planEnd = row['Plan End'] || row['PlanEndDate'] || row['วันสิ้นสุด'] || '';
                const duration = parseInt(row['Duration'] || row['Duration (Days)'] || row['PlanDuration'] || row['ระยะเวลา'] || '0');

                // Helper to fix dates
                const fixDate = (val: string) => {
                    if (!val || val === '-') return '';
                    const cleaned = val.trim();
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

                // Recalc end date if duration exists but end date doesn't
                if (pStart && duration > 0 && !pEnd) {
                    try {
                        pEnd = format(addDays(parseISO(pStart), duration - 1), 'yyyy-MM-dd');
                    } catch { }
                }

                const importedProgress = parseFloat((row['Progress'] || row['Progress (%)'] || row['ความคืบหน้า'] || '0').replace('%', ''));
                const rawImportedStatus = (row['Status'] || 'not-started').toLowerCase();
                const normalizedStatus: Task['status'] =
                    importedProgress >= 100
                        ? 'completed'
                        : rawImportedStatus === 'completed' || rawImportedStatus === 'in-progress' || rawImportedStatus === 'delayed' || rawImportedStatus === 'not-started'
                            ? rawImportedStatus
                            : 'not-started';

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
                    progress: importedProgress,
                    status: normalizedStatus,
                    order: ++orderCounter,
                    actualStartDate: fixDate(row['Actual Start'] || ''),
                    actualEndDate: fixDate(row['Actual End'] || ''),
                    costCode: row['Cost Code'] || row['รหัสต้นทุน'] || ''
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
        // Reuse handleExport logic effectively via a sample data call or just constructing it
        const headers = [
            'Category', 'Subcategory', 'SubSubcategory', 'Type', 'Task Name',
            'Plan Start', 'Plan End', 'Duration (Days)', 'Cost',
            'Quantity', 'Responsible', 'Progress (%)', 'Status', 'Cost Code'
        ];

        const instruction = [
            'หมวดหมู่ (จำเป็น)', 'หมวดหมู่ย่อย', 'หมวดหมู่ย่อย 2', 'task/group', 'ชื่องาน (จำเป็น)',
            'dd/MM/yyyy', 'dd/MM/yyyy', 'จำนวนวัน', 'บาท',
            'หน่วย', 'ชื่อผู้รับผิดชอบ', '0-100', 'not-started/in-progress/completed', 'รหัสต้นทุน'
        ];

        const sample = [
            ['งานเตรียมการ', '', '', 'task', 'งานรื้อถอน', '01/01/2024', '05/01/2024', '5', '10000', '1 งาน', 'ช่าง ก', '0', 'not-started', '1'],
            ['งานโครงสร้าง', 'งานฐานราก', '', 'task', 'ขุดดิน', '06/01/2024', '10/01/2024', '5', '5000', '10 ลบ.ม.', 'ช่าง ข', '0', 'not-started', '3'],
            ['งานโครงสร้าง', 'งานฐานราก', 'งานเหล็กเสริม', 'task', 'ผูกเหล็ก', '11/01/2024', '15/01/2024', '5', '20000', '100 กก.', 'ช่าง ค', '0', 'not-started', '1']
        ];

        const csvContent = '\uFEFF' + [
            headers.join(','),
            instruction.map(s => `"${s}"`).join(','),
            ...sample.map(r => r.map(c => `"${c}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'import_template.csv';
        link.click();
    };

    const openProgressModal = (task: Task) => {
        setProgressForm({
            taskId: task.id,
            taskName: task.name,
            newProgress: task.progress,
            updateDate: todayISO(),
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
    const employeeById = useMemo(() => new Map(employees.map(emp => [emp.id, emp])), [employees]);
    const employeeByName = useMemo(
        () => new Map(employees.map(emp => [emp.name.trim().toLowerCase(), emp])),
        [employees]
    );
    const selectedAssignedEmployees = useMemo(
        () => employees.filter(employee => taskForm.assignedEmployeeIds.includes(employee.id)),
        [employees, taskForm.assignedEmployeeIds]
    );

    const getResponsibleEmployees = (task: Task) => {
        const byId = (task.assignedEmployeeIds || [])
            .map(id => employeeById.get(id))
            .filter((emp): emp is Employee => Boolean(emp));
        if (byId.length > 0) return byId;

        const fromNames: Employee[] = [];
        const seen = new Set<string>();
        (task.responsible || '')
            .split(',')
            .map(name => name.trim().toLowerCase())
            .filter(Boolean)
            .forEach(name => {
                const emp = employeeByName.get(name);
                if (emp && !seen.has(emp.id)) {
                    seen.add(emp.id);
                    fromNames.push(emp);
                }
            });
        return fromNames;
    };

    const renderResponsibleAvatars = (task: Task) => {
        const assignees = getResponsibleEmployees(task);
        if (assignees.length === 0) {
            return <span className="text-gray-500">-</span>;
        }

        const maxVisible = 3;
        const visible = assignees.slice(0, maxVisible);
        const remaining = assignees.length - visible.length;
        const title = assignees.map(emp => emp.name).join(', ');

        return (
            <div className="flex items-center gap-2" title={title}>
                <div className="flex -space-x-2">
                    {visible.map(emp => (
                        emp.avatarBase64 ? (
                            <img
                                key={emp.id}
                                src={emp.avatarBase64}
                                alt={emp.name}
                                className="w-6 h-6 rounded-full object-cover border-2 border-white"
                            />
                        ) : (
                            <span
                                key={emp.id}
                                className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 text-[10px] font-semibold border-2 border-white flex items-center justify-center"
                            >
                                {emp.name.slice(0, 1)}
                            </span>
                        )
                    ))}
                    {remaining > 0 && (
                        <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 text-[10px] font-semibold border-2 border-white flex items-center justify-center">
                            +{remaining}
                        </span>
                    )}
                </div>
            </div>
        );
    };

    const toggleAssignedEmployee = (employeeId: string) => {
        setTaskForm(prev => {
            const nextIds = prev.assignedEmployeeIds.includes(employeeId)
                ? prev.assignedEmployeeIds.filter(id => id !== employeeId)
                : [...prev.assignedEmployeeIds, employeeId];

            const responsibleNames = employees
                .filter(emp => nextIds.includes(emp.id))
                .map(emp => emp.name)
                .join(', ');

            return {
                ...prev,
                assignedEmployeeIds: nextIds,
                responsible: responsibleNames
            };
        });
    };

    const openColorMenu = (e: React.MouseEvent<HTMLElement>, key: string) => {
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        setActiveColorMenu({
            key,
            top: rect.bottom + window.scrollY,
            left: rect.left + window.scrollX
        });
    };

    const handleColorChange = (color: string) => {
        if (!activeColorMenu) return;
        const next = { ...categoryColors, [activeColorMenu.key]: color };
        setCategoryColors(next);
        localStorage.setItem('gantt_category_colors', JSON.stringify(next));
        setActiveColorMenu(null);
    };

    // Status Badge
    const getStatusBadge = (status: string) => {
        const configs: Record<string, { class: string; label: string }> = {
            'completed': { class: 'bg-emerald-100 text-emerald-800 border border-emerald-200', label: 'เสร็จสิ้น' },
            'in-progress': { class: 'bg-blue-100 text-blue-800 border border-blue-200', label: 'กำลังดำเนินการ' },
            'not-started': { class: 'bg-slate-100 text-slate-700 border border-slate-200', label: 'ยังไม่เริ่ม' },
            'delayed': { class: 'bg-rose-100 text-rose-800 border border-rose-200', label: 'ล่าช้า' },
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

    const formatDateRangeTH = (start?: string | null, end?: string | null) => {
        const s = formatDateTH(start || '');
        const e = formatDateTH(end || '');
        if (s === '-' && e === '-') return '-';
        return `${s} - ${e}`;
    };

    const renderPlanActualDate = (
        planStart?: string | null,
        planEnd?: string | null,
        actualStart?: string | null,
        actualEnd?: string | null
    ) => {
        const planRange = formatDateRangeTH(planStart, planEnd);
        const actualRange = formatDateRangeTH(actualStart, actualEnd);

        return (
            <div className="leading-tight">
                <div className="text-xs text-gray-700 tabular-nums whitespace-nowrap">{planRange}</div>
                <div className="text-[11px] text-emerald-600 tabular-nums whitespace-nowrap">{actualRange}</div>
            </div>
        );
    };

    const getTaskDuration = (task: Task) => task.planDuration || calcDuration(task.planStartDate, task.planEndDate);

    const columnOptions: Array<{ key: OptionalColumnKey; label: string }> = [
        { key: 'planDate', label: 'วันที่แผน/จริง' },
        { key: 'cost', label: 'Cost' },
        { key: 'quantity', label: "Q'ty" },
        { key: 'duration', label: 'ระยะเวลา' },
        { key: 'responsible', label: 'ผู้รับผิดชอบ' },
        { key: 'progress', label: 'Progress' },
        { key: 'status', label: 'สถานะ' },
        { key: 'status', label: 'สถานะ' },
        { key: 'costCode', label: 'Cost Code' },
        { key: 'actions', label: 'Actions' },
    ];

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
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 flex-1 items-start gap-4">
                    <Link href="/projects" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                        <ArrowLeft className="w-5 h-5 text-gray-600" />
                    </Link>
                    <div className="min-w-0">
                        <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
                        <p
                            className="mt-0.5 max-w-[900px] truncate text-sm text-gray-500"
                            title={project.description || 'No description'}
                        >
                            {project.description || '\u0E44\u0E21\u0E48\u0E21\u0E35\u0E04\u0E33\u0E2D\u0E18\u0E34\u0E1B\u0E32\u0E22'}
                        </p>
                    </div>
                </div>

                {/* Views Dropdown & Manage Dropdown Here */}
                <div className="flex flex-wrap gap-2 sm:ml-auto sm:justify-end items-center">
                    {/* Views Dropdown */}
                    <div className="relative" ref={viewMenuRef}>
                        <button
                            onClick={() => setIsViewMenuOpen(!isViewMenuOpen)}
                            className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-sm hover:bg-gray-50 transition-colors flex items-center gap-1.5"
                        >
                            <Layout className="w-4 h-4 text-gray-500" />
                            Views
                            <ChevronDown className="w-3 h-3 text-gray-400" />
                        </button>

                        {isViewMenuOpen && (
                            <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded  z-50 py-1">
                                <Link
                                    href={`/gantt/${projectId}`}
                                    className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                    onClick={() => setIsViewMenuOpen(false)}
                                >
                                    <Layers className="w-4 h-4 text-blue-600" />
                                    Gantt Chart
                                </Link>
                                <Link
                                    href={`/cost-code/${projectId}`}
                                    className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                    onClick={() => setIsViewMenuOpen(false)}
                                >
                                    <Target className="w-4 h-4 text-purple-600" />
                                    Cost Code Summary
                                </Link>
                                <Link
                                    href={`/gantt-4w/${projectId}`}
                                    className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                    onClick={() => setIsViewMenuOpen(false)}
                                >
                                    <Calendar className="w-4 h-4 text-indigo-600" />
                                    4-Week Lookahead
                                </Link>
                                <Link
                                    href={`/procurement/${projectId}`}
                                    className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                    onClick={() => setIsViewMenuOpen(false)}
                                >
                                    <Calendar className="w-4 h-4 text-amber-600" />
                                    Procurement Plan
                                </Link>
                                <Link
                                    href={`/scurve/${projectId}`}
                                    className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                    onClick={() => setIsViewMenuOpen(false)}
                                >
                                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                                    S-Curve Analysis
                                </Link>
                            </div>
                        )}
                    </div>

                    {canEdit && (
                        <>
                            {/* Manage Dropdown */}
                            <div className="relative" ref={manageMenuRef}>
                                <button
                                    onClick={() => setIsManageMenuOpen(!isManageMenuOpen)}
                                    className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-sm hover:bg-gray-50 transition-colors flex items-center gap-1.5"
                                >
                                    <Settings2 className="w-4 h-4 text-gray-500" />
                                    Manage
                                    <ChevronDown className="w-3 h-3 text-gray-400" />
                                </button>

                                {isManageMenuOpen && (
                                    <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded  z-50 py-1">
                                        <button
                                            onClick={() => {
                                                handleExport();
                                                setIsManageMenuOpen(false);
                                            }}
                                            className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                        >
                                            <Download className="w-4 h-4" />
                                            Export CSV
                                        </button>
                                        <button
                                            onClick={() => {
                                                handleDownloadTemplate();
                                                setIsManageMenuOpen(false);
                                            }}
                                            className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                        >
                                            <FileInput className="w-4 h-4" />
                                            Download Template
                                        </button>
                                        <label className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 cursor-pointer">
                                            <Upload className="w-4 h-4" />
                                            Import CSV
                                            <input type="file" accept=".csv" onChange={(e) => {
                                                handleImport(e);
                                                setIsManageMenuOpen(false);
                                            }} className="hidden" />
                                        </label>
                                        <div className="h-px bg-gray-100 my-1" />
                                        <button
                                            onClick={() => {
                                                handleDeleteAllTasks();
                                                setIsManageMenuOpen(false);
                                            }}
                                            className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                            Delete All Data
                                        </button>
                                    </div>
                                )}
                            </div>

                            <button
                                onClick={() => openCreateModal()}
                                className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-sm hover:bg-blue-700 transition-colors flex items-center gap-1.5 shadow-sm"
                            >
                                <Plus className="w-4 h-4" />
                                เพิ่มงานใหม่
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Project Overview Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-1.5">
                <div className="bg-white rounded-md border border-gray-200 p-2">
                    <div className="flex items-center gap-1.5">
                        <div className="w-6 h-6 bg-blue-100 rounded flex items-center justify-center">
                            <Target className="w-3 h-3 text-blue-600" />
                        </div>
                        <div>
                            <p className="text-[11px] text-gray-500 leading-none mb-0.5">ความคืบหน้า</p>
                            <p className="text-lg leading-none font-bold text-gray-900">{projectStats.overallProgress.toFixed(1)}%</p>
                        </div>
                    </div>
                    <div className="mt-1.5">
                        <ProgressBar value={projectStats.overallProgress} size="md" />
                    </div>
                </div>

                <div className="bg-white rounded-md border border-gray-200 p-2">
                    <div className="flex items-center gap-1.5">
                        <div className="w-6 h-6 bg-green-100 rounded flex items-center justify-center">
                            <CheckCircle2 className="w-3 h-3 text-green-600" />
                        </div>
                        <div>
                            <p className="text-[11px] text-gray-500 leading-none mb-0.5">เสร็จสิ้น</p>
                            <p className="text-lg leading-none font-bold text-gray-900">{projectStats.completed}/{projectStats.total}</p>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-md border border-gray-200 p-2">
                    <div className="flex items-center gap-1.5">
                        <div className="w-6 h-6 bg-amber-100 rounded flex items-center justify-center">
                            <Clock className="w-3 h-3 text-amber-600" />
                        </div>
                        <div>
                            <p className="text-[11px] text-gray-500 leading-none mb-0.5">กำลังดำเนินการ</p>
                            <p className="text-lg leading-none font-bold text-gray-900">{projectStats.inProgress}</p>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-md border border-gray-200 p-2">
                    <div className="flex items-center gap-1.5">
                        <div className="w-6 h-6 bg-purple-100 rounded flex items-center justify-center">
                            <TrendingUp className="w-3 h-3 text-purple-600" />
                        </div>
                        <div>
                            <p className="text-[11px] text-gray-500 leading-none mb-0.5">งบประมาณรวม</p>
                            <p className="text-lg leading-none font-bold text-gray-900">{projectStats.totalCost.toLocaleString()}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Task Table */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-visible ">
                <div className="px-4 py-3 border-b border-gray-200 bg-slate-50 flex items-center justify-between">
                    <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                        <ListTodo className="w-5 h-5 text-blue-600" />
                        รายการงาน ({tasks.length} รายการ)
                    </h2>
                    <div className="relative z-[70]" ref={columnMenuRef}>
                        <button
                            type="button"
                            onClick={() => setIsColumnMenuOpen(prev => !prev)}
                            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 bg-white border border-gray-200 rounded-sm hover:bg-gray-50"
                        >
                            <Settings2 className="w-4 h-4" />
                            คอลัมน์
                        </button>
                        {isColumnMenuOpen && (
                            <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-lg  z-[80] p-2">
                                {columnOptions.map((col) => (
                                    <label key={col.key} className="flex items-center gap-2 px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50 rounded cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={visibleColumns[col.key]}
                                            onChange={() =>
                                                setVisibleColumns(prev => ({
                                                    ...prev,
                                                    [col.key]: !prev[col.key]
                                                }))
                                            }
                                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        {col.label}
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>
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
                        <table className="w-full text-[13px] text-gray-800">
                            <thead className="bg-slate-50 border-b border-gray-200 sticky top-0 z-10">
                                <tr>
                                    <th className="w-10 px-2 py-3 bg-slate-50"></th>
                                    <th className="w-[360px] min-w-[360px] px-4 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wide sticky left-0 z-30 bg-slate-50">ชื่องาน</th>
                                    {visibleColumns.planDate && <th className="px-3 py-3 text-center text-[11px] font-bold text-slate-500 uppercase tracking-wide">วันที่แผน/จริง</th>}
                                    {visibleColumns.cost && <th className="px-3 py-3 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wide">Cost</th>}
                                    {visibleColumns.quantity && <th className="px-3 py-3 text-center text-[11px] font-bold text-slate-500 uppercase tracking-wide">Q'ty</th>}
                                    {visibleColumns.duration && <th className="px-3 py-3 text-center text-[11px] font-bold text-slate-500 uppercase tracking-wide">ระยะเวลา</th>}
                                    {visibleColumns.responsible && <th className="px-3 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wide">ผู้รับผิดชอบ</th>}
                                    {visibleColumns.progress && <th className="px-3 py-3 text-center text-[11px] font-bold text-slate-500 uppercase tracking-wide">Progress</th>}
                                    {visibleColumns.status && <th className="px-3 py-3 text-center text-[11px] font-bold text-slate-500 uppercase tracking-wide">สถานะ</th>}
                                    {visibleColumns.costCode && <th className="px-3 py-3 text-center text-[11px] font-bold text-slate-500 uppercase tracking-wide">Cost Code</th>}
                                    {visibleColumns.actions && <th className="px-3 py-3 text-center text-[11px] font-bold text-slate-500 uppercase tracking-wide sticky right-0 z-30 bg-slate-50 border-l border-gray-200">Actions</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {Object.keys(hierarchicalData)
                                    .sort((a, b) => {
                                        if (categoryOrder.length === 0) return 0;
                                        const ia = categoryOrder.indexOf(a);
                                        const ib = categoryOrder.indexOf(b);
                                        if (ia === -1) return 1;
                                        if (ib === -1) return -1;
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
                                                    className={`group transition-colors ${draggingTaskId === `cat::${category}` ? 'opacity-40 bg-slate-100' : 'bg-white hover:bg-slate-50'}`}
                                                    draggable={canEdit}
                                                    onDragStart={(e) => handleDragStart(e, `cat::${category}`, 'category')}
                                                    onDragOver={handleDragOver}
                                                    onDrop={(e) => handleDrop(e, category)}
                                                >
                                                    <td className="px-2 py-3 text-center cursor-move text-gray-300 hover:text-gray-500" onClick={(e) => e.stopPropagation()}>
                                                        {canEdit && <GripVertical className="w-4 h-4 mx-auto" />}
                                                    </td>
                                                    <td className="min-w-[360px] px-4 py-3 sticky left-0 z-20 bg-inherit">
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                type="button"
                                                                className="p-0.5 rounded-sm text-gray-500 hover:bg-gray-100"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    toggleCategory(category);
                                                                }}
                                                                title={isCatCollapsed ? 'Expand category' : 'Collapse category'}
                                                            >
                                                                {isCatCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="w-3 h-3 rounded-full border border-white/80 shadow-sm hover:scale-110 transition-transform"
                                                                style={{ backgroundColor: catColor }}
                                                                onClick={(e) => openColorMenu(e, category)}
                                                                title="กำหนดสีหมวดหมู่"
                                                            />
                                                            <Layers className="w-4 h-4" style={{ color: catColor }} />
                                                            <span className="font-semibold text-gray-900" style={{ color: catColor }}>{category}</span>
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
                                                    {visibleColumns.planDate && (
                                                        <td className="px-3 py-2 text-center text-xs text-gray-700 tabular-nums whitespace-nowrap">
                                                            {formatDateRangeTH(catData.stats.minStartDate, catData.stats.maxEndDate)}
                                                        </td>
                                                    )}
                                                    {visibleColumns.cost && <td className="px-3 py-2 text-right text-sm font-semibold text-gray-800 tabular-nums">{catData.stats.totalCost.toLocaleString()}</td>}
                                                    {visibleColumns.quantity && <td className="px-3 py-2 text-center text-sm text-gray-700">-</td>}
                                                    {visibleColumns.duration && <td className="px-3 py-2 text-center text-sm text-gray-700 tabular-nums">{catData.stats.totalDuration} วัน</td>}
                                                    {visibleColumns.responsible && <td className="px-3 py-2 text-left text-sm text-gray-500">-</td>}
                                                    {visibleColumns.progress && (
                                                        <td className="px-3 py-2">
                                                            <div className="flex items-center gap-2 justify-center">
                                                                <div className="w-28 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                                                                    <div className="h-full rounded-full transition-all duration-500"
                                                                        style={{ width: `${catData.stats.weightedProgress}%`, backgroundColor: catColor }}></div>
                                                                </div>
                                                                <span className="text-sm font-semibold text-gray-800 tabular-nums w-10 text-right">{catData.stats.weightedProgress.toFixed(0)}%</span>
                                                            </div>
                                                        </td>
                                                    )}
                                                    {visibleColumns.status && <td className="px-3 py-2 text-center">-</td>}
                                                    {visibleColumns.costCode && <td className="px-3 py-2 text-center">-</td>}
                                                    {visibleColumns.actions && <td className="px-3 py-2 text-center sticky right-0 z-20 bg-inherit border-l border-gray-200">-</td>}
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
                                                                        className="bg-slate-50 hover:bg-slate-100"
                                                                        onDragOver={handleDragOver}
                                                                        onDrop={(e) => handleDrop(e, uniqueSubcatId)}
                                                                    >
                                                                        <td className="px-2 py-2 border-b border-gray-200 text-center cursor-move text-gray-300 hover:text-gray-500" onClick={(e) => e.stopPropagation()}>
                                                                            {canEdit && <GripVertical className="w-4 h-4 mx-auto" />}
                                                                        </td>
                                                                        <td className="min-w-[360px] px-4 py-2 pl-10 sticky left-0 z-20 bg-inherit">
                                                                            <div className="flex items-center gap-2">
                                                                                <button
                                                                                    type="button"
                                                                                    className="p-0.5 rounded-sm text-gray-500 hover:bg-gray-200"
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        toggleSubcategory(uniqueSubcatId);
                                                                                    }}
                                                                                    title={isSubCollapsed ? 'Expand subcategory' : 'Collapse subcategory'}
                                                                                >
                                                                                    {isSubCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                                                                </button>
                                                                                <button
                                                                                    type="button"
                                                                                    className="w-2.5 h-2.5 rounded-full border border-white/80 shadow-sm hover:scale-110 transition-transform"
                                                                                    style={{ backgroundColor: subColor }}
                                                                                    onClick={(e) => openColorMenu(e, uniqueSubcatId)}
                                                                                    title="กำหนดสีหมวดย่อย"
                                                                                />
                                                                                <FolderOpen className="w-4 h-4" style={{ color: subColor }} />
                                                                                <span className="font-medium text-gray-800" style={{ color: subColor }}>{subcat}</span>
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
                                                                        {visibleColumns.planDate && (
                                                                            <td className="px-3 py-2 text-center text-xs text-gray-700 tabular-nums whitespace-nowrap">
                                                                                {formatDateRangeTH(subStats.minStartDate, subStats.maxEndDate)}
                                                                            </td>
                                                                        )}
                                                                        {visibleColumns.cost && <td className="px-3 py-2 text-right text-sm font-medium text-gray-800 tabular-nums">{subStats.totalCost.toLocaleString()}</td>}
                                                                        {visibleColumns.quantity && <td className="px-3 py-2 text-center text-sm text-gray-700">-</td>}
                                                                        {visibleColumns.duration && <td className="px-3 py-2 text-center text-sm text-gray-700 tabular-nums">{subStats.totalDuration} วัน</td>}
                                                                        {visibleColumns.responsible && <td className="px-3 py-2 text-left text-sm text-gray-500">-</td>}
                                                                        {visibleColumns.progress && (
                                                                            <td className="px-3 py-2">
                                                                                <div className="flex items-center gap-2 justify-center">
                                                                                    <div className="w-28 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                                                                                        <div className="h-full rounded-full transition-all duration-500"
                                                                                            style={{ width: `${subStats.avgProgress}%`, backgroundColor: subColor }}></div>
                                                                                    </div>
                                                                                    <span className="text-sm font-semibold text-gray-800 tabular-nums w-10 text-right">{subStats.avgProgress.toFixed(0)}%</span>
                                                                                </div>
                                                                            </td>
                                                                        )}
                                                                        {visibleColumns.status && <td className="px-3 py-2 text-center">-</td>}
                                                                        {visibleColumns.costCode && <td className="px-3 py-2 text-center">-</td>}
                                                                        {visibleColumns.actions && <td className="px-3 py-2 text-center sticky right-0 z-20 bg-inherit border-l border-gray-200">-</td>}
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
                                                                                            className="hover:bg-slate-50 transition-colors"
                                                                                            onDragOver={handleDragOver}
                                                                                            onDrop={(e) => handleDrop(e, uniqueSubsubId)}
                                                                                        >
                                                                                            <td className="px-2 py-2 text-center cursor-move text-gray-300 hover:text-gray-500" onClick={(e) => e.stopPropagation()}>
                                                                                                {canEdit && <GripVertical className="w-4 h-4 mx-auto" />}
                                                                                            </td>
                                                                                            <td className="min-w-[360px] px-4 py-2 pl-16 sticky left-0 z-20 bg-inherit">
                                                                                                <div className="flex items-center gap-2">
                                                                                                    <button
                                                                                                        type="button"
                                                                                                        className="p-0.5 rounded-sm text-gray-500 hover:bg-gray-100"
                                                                                                        onClick={(e) => {
                                                                                                            e.stopPropagation();
                                                                                                            toggleSubSubcategory(uniqueSubsubId);
                                                                                                        }}
                                                                                                        title={isSubSubCollapsed ? 'Expand sub-subcategory' : 'Collapse sub-subcategory'}
                                                                                                    >
                                                                                                        {isSubSubCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                                                                                    </button>
                                                                                                    <button
                                                                                                        type="button"
                                                                                                        className="w-2.5 h-2.5 rounded-full border border-white/80 shadow-sm hover:scale-110 transition-transform"
                                                                                                        style={{ backgroundColor: subSubColor }}
                                                                                                        onClick={(e) => openColorMenu(e, uniqueSubsubId)}
                                                                                                        title="กำหนดสีหมวดย่อยระดับ 3"
                                                                                                    />
                                                                                                    <span className="text-sm font-medium text-gray-700 italic">{subsub}</span>
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
                                                                                            {visibleColumns.planDate && (
                                                                                                <td className="px-3 py-2 text-center text-xs text-gray-700 tabular-nums whitespace-nowrap">
                                                                                                    {formatDateRangeTH(subSubStats.minStartDate, subSubStats.maxEndDate)}
                                                                                                </td>
                                                                                            )}
                                                                                            {visibleColumns.cost && <td className="px-3 py-2 text-right text-sm font-medium text-gray-700 tabular-nums">{subSubStats.totalCost.toLocaleString()}</td>}
                                                                                            {visibleColumns.quantity && <td className="px-3 py-2 text-center text-sm text-gray-700">-</td>}
                                                                                            {visibleColumns.duration && <td className="px-3 py-2 text-center text-sm text-gray-700 tabular-nums">{subSubStats.totalDuration} วัน</td>}
                                                                                            {visibleColumns.responsible && <td className="px-3 py-2 text-left text-sm text-gray-500">-</td>}
                                                                                            {visibleColumns.progress && (
                                                                                                <td className="px-3 py-2">
                                                                                                    <div className="flex items-center gap-2 justify-center">
                                                                                                        <div className="w-28 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                                                                                                            <div className="h-full rounded-full transition-all duration-500"
                                                                                                                style={{ width: `${subSubStats.avgProgress}%`, backgroundColor: subSubColor }}></div>
                                                                                                        </div>
                                                                                                        <span className="text-sm font-semibold text-gray-800 tabular-nums w-10 text-right">{subSubStats.avgProgress.toFixed(0)}%</span>
                                                                                                    </div>
                                                                                                </td>
                                                                                            )}
                                                                                            {visibleColumns.status && <td className="px-3 py-2 text-center">-</td>}
                                                                                            {visibleColumns.costCode && <td className="px-3 py-2 text-center">-</td>}
                                                                                            {visibleColumns.actions && <td className="px-3 py-2 text-center sticky right-0 z-20 bg-inherit border-l border-gray-200">-</td>}
                                                                                        </tr>

                                                                                        {/* Level 3 Tasks */}
                                                                                        {!isSubSubCollapsed && tasks.map(task => (
                                                                                            <tr
                                                                                                key={task.id}
                                                                                                draggable={canEdit}
                                                                                                onDragStart={(e) => handleDragStart(e, task.id)}
                                                                                                onDragOver={handleDragOver}
                                                                                                onDrop={(e) => handleDrop(e, task)}
                                                                                                className={`hover:bg-slate-50 transition-colors ${draggingTaskId === task.id ? 'opacity-40 bg-slate-100 border-2 border-dashed border-slate-400' : ''}`}
                                                                                            >
                                                                                                <td className="px-2 py-1.5 text-center cursor-move text-gray-400 hover:text-gray-600">
                                                                                                    {canEdit && <GripVertical className="w-4 h-4 mx-auto" />}
                                                                                                </td>
                                                                                                <td className="min-w-[360px] px-4 py-1.5 pl-24 border-l-2 border-transparent hover:border-blue-300 sticky left-0 z-20 bg-inherit">
                                                                                                    <span className="text-[13px] text-gray-700">{task.name}</span>
                                                                                                </td>
                                                                                                {visibleColumns.planDate && (
                                                                                                    <td className="px-3 py-2 text-center align-middle">
                                                                                                        {renderPlanActualDate(task.planStartDate, task.planEndDate, task.actualStartDate, task.actualEndDate)}
                                                                                                    </td>
                                                                                                )}
                                                                                                {visibleColumns.cost && <td className="px-3 py-1.5 text-right text-xs text-gray-700 tabular-nums">{(task.cost || 0).toLocaleString()}</td>}
                                                                                                {visibleColumns.quantity && <td className="px-3 py-2 text-center text-xs text-gray-700">{task.quantity || '-'}</td>}
                                                                                                {visibleColumns.duration && <td className="px-3 py-2 text-center text-xs text-gray-700 tabular-nums">{getTaskDuration(task)} วัน</td>}
                                                                                                {visibleColumns.responsible && <td className="px-3 py-2 text-left text-xs text-gray-700">{renderResponsibleAvatars(task)}</td>}
                                                                                                {visibleColumns.progress && (
                                                                                                    <td className="px-3 py-2">
                                                                                                        <div className="flex items-center gap-2 justify-center">
                                                                                                            <div className="w-28"><ProgressBar value={task.progress} /></div>
                                                                                                            <span className="text-sm font-semibold text-gray-800 tabular-nums w-10 text-right">{task.progress}%</span>
                                                                                                        </div>
                                                                                                    </td>
                                                                                                )}
                                                                                                {visibleColumns.status && <td className="px-3 py-1.5 text-center">{getStatusBadge(getEffectiveStatus(task))}</td>}
                                                                                                {visibleColumns.costCode && <td className="px-3 py-1.5 text-center text-xs text-gray-500">{task.costCode || '-'}</td>}
                                                                                                {visibleColumns.actions && (
                                                                                                    <td className="px-3 py-1.5 sticky right-0 z-20 bg-inherit border-l border-gray-200">
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
                                                                                                )}
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
                                                                                    className={`hover:bg-slate-50 transition-colors ${draggingTaskId === task.id ? 'opacity-50 bg-blue-50' : ''}`}
                                                                                >
                                                                                    <td className="px-2 py-1.5 text-center cursor-move text-gray-400 hover:text-gray-600">
                                                                                        {canEdit && <GripVertical className="w-4 h-4 mx-auto" />}
                                                                                    </td>
                                                                                    <td className="min-w-[360px] px-4 py-1.5 pl-16 border-l-2 border-transparent hover:border-amber-300 sticky left-0 z-20 bg-inherit">
                                                                                        <span className="text-[13px] text-gray-800">{task.name}</span>
                                                                                    </td>
                                                                                    {visibleColumns.planDate && (
                                                                                        <td className="px-3 py-2 text-center align-middle">
                                                                                            {renderPlanActualDate(task.planStartDate, task.planEndDate, task.actualStartDate, task.actualEndDate)}
                                                                                        </td>
                                                                                    )}
                                                                                    {visibleColumns.cost && <td className="px-3 py-1.5 text-right text-xs text-gray-700 tabular-nums">{(task.cost || 0).toLocaleString()}</td>}
                                                                                    {visibleColumns.quantity && <td className="px-3 py-2 text-center text-xs text-gray-700">{task.quantity || '-'}</td>}
                                                                                    {visibleColumns.duration && <td className="px-3 py-2 text-center text-xs text-gray-700 tabular-nums">{getTaskDuration(task)} วัน</td>}
                                                                                    {visibleColumns.responsible && <td className="px-3 py-2 text-left text-xs text-gray-700">{renderResponsibleAvatars(task)}</td>}
                                                                                    {visibleColumns.progress && (
                                                                                        <td className="px-3 py-2">
                                                                                            <div className="flex items-center gap-2 justify-center">
                                                                                                <div className="w-28"><ProgressBar value={task.progress} /></div>
                                                                                                <span className="text-sm font-semibold text-gray-800 tabular-nums w-10 text-right">{task.progress}%</span>
                                                                                            </div>
                                                                                        </td>
                                                                                    )}
                                                                                    {visibleColumns.status && <td className="px-3 py-1.5 text-center">{getStatusBadge(getEffectiveStatus(task))}</td>}
                                                                                    {visibleColumns.costCode && <td className="px-3 py-1.5 text-center text-xs text-gray-500">{task.costCode || '-'}</td>}
                                                                                    {visibleColumns.actions && (
                                                                                        <td className="px-3 py-1.5 sticky right-0 z-20 bg-inherit border-l border-gray-200">
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
                                                                                    )}
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
                                                                className={`hover:bg-slate-50 transition-colors ${draggingTaskId === task.id ? 'opacity-50 bg-blue-50' : ''}`}
                                                            >
                                                                <td className="px-2 py-1.5 text-center cursor-move text-gray-400 hover:text-gray-600">
                                                                    {canEdit && <GripVertical className="w-4 h-4 mx-auto" />}
                                                                </td>
                                                                <td className="min-w-[360px] px-4 py-1.5 pl-12 border-l-2 border-transparent hover:border-blue-300 sticky left-0 z-20 bg-inherit">
                                                                    <span className="text-[13px] text-gray-800">{task.name}</span>
                                                                </td>
                                                                {visibleColumns.planDate && (
                                                                    <td className="px-3 py-2 text-center align-middle">
                                                                        {renderPlanActualDate(task.planStartDate, task.planEndDate, task.actualStartDate, task.actualEndDate)}
                                                                    </td>
                                                                )}
                                                                {visibleColumns.cost && <td className="px-3 py-1.5 text-right text-sm text-gray-700 tabular-nums">{task.cost?.toLocaleString()}</td>}
                                                                {visibleColumns.quantity && <td className="px-3 py-2 text-center text-sm text-gray-700">{task.quantity}</td>}
                                                                {visibleColumns.duration && <td className="px-3 py-2 text-center text-sm text-gray-700 tabular-nums">{getTaskDuration(task)} วัน</td>}
                                                                {visibleColumns.responsible && <td className="px-3 py-2 text-left text-sm text-gray-700">{renderResponsibleAvatars(task)}</td>}
                                                                {visibleColumns.progress && (
                                                                    <td className="px-3 py-2">
                                                                        <div className="flex items-center gap-2 justify-center">
                                                                            <div className="w-28"><ProgressBar value={task.progress} /></div>
                                                                            <span className="text-sm font-semibold text-gray-800 tabular-nums w-10 text-right">{task.progress}%</span>
                                                                        </div>
                                                                    </td>
                                                                )}
                                                                {visibleColumns.status && <td className="px-3 py-1.5 text-center">{getStatusBadge(getEffectiveStatus(task))}</td>}
                                                                {visibleColumns.costCode && <td className="px-3 py-1.5 text-center text-xs text-gray-500">{task.costCode || '-'}</td>}
                                                                {visibleColumns.actions && (
                                                                    <td className="px-3 py-1.5 sticky right-0 z-20 bg-inherit border-l border-gray-200">
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
                                                                )}
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
                    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-[2px]">
                        <div className="bg-white rounded-lg w-full max-w-4xl shadow-2xl border border-gray-200 flex flex-col max-h-[90vh]">
                            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200 bg-white rounded-t-lg shrink-0">
                                <div>
                                    <h2 className="text-xl font-semibold text-gray-800">
                                        {editingTask ? 'แก้ไขรายละเอียดงาน' : 'เพิ่มรายการงานใหม่'}
                                    </h2>
                                </div>
                                <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                                    <X className="w-6 h-6" />
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
                                                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all placeholder:text-gray-300"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">หมวดหมู่ย่อย</label>
                                            <input
                                                type="text"
                                                list="subcategories"
                                                value={taskForm.subcategory}
                                                onChange={(e) => setTaskForm({ ...taskForm, subcategory: e.target.value })}
                                                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all placeholder:text-gray-300"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">หมวดหมู่ย่อย 2</label>
                                            <input
                                                type="text"
                                                value={taskForm.subsubcategory}
                                                onChange={(e) => setTaskForm({ ...taskForm, subsubcategory: e.target.value })}
                                                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all placeholder:text-gray-300"
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
                                            className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all placeholder:text-gray-300"
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
                                                    className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all"
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
                                                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-blue-600 font-semibold text-center focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">วันสิ้นสุด</label>
                                            <input
                                                type="date"
                                                value={taskForm.planEndDate}
                                                readOnly
                                                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-500 cursor-not-allowed"
                                            />
                                        </div>
                                    </div>

                                    {/* Row 4: Details */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">Cost Code</label>
                                            <select
                                                value={taskForm.costCode}
                                                onChange={(e) => setTaskForm({ ...taskForm, costCode: e.target.value })}
                                                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all"
                                            >
                                                <option value="">เลือก Cost Code</option>
                                                {COST_CODES.map((code) => (
                                                    <option key={code.id} value={code.id}>
                                                        {code.id} - {code.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">งบประมาณ (บาท)</label>
                                            <input
                                                type="number"
                                                min="0"
                                                value={taskForm.cost}
                                                onChange={(e) => setTaskForm({ ...taskForm, cost: parseFloat(e.target.value) || 0 })}
                                                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all"
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
                                                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all placeholder:text-gray-300"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">ผู้รับผิดชอบ</label>
                                            <div className="w-full border border-gray-300 rounded-lg bg-white">
                                                <div className="px-3 py-2 border-b border-gray-200 min-h-[44px] flex flex-wrap gap-2">
                                                    {selectedAssignedEmployees.length > 0 ? (
                                                        selectedAssignedEmployees.map((employee) => (
                                                            <span key={employee.id} className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-medium">
                                                                {employee.avatarBase64 ? (
                                                                    <img
                                                                        src={employee.avatarBase64}
                                                                        alt={employee.name}
                                                                        className="w-5 h-5 rounded-full object-cover border border-blue-200"
                                                                    />
                                                                ) : (
                                                                    <span className="w-5 h-5 rounded-full bg-blue-200 text-blue-700 flex items-center justify-center text-[10px] font-semibold">
                                                                        {employee.name.slice(0, 1)}
                                                                    </span>
                                                                )}
                                                                {employee.name}
                                                            </span>
                                                        ))
                                                    ) : (
                                                        <span className="text-sm text-gray-400">เลือกพนักงานได้หลายคน</span>
                                                    )}
                                                </div>
                                                <div className="max-h-40 overflow-y-auto p-2 space-y-1">
                                                    {employees.length === 0 ? (
                                                        <div className="px-2 py-1.5 text-xs text-gray-400">ไม่มีรายการพนักงาน</div>
                                                    ) : (
                                                        employees.map((employee) => {
                                                            const checked = taskForm.assignedEmployeeIds.includes(employee.id);
                                                            return (
                                                                <label key={employee.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={checked}
                                                                        onChange={() => toggleAssignedEmployee(employee.id)}
                                                                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                                    />
                                                                    {employee.avatarBase64 ? (
                                                                        <img
                                                                            src={employee.avatarBase64}
                                                                            alt={employee.name}
                                                                            className="w-6 h-6 rounded-full object-cover border border-gray-200"
                                                                        />
                                                                    ) : (
                                                                        <span className="w-6 h-6 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center text-[11px] font-semibold">
                                                                            {employee.name.slice(0, 1)}
                                                                        </span>
                                                                    )}
                                                                    <span className="text-sm text-gray-700">
                                                                        {employee.name}
                                                                        {employee.position ? ` (${employee.position})` : ''}
                                                                    </span>
                                                                </label>
                                                            );
                                                        })
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </form>
                            </div>

                            {/* Footer Actions */}
                            <div className="flex items-center justify-end gap-3 px-8 py-5 bg-gray-50 border-t border-gray-200 rounded-b-lg shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-6 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-200 transition-all"
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    onClick={handleSubmit}
                                    disabled={saving}
                                    className="px-6 py-2.5 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/50 shadow-sm transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transform active:scale-95"
                                >
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    {editingTask ? 'บันทึกการแก้ไข' : 'สร้างงานใหม่'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {activeColorMenu && (
                <>
                    <div className="fixed inset-0 z-[120]" onClick={() => setActiveColorMenu(null)} />
                    <div
                        className="fixed z-[121] bg-white rounded-lg border border-gray-200 shadow-xl p-2 grid grid-cols-4 gap-2"
                        style={{ top: `${activeColorMenu.top + 8}px`, left: `${activeColorMenu.left}px` }}
                    >
                        {COLORS.map(color => (
                            <button
                                key={color}
                                type="button"
                                className="w-5 h-5 rounded-full border border-gray-200 hover:scale-110 transition-transform"
                                style={{ backgroundColor: color }}
                                onClick={() => handleColorChange(color)}
                            />
                        ))}
                    </div>
                </>
            )}

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
                                    <div className="mt-2 pt-2 border-t border-gray-200 flex items-center text-xs text-gray-500 gap-2">
                                        <span className="font-medium">แผนงาน:</span>
                                        <span>{formatDateTH(progressForm.planStartDate)} - {formatDateTH(progressForm.planEndDate)}</span>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Progress (%)</label>
                                    <div className="flex min-w-0 flex-1 items-start gap-4">
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
