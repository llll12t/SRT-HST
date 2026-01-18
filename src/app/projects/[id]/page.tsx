'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    ArrowLeft,
    Building2,
    Calendar,
    Users,
    TrendingUp,
    Clock,
    CheckCircle2,
    AlertCircle,
    Plus,
    Edit2,
    Trash2,
    MoreVertical,
    Loader2,
    ListTodo,
    BarChart3,
    Target,
    X,
    ArrowUp,
    ArrowDown,
    ArrowRight,
    Info
} from 'lucide-react';
import { Project, Task, Member } from '@/types/construction';
import { getProject, updateProject, getTasks, createTask, updateTask, deleteTask, updateTaskProgress, getMembers } from '@/lib/firestore';
import { useAuth } from '@/contexts/AuthContext';




export default function ProjectDetailPage() {
    const { user } = useAuth();
    const params = useParams();
    const router = useRouter();
    const projectId = params.id as string;

    const [project, setProject] = useState<Project | null>(null);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [members, setMembers] = useState<Member[]>([]);
    const [loading, setLoading] = useState(true);

    // Task modal
    const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
    const [editingTask, setEditingTask] = useState<Task | null>(null);
    const [saving, setSaving] = useState(false);
    const [taskForm, setTaskForm] = useState({
        category: '',
        name: '',
        description: '',
        cost: 0,
        quantity: '',
        planStartDate: '',
        planEndDate: '',
        planDuration: 0,
        progress: 0,
        responsible: '',
        actualStartDate: '',
        actualEndDate: '',
        type: 'task',
        parentTaskId: '',
        color: ''
    });

    // Progress update modal
    const [isProgressModalOpen, setIsProgressModalOpen] = useState(false);
    const [progressUpdate, setProgressUpdate] = useState({
        taskId: '',
        taskName: '',
        currentProgress: 0,
        newProgress: 0,
        updateDate: new Date().toISOString().split('T')[0],
        actualStartDate: '',
        actualEndDate: '',
        reason: ''
    });
    const [savingProgress, setSavingProgress] = useState(false);
    const [reorderingId, setReorderingId] = useState<string | null>(null);

    // Color Picker State
    const COLORS = [
        '#3b82f6', // Default Blue
        '#ef4444', // Red
        '#f59e0b', // Amber
        '#10b981', // Emerald
        '#8b5cf6', // Violet
        '#ec4899', // Pink
        '#06b6d4', // Cyan
        '#6366f1', // Indigo
    ];
    const [activeColorMenu, setActiveColorMenu] = useState<{ id: string, type: 'group' | 'category', top: number, left: number } | null>(null);
    const [categoryColors, setCategoryColors] = useState<Record<string, string>>({});

    // Load category colors on mount
    useEffect(() => {
        const savedColors = localStorage.getItem('ganttCategoryColors');
        if (savedColors) {
            try {
                setCategoryColors(JSON.parse(savedColors));
            } catch (e) {
                console.error('Failed to parse category colors', e);
            }
        }
    }, []);

    // Fetch data
    useEffect(() => {
        if (projectId) {
            fetchData();
        }
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

    // Calculate stats
    const stats = {
        totalTasks: tasks.length,
        completedTasks: tasks.filter(t => t.status === 'completed').length,
        inProgressTasks: tasks.filter(t => t.status === 'in-progress').length,
        notStartedTasks: tasks.filter(t => t.status === 'not-started').length,
        totalDuration: tasks.reduce((sum, t) => sum + (Number(t.planDuration) || 0), 0),
        weightedProgress: tasks.reduce((sum, t) => sum + ((Number(t.planDuration) || 0) * (Number(t.progress) || 0) / 100), 0)
    };

    const calculatedProgress = stats.totalDuration > 0
        ? (stats.weightedProgress / stats.totalDuration) * 100
        : 0;

    // Collapsed Tasks State
    const [collapsedTasks, setCollapsedTasks] = useState<Set<string>>(new Set());

    const toggleTaskCollapse = (taskId: string) => {
        setCollapsedTasks(prev => {
            const next = new Set(prev);
            if (next.has(taskId)) {
                next.delete(taskId);
            } else {
                next.add(taskId);
            }
            return next;
        });
    };

    // Open task modal
    const openCreateTaskModal = () => {
        setEditingTask(null);
        setTaskForm({
            category: '',
            name: '',
            description: '',
            cost: 0,
            quantity: '',
            planStartDate: project?.startDate || '',
            planEndDate: project?.endDate || '',
            planDuration: 30,
            progress: 0,
            responsible: '',
            actualStartDate: '',
            actualEndDate: '',
            type: 'task',
            parentTaskId: '',
            color: '#3B82F6'
        });
        setIsTaskModalOpen(true);
    };

    const openEditTaskModal = (task: Task) => {
        setEditingTask(task);
        setTaskForm({
            category: task.category,
            name: task.name,
            description: task.description || '',
            cost: task.cost || 0,
            quantity: task.quantity || '',
            planStartDate: task.planStartDate,
            planEndDate: task.planEndDate,
            planDuration: task.planDuration,
            progress: task.progress,
            responsible: task.responsible || '',
            actualStartDate: task.actualStartDate || '',
            actualEndDate: task.actualEndDate || '',
            type: task.type || 'task',
            parentTaskId: task.parentTaskId || '',
            color: task.color || '#3B82F6'
        });
        setIsTaskModalOpen(true);
    };

    // Handle task submit
    const handleTaskSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);

        try {
            let status: Task['status'] = 'not-started';
            if (taskForm.progress === 100) status = 'completed';
            else if (taskForm.progress > 0) status = 'in-progress';

            if (editingTask) {
                await updateTask(editingTask.id, {
                    category: taskForm.category,
                    name: taskForm.name,
                    description: taskForm.description,
                    cost: taskForm.cost,
                    quantity: taskForm.quantity,
                    planStartDate: taskForm.planStartDate,
                    planEndDate: taskForm.planEndDate,
                    planDuration: taskForm.planDuration,
                    progress: taskForm.progress,
                    responsible: taskForm.responsible,
                    actualStartDate: taskForm.actualStartDate || undefined,
                    actualEndDate: taskForm.actualEndDate || undefined,
                    status,
                    type: taskForm.type as 'task' | 'group',
                    parentTaskId: taskForm.parentTaskId || null,
                    color: taskForm.color
                });
            } else {
                // Determine new order: max order in this project + 1
                const maxOrder = tasks.reduce((max, t) => Math.max(max, t.order || 0), 0);

                await createTask({
                    projectId,
                    category: taskForm.category,
                    name: taskForm.name,
                    description: taskForm.description,
                    cost: taskForm.cost,
                    quantity: taskForm.quantity,
                    planStartDate: taskForm.planStartDate,
                    planEndDate: taskForm.planEndDate,
                    planDuration: taskForm.planDuration,
                    progress: taskForm.progress,
                    responsible: taskForm.responsible,
                    actualStartDate: taskForm.actualStartDate || undefined,
                    actualEndDate: taskForm.actualEndDate || undefined,
                    status,
                    order: maxOrder + 1,
                    type: taskForm.type as 'task' | 'group',
                    parentTaskId: taskForm.parentTaskId || null,
                    color: taskForm.color
                });
            }

            setIsTaskModalOpen(false);
            fetchData();
        } catch (error) {
            console.error('Error saving task:', error);
            alert('เกิดข้อผิดพลาดในการบันทึก');
        } finally {
            setSaving(false);
        }
    };

    // Handle task delete
    const handleDeleteTask = async (taskId: string) => {
        if (!confirm('ยืนยันการลบงานนี้?')) return;

        try {
            await deleteTask(taskId);
            fetchData();
        } catch (error) {
            console.error('Error deleting task:', error);
        }
    };

    const handleMoveTask = async (task: Task, direction: 'up' | 'down', categoryTasks: Task[]) => {
        const currentIndex = categoryTasks.findIndex(t => t.id === task.id);
        if (currentIndex === -1) return;

        const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
        if (targetIndex < 0 || targetIndex >= categoryTasks.length) return;

        const targetTask = categoryTasks[targetIndex];

        setReorderingId(task.id);
        try {
            const taskOrder = task.order || 0;
            const targetOrder = targetTask.order || 0;

            await updateTask(task.id, { order: targetOrder });
            await updateTask(targetTask.id, { order: taskOrder });
            await fetchData();
        } catch (error) {
            console.error('Reorder failed', error);
            alert('จัดลำดับไม่สำเร็จ');
        } finally {
            setReorderingId(null);
        }
    };

    // Handle quick progress update - open modal
    const openProgressModal = (task: Task, progress: number) => {
        setProgressUpdate({
            taskId: task.id,
            taskName: task.name,
            currentProgress: task.progress,
            newProgress: progress,
            updateDate: task.progressUpdatedAt || new Date().toISOString().split('T')[0],
            actualStartDate: task.actualStartDate || '',
            actualEndDate: task.actualEndDate || '',
            reason: ''
        });
        setIsProgressModalOpen(true);
    };

    // Handle progress submit with date and reason
    const handleProgressSubmit = async () => {
        if (!progressUpdate.taskId) return;

        setSavingProgress(true);
        try {
            // Get the task to update actual dates
            const task = tasks.find(t => t.id === progressUpdate.taskId);
            if (!task) return;

            // Handle "เริ่มงาน" (-1) special case
            const isStartingWork = progressUpdate.newProgress === -1;
            const actualProgress = isStartingWork ? 0 : progressUpdate.newProgress;

            // Determine status
            let newStatus: Task['status'] = 'not-started';
            if (actualProgress === 100) newStatus = 'completed';
            else if (actualProgress > 0) newStatus = 'in-progress';
            else if (isStartingWork) newStatus = 'in-progress'; // Explicit start
            else if (actualProgress === 0 && task.status === 'in-progress') newStatus = 'in-progress'; // Maintain in-progress if already started

            // Prepare update data
            const updateData: Partial<Task> = {
                progress: progressUpdate.newProgress === -1 ? 0 : progressUpdate.newProgress,
                progressUpdatedAt: progressUpdate.updateDate,
                status: newStatus,
                actualStartDate: progressUpdate.actualStartDate,
                actualEndDate: progressUpdate.actualEndDate
            };

            // Only set remarks if there's a value
            if (progressUpdate.reason) {
                updateData.remarks = progressUpdate.reason;
            }

            await updateTask(progressUpdate.taskId, updateData);
            setIsProgressModalOpen(false);
            fetchData();
        } catch (error) {
            console.error('Error updating progress:', error);
            alert('เกิดข้อผิดพลาดในการอัปเดท');
        } finally {
            setSavingProgress(false);
        }
    };

    // Status config
    const getStatusConfig = (status: string) => {
        const configs: Record<string, { label: string; class: string }> = {
            'planning': { label: 'วางแผน', class: 'badge-neutral' },
            'in-progress': { label: 'กำลังดำเนินการ', class: 'badge-info' },
            'completed': { label: 'เสร็จสิ้น', class: 'badge-success' },
            'on-hold': { label: 'ระงับชั่วคราว', class: 'badge-warning' },
            'not-started': { label: 'ยังไม่เริ่ม', class: 'badge-neutral' },
            'delayed': { label: 'ล่าช้า', class: 'badge-danger' },
        };
        return configs[status] || configs['not-started'];
    };

    // Color Change Handler
    const handleColorChange = async (color: string) => {
        if (!activeColorMenu) return;

        if (activeColorMenu.type === 'group') {
            try {
                // Optimistic UI Update first
                setTasks(prev => prev.map(t => t.id === activeColorMenu.id ? { ...t, color } : t));
                // Then persisted update
                await updateTask(activeColorMenu.id, { color });
            } catch (error) {
                console.error('Failed to update group color:', error);
                alert('เกิดข้อผิดพลาดในการเปลี่ยนสี');
                fetchData(); // Rollback on error
            }
        } else if (activeColorMenu.type === 'category') {
            const newColors = { ...categoryColors, [activeColorMenu.id]: color };
            setCategoryColors(newColors);
            localStorage.setItem('ganttCategoryColors', JSON.stringify(newColors));
        }

        setActiveColorMenu(null);
    };

    // Group tasks by category
    const groupedTasks = tasks.reduce((acc, task) => {
        if (!acc[task.category]) {
            acc[task.category] = [];
        }
        acc[task.category].push(task);
        return acc;
    }, {} as Record<string, Task[]>);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                <span className="ml-2 text-gray-600">กำลังโหลดข้อมูล...</span>
            </div>
        );
    }

    if (!project) {
        return (
            <div className="text-center py-20">
                <p className="text-gray-600 mb-4">ไม่พบโครงการ</p>
                <Link href="/projects" className="text-blue-600 hover:text-blue-700">
                    ← กลับไปหน้าโครงการ
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div className="flex items-start gap-4">
                    <Link
                        href="/projects"
                        className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-700 transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div>
                        <div className="flex items-center gap-2">
                            <Building2 className="w-6 h-6 text-blue-600" />
                            <h1 className="text-2xl font-semibold text-gray-900">{project.name}</h1>
                            <span className={`badge ${getStatusConfig(project.status).class}`}>
                                {getStatusConfig(project.status).label}
                            </span>
                        </div>
                        <p className="text-gray-600 text-sm mt-1">
                            {project.owner} • {project.startDate} → {project.endDate}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 ml-11 lg:ml-0">
                    <Link
                        href={`/gantt?project=${projectId}`}
                        className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
                    >
                        <BarChart3 className="w-4 h-4" />
                        Gantt Chart
                    </Link>
                    {['admin', 'project_manager'].includes(user?.role || '') && (
                        <button
                            onClick={openCreateTaskModal}
                            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                        >
                            <Plus className="w-4 h-4" />
                            เพิ่มงาน
                        </button>
                    )}
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="bg-white rounded-md border border-gray-100 p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Target className="w-4 h-4 text-blue-600" />
                        <p className="text-gray-600 text-xs font-medium">Progress</p>
                    </div>
                    <p className="text-2xl font-semibold text-blue-600">{calculatedProgress.toFixed(2)}%</p>
                    <div className="h-1.5 bg-gray-100 rounded-full mt-2 overflow-hidden">
                        <div
                            className="h-full bg-blue-500 rounded-full"
                            style={{ width: `${calculatedProgress}%` }}
                        />
                    </div>
                </div>

                <div className="bg-white rounded-md border border-gray-100 p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <ListTodo className="w-4 h-4 text-gray-600" />
                        <p className="text-gray-600 text-xs font-medium">งานทั้งหมด</p>
                    </div>
                    <p className="text-2xl font-semibold text-gray-900">{stats.totalTasks}</p>
                </div>

                <div className="bg-white rounded-md border border-gray-100 p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                        <p className="text-gray-600 text-xs font-medium">เสร็จสิ้น</p>
                    </div>
                    <p className="text-2xl font-semibold text-green-600">{stats.completedTasks}</p>
                </div>

                <div className="bg-white rounded-md border border-gray-100 p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Clock className="w-4 h-4 text-amber-600" />
                        <p className="text-gray-600 text-xs font-medium">กำลังดำเนินการ</p>
                    </div>
                    <p className="text-2xl font-semibold text-amber-600">{stats.inProgressTasks}</p>
                </div>

                <div className="bg-white rounded-md border border-gray-100 p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <AlertCircle className="w-4 h-4 text-gray-400" />
                        <p className="text-gray-600 text-xs font-medium">ยังไม่เริ่ม</p>
                    </div>
                    <p className="text-2xl font-semibold text-gray-600">{stats.notStartedTasks}</p>
                </div>
            </div>

            {/* Description */}
            {project.description && (
                <div className="bg-white rounded-md border border-gray-100 p-4">
                    <h3 className="font-medium text-gray-900 mb-2">รายละเอียดโครงการ</h3>
                    <p className="text-gray-600 text-sm">{project.description}</p>
                </div>
            )}

            {/* Tasks List */}
            <div className="bg-white rounded-md border border-gray-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div>
                        <h2 className="font-semibold text-gray-900">รายการงาน</h2>
                        <p className="text-gray-600 text-sm mt-0.5">จำนวน: {tasks.length} งาน</p>
                    </div>
                </div>

                {tasks.length === 0 ? (
                    <div className="p-12 text-center">
                        <ListTodo className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-600 mb-4">ยังไม่มีรายการงาน</p>
                        {['admin', 'project_manager'].includes(user?.role || '') && (
                            <button
                                onClick={openCreateTaskModal}
                                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                            >
                                เพิ่มงานแรก
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Hierarchical Tasks List */}
                        {Object.entries(groupedTasks).map(([category, categoryTasks]) => {
                            // Get root tasks for this category (no parent, or parent not in this category)
                            const rootTasks = categoryTasks
                                .filter(t => !t.parentTaskId || !categoryTasks.find(p => p.id === t.parentTaskId))
                                .sort((a, b) => (a.order || 0) - (b.order || 0));

                            // Recursive function to ensure we catch all descendants even if filtered/sorted
                            const renderTaskNode = (task: Task, level: number = 0, isLastChild: boolean = false) => {
                                const children = categoryTasks
                                    .filter(t => t.parentTaskId === task.id)
                                    .sort((a, b) => (a.order || 0) - (b.order || 0));

                                const hasChildren = children.length > 0;
                                const isGroup = task.type === 'group';
                                const isCollapsed = collapsedTasks.has(task.id);

                                return (
                                    <React.Fragment key={task.id}>
                                        <div
                                            className={`grid grid-cols-12 gap-4 px-5 py-3 hover:bg-gray-50 transition-colors items-center group/row relative
                                                ${isGroup ? 'bg-gray-50/50' : ''}`}
                                            style={{ backgroundColor: task.type === 'group' && task.color ? `${task.color}15` : undefined }}
                                        >
                                            {/* Col 1: Title & Hierarchy */}
                                            <div className="col-span-12 lg:col-span-5 min-w-0 flex items-center">
                                                {/* Indentation Spacer */}
                                                <div style={{ width: `${level * 24}px` }} className="shrink-0 flex justify-end relative h-full">
                                                </div>

                                                {/* Tree Connector & Toggle */}
                                                <div className="flex items-center mr-2 relative">
                                                    {level > 0 && (
                                                        <div className="absolute -left-3 w-3 h-[1px] bg-gray-300 top-1/2 -translate-y-1/2" />
                                                    )}
                                                    {level > 0 && (
                                                        <div className="absolute -left-3 w-[1px] bg-gray-300 -top-[20px] h-[calc(100%+20px)]"
                                                            style={{ display: isLastChild ? 'block' : 'block', height: isLastChild ? '50%' : '150%' }}
                                                        />
                                                    )}

                                                    {isGroup || hasChildren ? (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                toggleTaskCollapse(task.id);
                                                            }}
                                                            className="p-0.5 hover:bg-gray-200 rounded text-gray-500 transition-colors z-10 bg-white border border-gray-200 shadow-sm"
                                                        >
                                                            {isCollapsed ?
                                                                <div className="w-4 h-4 flex items-center justify-center"><ArrowRight className="w-3 h-3" strokeWidth={2.5} /></div> :
                                                                <div className="w-4 h-4 flex items-center justify-center"><ArrowDown className="w-3 h-3" strokeWidth={2.5} /></div>
                                                            }
                                                        </button>
                                                    ) : (
                                                        <div className="w-5 h-5 flex items-center justify-center">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Content */}
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        {task.type === 'group' && (
                                                            <button
                                                                className="w-3 h-3 rounded-full border border-gray-300 hover:scale-110 transition-transform flex-shrink-0 focus:outline-none shadow-sm"
                                                                style={{ backgroundColor: task.color || '#3b82f6' }}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    const rect = e.currentTarget.getBoundingClientRect();
                                                                    setActiveColorMenu({
                                                                        id: task.id,
                                                                        type: 'group',
                                                                        top: rect.bottom + window.scrollY,
                                                                        left: rect.left + window.scrollX
                                                                    });
                                                                }}
                                                                title="เปลี่ยนสีกลุ่ม"
                                                            />
                                                        )}
                                                        <p className={`text-sm truncate ${isGroup ? 'font-bold text-gray-900 text-base' : 'font-medium text-gray-700'}`} title={task.name}>
                                                            {task.name}
                                                        </p>
                                                        <span className={`badge ${getStatusConfig(task.status).class} shrink-0 scale-90`}>
                                                            {getStatusConfig(task.status).label}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-3 text-xs text-gray-500 pl-4">
                                                        {(task.cost ?? 0) > 0 && <span>Cost: {task.cost?.toLocaleString()}</span>}
                                                        {task.quantity && <span>Qty: {task.quantity}</span>}
                                                        {task.responsible && <span className="truncate max-w-[100px]" title={task.responsible}>โดย: {task.responsible}</span>}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Col 2: Dates */}
                                            <div className="col-span-6 lg:col-span-3 text-xs pl-2 lg:border-l border-gray-100 flex flex-col justify-center h-full">
                                                <div className="flex flex-col gap-1.5">
                                                    <div className="flex items-center gap-2 text-gray-500">
                                                        <span className="w-8 shrink-0 text-[10px] font-bold uppercase tracking-wider text-gray-400 bg-gray-50 px-1 rounded">Plan</span>
                                                        <span className="font-mono">{new Date(task.planStartDate).toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: '2-digit' })} - {new Date(task.planEndDate).toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>
                                                    </div>
                                                    {task.actualStartDate && (
                                                        <div className="flex items-center gap-2 text-green-700 font-medium">
                                                            <span className="w-8 shrink-0 text-[10px] font-bold uppercase tracking-wider text-green-600 bg-green-50 px-1 rounded">Real</span>
                                                            <span className="font-mono">{new Date(task.actualStartDate).toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: '2-digit' })} - {task.actualEndDate ? new Date(task.actualEndDate).toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '...'}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Col 3: Progress */}
                                            <div className="col-span-4 lg:col-span-2 px-2 flex flex-col justify-center h-full">
                                                <div className="flex items-center justify-between text-xs mb-1.5">
                                                    <span className="text-gray-400 text-[10px] font-bold uppercase">Progress</span>
                                                    <span className={`font-bold font-mono ${task.progress === 100 ? 'text-green-600' : 'text-gray-700'
                                                        }`}>{task.progress}%</span>
                                                </div>
                                                <div className="h-2 bg-gray-100 rounded-full overflow-hidden border border-gray-100">
                                                    <div
                                                        className={`h-full rounded-full transition-all duration-500 ${task.progress === 100 ? 'bg-green-500' :
                                                            task.progress >= 50 ? 'bg-blue-500' :
                                                                task.progress > 0 ? 'bg-amber-500' :
                                                                    'bg-gray-300'
                                                            }`}
                                                        style={{ width: `${task.progress}%` }}
                                                    />
                                                </div>
                                            </div>

                                            {/* Col 4: Actions */}
                                            <div className="col-span-2 lg:col-span-2 flex items-center justify-end gap-2 h-full">
                                                {/* Update Button */}
                                                {['admin', 'project_manager', 'engineer'].includes(user?.role || '') && task.type !== 'group' && (
                                                    <button
                                                        onClick={() => openProgressModal(task, task.progress)}
                                                        className="px-3 py-1.5 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 whitespace-nowrap transition-all hover:shadow-sm"
                                                    >
                                                        อัปเดท
                                                    </button>
                                                )}

                                                {/* Edit/Delete/Reorder */}
                                                <div className="flex items-center opacity-0 group-hover/row:opacity-100 transition-opacity">
                                                    {['admin', 'project_manager'].includes(user?.role || '') && (
                                                        <>
                                                            <button
                                                                onClick={() => openEditTaskModal(task)}
                                                                className="p-1.5 hover:bg-gray-200 rounded-md text-gray-400 hover:text-blue-600 transition-colors"
                                                            >
                                                                <Edit2 className="w-4 h-4" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteTask(task.id)}
                                                                className="p-1.5 hover:bg-gray-200 rounded-md text-gray-400 hover:text-red-600 transition-colors"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>

                                                            {/* Reorder Buttons */}
                                                            {reorderingId === task.id ? (
                                                                <Loader2 className="w-4 h-4 ml-1 text-blue-600 animate-spin" />
                                                            ) : (
                                                                <div className="flex flex-col ml-1 border-l border-gray-300 pl-1">
                                                                    <button
                                                                        onClick={() => handleMoveTask(task, 'up', categoryTasks)}
                                                                        className="p-0.5 hover:bg-gray-200 rounded text-gray-400 hover:text-blue-600"
                                                                    >
                                                                        <ArrowUp className="w-3 h-3" />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleMoveTask(task, 'down', categoryTasks)}
                                                                        className="p-0.5 hover:bg-gray-200 rounded text-gray-400 hover:text-blue-600"
                                                                    >
                                                                        <ArrowDown className="w-3 h-3" />
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Render Children */}
                                        {!isCollapsed && children.map((child, idx) =>
                                            renderTaskNode(child, level + 1, idx === children.length - 1)
                                        )}
                                    </React.Fragment>
                                );
                            };

                            return (
                                <div key={category} className="bg-white border border-gray-100 rounded-lg overflow-hidden">
                                    {/* Category Header */}
                                    <div className="bg-gray-50/50 px-4 py-3 flex items-center gap-3 border-b border-gray-100 backdrop-blur-sm">
                                        <button
                                            className="w-5 h-5 rounded-full border-2 border-white ring-1 ring-gray-100 hover:scale-110 transition-transform focus:outline-none"
                                            style={{ backgroundColor: categoryColors[category] || '#9ca3af' }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const rect = e.currentTarget.getBoundingClientRect();
                                                setActiveColorMenu({
                                                    id: category,
                                                    type: 'category',
                                                    top: rect.bottom + window.scrollY,
                                                    left: rect.left + window.scrollX
                                                });
                                            }}
                                            title="เปลี่ยนสีหมวดหมู่"
                                        />
                                        <h3 className="font-bold text-gray-900 text-sm tracking-tight">{category}</h3>
                                        <span className="text-[10px] font-medium text-gray-500 bg-white px-2 py-0.5 rounded-full border border-gray-100">
                                            {categoryTasks.length} รายการ
                                        </span>
                                    </div>

                                    {/* Render Root Tasks */}
                                    <div className="bg-white">
                                        {rootTasks.length > 0 ? (
                                            rootTasks.map((task, idx) => renderTaskNode(task, 0, idx === rootTasks.length - 1))
                                        ) : (
                                            <div className="p-8 text-center text-gray-400 text-sm italic bg-gray-50/30">
                                                ไม่มีรายการหลักในหมวดหมู่นี้
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Task Modal */}
            {
                isTaskModalOpen && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                                <h2 className="text-lg font-semibold text-gray-900">
                                    {editingTask ? 'แก้ไขงาน' : 'เพิ่มงานใหม่'}
                                </h2>
                                <button
                                    onClick={() => setIsTaskModalOpen(false)}
                                    className="p-1 hover:bg-gray-100 rounded text-gray-400"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <form onSubmit={handleTaskSubmit} className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">

                                <div className="md:col-span-1">
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">หมวดหมู่ *</label>
                                    <input
                                        type="text"
                                        list="category-list"
                                        required
                                        value={taskForm.category}
                                        onChange={(e) => setTaskForm({ ...taskForm, category: e.target.value })}
                                        placeholder="เลือกหรือพิมพ์หมวดหมู่ใหม่..."
                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:border-blue-500"
                                    />
                                    <datalist id="category-list">
                                        {[...new Set(tasks.map(t => t.category))].map((c, i) => (
                                            <option key={i} value={c} />
                                        ))}
                                    </datalist>
                                </div>

                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">ชื่องาน *</label>
                                    <input
                                        type="text"
                                        required
                                        value={taskForm.name}
                                        onChange={(e) => setTaskForm({ ...taskForm, name: e.target.value })}
                                        placeholder="ชื่องาน"
                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:border-blue-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">ประเภท</label>
                                    <select
                                        value={taskForm.type}
                                        onChange={(e) => setTaskForm({ ...taskForm, type: e.target.value })}
                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:border-blue-500"
                                    >
                                        <option value="task">งานทั่วไป (Task)</option>
                                        <option value="group">หัวข้อกลุ่ม (Group)</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">อยู่ภายใต้กลุ่ม (Parent)</label>
                                    <select
                                        value={taskForm.parentTaskId}
                                        onChange={(e) => setTaskForm({ ...taskForm, parentTaskId: e.target.value })}
                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:border-blue-500"
                                    >
                                        <option value="">-- ไม่มี (รายการหลัก) --</option>
                                        {tasks
                                            .filter(t => t.type === 'group' && t.id !== editingTask?.id && t.category === taskForm.category)
                                            .map(group => (
                                                <option key={group.id} value={group.id}>
                                                    {group.name}
                                                </option>
                                            ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">สี (Color)</label>
                                    <div className="flex flex-wrap gap-2">
                                        {[
                                            '#3b82f6', // Blue
                                            '#ef4444', // Red
                                            '#22c55e', // Green
                                            '#eab308', // Yellow
                                            '#a855f7', // Purple
                                            '#ec4899', // Pink
                                            '#f97316', // Orange
                                            '#6b7280'  // Gray
                                        ].map((color) => (
                                            <button
                                                key={color}
                                                type="button"
                                                onClick={() => setTaskForm({ ...taskForm, color })}
                                                className={`w-8 h-8 rounded-full border-2 transition-all ${taskForm.color === color ? 'border-gray-900 scale-110 shadow-sm' : 'border-transparent hover:scale-110'}`}
                                                style={{ backgroundColor: color }}
                                                aria-label={color}
                                            />
                                        ))}
                                    </div>
                                </div>

                                {taskForm.type === 'group' && (
                                    <div className="md:col-span-3 bg-blue-50 text-blue-700 text-xs p-3 rounded-lg flex items-start gap-2">
                                        <Info className="w-4 h-4 mt-0.5 shrink-0" />
                                        <p>สำหรับ "กลุ่ม" วันที่, ต้นทุน, และความคืบหน้าจะถูกคำนวณอัตโนมัติจากงานย่อย</p>
                                    </div>
                                )}

                                {taskForm.type !== 'group' && (
                                    <>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Cost (Baht)</label>
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                value={taskForm.cost}
                                                onChange={(e) => setTaskForm({ ...taskForm, cost: parseFloat(e.target.value) || 0 })}
                                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:border-blue-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Quantity (Q'ty)</label>
                                            <input
                                                type="text"
                                                value={taskForm.quantity}
                                                onChange={(e) => setTaskForm({ ...taskForm, quantity: e.target.value })}
                                                placeholder="e.g. 50 m2"
                                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:border-blue-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Progress (%)</label>
                                            <input
                                                type="number"
                                                min="0"
                                                max="100"
                                                value={taskForm.progress}
                                                onChange={(e) => setTaskForm({ ...taskForm, progress: parseFloat(e.target.value) || 0 })}
                                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:border-blue-500"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1.5">วันเริ่มต้น *</label>
                                            <input
                                                type="date"
                                                required
                                                value={taskForm.planStartDate}
                                                onChange={(e) => setTaskForm({ ...taskForm, planStartDate: e.target.value })}
                                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:border-blue-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1.5">วันสิ้นสุด *</label>
                                            <input
                                                type="date"
                                                required
                                                value={taskForm.planEndDate}
                                                onChange={(e) => setTaskForm({ ...taskForm, planEndDate: e.target.value })}
                                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:border-blue-500"
                                            />
                                        </div>
                                    </>
                                )}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">ผู้รับผิดชอบ</label>
                                    <input
                                        type="text"
                                        list="member-list"
                                        value={taskForm.responsible}
                                        onChange={(e) => setTaskForm({ ...taskForm, responsible: e.target.value })}
                                        placeholder="เลือกหรือพิมพ์ชื่อผู้รับผิดชอบ..."
                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:border-blue-500"
                                    />
                                    <datalist id="member-list">
                                        {members.map((member) => (
                                            <option key={member.id} value={member.name}>{member.name} ({member.role})</option>
                                        ))}
                                    </datalist>
                                </div>

                                {taskForm.type !== 'group' && (
                                    <div className="md:col-span-3 pt-6 border-t border-gray-200">
                                        <div className="flex items-center gap-2 mb-4">
                                            <p className="text-sm font-medium text-gray-900">วันที่ดำเนินการจริง (Actual Dates)</p>
                                            <span className="text-xs text-gray-400 font-normal">(Optional)</span>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div>
                                                <label className="block text-xs font-medium text-gray-500 mb-1.5">เริ่มงานจริง</label>
                                                <input
                                                    type="date"
                                                    value={taskForm.actualStartDate}
                                                    onChange={(e) => setTaskForm({ ...taskForm, actualStartDate: e.target.value })}
                                                    className="w-full px-3 py-2 bg-green-50/50 border border-green-200 rounded-lg text-sm focus:bg-white focus:border-green-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-500 mb-1.5">เสร็จงานจริง</label>
                                                <input
                                                    type="date"
                                                    value={taskForm.actualEndDate}
                                                    onChange={(e) => setTaskForm({ ...taskForm, actualEndDate: e.target.value })}
                                                    className="w-full px-3 py-2 bg-green-50/50 border border-green-200 rounded-lg text-sm focus:bg-white focus:border-green-500"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="md:col-span-3 flex items-center justify-end gap-3 pt-6 border-t border-gray-200 mt-2">
                                    <button
                                        type="button"
                                        onClick={() => setIsTaskModalOpen(false)}
                                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                                    >
                                        ยกเลิก
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={saving}
                                        className="px-6 py-2 text-sm font-medium text-white bg-black rounded-lg shadow-sm hover:bg-gray-800 disabled:opacity-50 flex items-center gap-2 transition-colors"
                                    >
                                        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                                        {editingTask ? 'บันทึก' : 'เพิ่มงาน'}
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
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-xl w-full max-w-md p-4">
                            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                                <h2 className="text-lg font-semibold text-gray-900">
                                    อัปเดทความคืบหน้า
                                </h2>
                                <button
                                    onClick={() => setIsProgressModalOpen(false)}
                                    className="p-1 hover:bg-gray-100 rounded text-gray-400"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Task Name - Formal Upgrade */}
                            <div className="mb-6 border-b border-gray-100 pb-4">
                                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">
                                    Selected Task
                                </label>
                                <div className="flex items-center justify-between">
                                    <p className="text-sm font-medium text-gray-900">
                                        {progressUpdate.taskName}
                                    </p>
                                    <span className="text-xs font-mono text-gray-400">
                                        task_id: {progressUpdate.taskId.slice(0, 8)}
                                    </span>
                                </div>
                            </div>

                            {/* Progress Input Section */}
                            <div className="mb-6 space-y-4">
                                <div className="flex items-center justify-between">
                                    <label className="text-sm font-medium text-gray-700">Progress</label>
                                    <span className="text-2xl font-light text-gray-900">
                                        {progressUpdate.newProgress === -1 ? '0' : progressUpdate.newProgress}%
                                    </span>
                                </div>

                                {/* Quick Select Buttons */}
                                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
                                    <button
                                        type="button"
                                        onClick={() => setProgressUpdate(prev => ({
                                            ...prev,
                                            newProgress: -1,
                                            actualStartDate: prev.actualStartDate || prev.updateDate,
                                            actualEndDate: ''
                                        }))}
                                        className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all border whitespace-nowrap ${progressUpdate.newProgress === -1
                                            ? 'bg-black text-white border-black'
                                            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                                            }`}
                                    >
                                        Start (0%)
                                    </button>
                                    {[25, 50, 75].map((val) => (
                                        <button
                                            key={val}
                                            type="button"
                                            onClick={() => setProgressUpdate(prev => ({
                                                ...prev,
                                                newProgress: val,
                                                actualStartDate: prev.actualStartDate || prev.updateDate,
                                                actualEndDate: ''
                                            }))}
                                            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all border ${progressUpdate.newProgress === val
                                                ? 'bg-black text-white border-black'
                                                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                                                }`}
                                        >
                                            {val}%
                                        </button>
                                    ))}
                                    <button
                                        type="button"
                                        onClick={() => setProgressUpdate(prev => ({
                                            ...prev,
                                            newProgress: 100,
                                            actualStartDate: prev.actualStartDate || prev.updateDate,
                                            actualEndDate: prev.actualEndDate || prev.updateDate
                                        }))}
                                        className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all border ${progressUpdate.newProgress === 100
                                            ? 'bg-green-600 text-white border-green-600'
                                            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                                            }`}
                                    >
                                        Complete (100%)
                                    </button>
                                </div>

                                {/* Slider */}
                                <div className="px-1">
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        step="5"
                                        value={progressUpdate.newProgress === -1 ? 0 : progressUpdate.newProgress}
                                        onChange={(e) => {
                                            const val = parseInt(e.target.value);
                                            setProgressUpdate(prev => ({
                                                ...prev,
                                                newProgress: val,
                                                actualStartDate: val > 0 ? (prev.actualStartDate || prev.updateDate) : prev.actualStartDate,
                                                actualEndDate: val === 100 ? (prev.actualEndDate || prev.updateDate) : ''
                                            }));
                                        }}
                                        className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-black"
                                    />
                                </div>
                            </div>

                            {/* Plan & Actual Dates */}
                            <div className="grid grid-cols-2 gap-8 mb-6">
                                {/* Plan */}
                                {(() => {
                                    const currentTask = tasks.find(t => t.id === progressUpdate.taskId);
                                    return (
                                        <div className="space-y-3">
                                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-1">Plan</p>
                                            <div className="space-y-2">
                                                <div className="flex justify-between text-xs">
                                                    <span className="text-gray-500">Start</span>
                                                    <span className="font-medium text-gray-900">{currentTask?.planStartDate ? new Date(currentTask.planStartDate).toLocaleDateString('th-TH') : '-'}</span>
                                                </div>
                                                <div className="flex justify-between text-xs">
                                                    <span className="text-gray-500">End</span>
                                                    <span className="font-medium text-gray-900">{currentTask?.planEndDate ? new Date(currentTask.planEndDate).toLocaleDateString('th-TH') : '-'}</span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}

                                {/* Actual */}
                                <div className="space-y-3">
                                    <p className="text-xs font-semibold text-gray-900 uppercase tracking-widest border-b border-gray-900 pb-1">Actual</p>
                                    <div className="space-y-2">
                                        <div className="space-y-1">
                                            <label className="text-[10px] text-gray-500 uppercase">Starts</label>
                                            <input
                                                type="date"
                                                value={progressUpdate.actualStartDate}
                                                onChange={(e) => setProgressUpdate({ ...progressUpdate, actualStartDate: e.target.value })}
                                                className="w-full py-1 bg-transparent border-b border-gray-200 text-xs font-medium focus:border-black focus:ring-0 p-0 rounded-none "
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] text-gray-500 uppercase">Ends</label>
                                            <input
                                                type="date"
                                                value={progressUpdate.actualEndDate}
                                                onChange={(e) => setProgressUpdate({ ...progressUpdate, actualEndDate: e.target.value })}
                                                disabled={progressUpdate.newProgress < 100}
                                                className="w-full py-1 bg-transparent border-b border-gray-200 text-xs font-medium focus:border-black focus:ring-0 p-0 rounded-none disabled:text-gray-300"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Meta & Actions */}
                            <div className="bg-gray-50 -mx-4 -mb-4 p-4 border-t border-gray-100 rounded-b-xl">
                                <div className="grid grid-cols-2 gap-4 mb-4">
                                    <div>
                                        <label className="block text-[10px] font-medium text-gray-500 uppercase mb-1">Date</label>
                                        <input
                                            type="date"
                                            value={progressUpdate.updateDate}
                                            onChange={(e) => setProgressUpdate({ ...progressUpdate, updateDate: e.target.value })}
                                            className="w-full text-xs border-gray-200 rounded shadow-sm focus:border-black focus:ring-black"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-medium text-gray-500 uppercase mb-1">Note</label>
                                        <input
                                            type="text"
                                            value={progressUpdate.reason}
                                            onChange={(e) => setProgressUpdate({ ...progressUpdate, reason: e.target.value })}
                                            placeholder="Optional"
                                            className="w-full text-xs border-gray-200 rounded shadow-sm focus:border-black focus:ring-black"
                                        />
                                    </div>
                                </div>
                                <div className="flex items-center justify-end gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setIsProgressModalOpen(false)}
                                        className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleProgressSubmit}
                                        disabled={savingProgress || !progressUpdate.updateDate}
                                        className="px-4 py-1.5 text-xs font-medium text-white bg-black rounded shadow-sm hover:bg-gray-800 disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {savingProgress && <Loader2 className="w-3 h-3 animate-spin" />}
                                        Save
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Color Picker Popover */}
            {
                activeColorMenu && (
                    <>
                        <div className="fixed inset-0 z-[100]" onClick={() => setActiveColorMenu(null)} />
                        <div
                            className="fixed z-[101] bg-white rounded-lg shadow-xl border border-gray-200 p-3 grid grid-cols-4 gap-2 animate-in fade-in zoom-in-95 duration-100"
                            style={{
                                top: `${activeColorMenu.top + 8}px`,
                                left: `${activeColorMenu.left}px`
                            }}
                        >
                            {COLORS.map((color) => (
                                <button
                                    key={color}
                                    className="w-6 h-6 rounded-full border border-gray-200 hover:scale-110 transition-transform focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500"
                                    style={{ backgroundColor: color }}
                                    onClick={() => handleColorChange(color)}
                                    title={color}
                                />
                            ))}
                        </div>
                    </>
                )
            }
        </div >
    );
}
