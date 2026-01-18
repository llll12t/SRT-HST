'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
    Search,
    Plus,
    Edit2,
    Trash2,
    ListTodo,
    Upload,
    CheckCircle2,
    Clock,
    AlertTriangle,
    Loader2,
    X,
    Filter,
    ArrowUp,
    ArrowDown,
    ChevronLeft,
    ChevronRight,
    FolderKanban,
    Info,
} from 'lucide-react';
import { Task, Project, Member } from '@/types/construction';
import { getAllTasks, getProjects, createTask, updateTask, deleteTask, updateTaskProgress, getMembers } from '@/lib/firestore';
import { useAuth } from '@/contexts/AuthContext';

type StatusFilter = 'all' | 'completed' | 'in-progress' | 'not-started' | 'delayed';




export default function TasksPage() {
    const { user } = useAuth();
    const [tasks, setTasks] = useState<Task[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [members, setMembers] = useState<Member[]>([]);
    const [loading, setLoading] = useState(true);

    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [projectFilter, setProjectFilter] = useState('all');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [sortBy, setSortBy] = useState<'order' | 'name' | 'progress' | 'cost'>('order');

    // Pagination & Loading
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(50);
    const [reorderingId, setReorderingId] = useState<string | null>(null);

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTask, setEditingTask] = useState<Task | null>(null);
    const [saving, setSaving] = useState(false);
    const [taskForm, setTaskForm] = useState({
        projectId: '',
        category: '',
        type: 'task' as 'task' | 'group',
        parentTaskId: '',
        name: '',
        cost: 0,
        quantity: '',
        planStartDate: '',
        planEndDate: '',
        planDuration: 30,
        progress: 0,
        responsible: '',
        color: '#3b82f6'
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

    // Color Picker State
    const COLORS = [
        '#3b82f6', // Blue
        '#ef4444', // Red
        '#22c55e', // Green
        '#eab308', // Yellow
        '#a855f7', // Purple
        '#ec4899', // Pink
        '#f97316', // Orange
        '#6b7280', // Gray
    ];
    const [activeColorMenu, setActiveColorMenu] = useState<{ id: string, type: 'group' | 'category', top: number, left: number } | null>(null);
    const [categoryColors, setCategoryColors] = useState<Record<string, string>>({});

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
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [tasksData, projectsData, membersData] = await Promise.all([
                getAllTasks(),
                getProjects(),
                getMembers()
            ]);
            setTasks(tasksData);
            setProjects(projectsData);
            setMembers(membersData);
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    };

    // Get unique categories
    const categories = useMemo(() =>
        ['all', ...new Set(tasks.map(t => t.category))],
        [tasks]
    );

    // Filter tasks
    const filteredTasks = useMemo(() => {
        let result = [...tasks];

        if (searchQuery) {
            result = result.filter(t =>
                t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                t.category.toLowerCase().includes(searchQuery.toLowerCase())
            );
        }

        if (statusFilter !== 'all') {
            result = result.filter(t => t.status === statusFilter);
        }

        if (projectFilter !== 'all') {
            result = result.filter(t => t.projectId === projectFilter);
        }

        if (categoryFilter !== 'all') {
            result = result.filter(t => t.category === categoryFilter);
        }

        result.sort((a, b) => {
            if (sortBy === 'order') return (a.order || 0) - (b.order || 0);
            if (sortBy === 'name') return a.name.localeCompare(b.name);
            if (sortBy === 'progress') return b.progress - a.progress;
            if (sortBy === 'cost') return (b.cost || 0) - (a.cost || 0);
            return 0;
        });

        return result;
    }, [tasks, searchQuery, statusFilter, projectFilter, categoryFilter, sortBy]);

    // Reset pagination when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, statusFilter, projectFilter, categoryFilter, sortBy]);

    const paginatedTasks = filteredTasks.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const totalPages = Math.ceil(filteredTasks.length / itemsPerPage);

    // Stats
    const stats = useMemo(() => ({
        total: tasks.length,
        completed: tasks.filter(t => t.status === 'completed').length,
        inProgress: tasks.filter(t => t.status === 'in-progress').length,
        notStarted: tasks.filter(t => t.status === 'not-started').length,
    }), [tasks]);

    // Get project name
    const getProjectName = (projectId: string) => {
        const project = projects.find(p => p.id === projectId);
        return project?.name || 'Unknown';
    };

    // Status badge
    const getStatusBadge = (status: string) => {
        const configs: Record<string, { class: string; label: string; icon: React.ReactNode }> = {
            'completed': { class: 'badge-success', label: 'เสร็จสิ้น', icon: <CheckCircle2 className="w-3 h-3" /> },
            'in-progress': { class: 'badge-info', label: 'กำลังดำเนินการ', icon: <Clock className="w-3 h-3" /> },
            'not-started': { class: 'badge-neutral', label: 'ยังไม่เริ่ม', icon: <Clock className="w-3 h-3" /> },
            'delayed': { class: 'badge-danger', label: 'ล่าช้า', icon: <AlertTriangle className="w-3 h-3" /> },
        };
        const config = configs[status] || configs['not-started'];
        return (
            <span className={`badge ${config.class} inline-flex items-center gap-1`}>
                {config.icon}
                {config.label}
            </span>
        );
    };

    const handleMoveTask = async (task: Task, direction: 'up' | 'down') => {
        if (projectFilter === 'all' || sortBy !== 'order') return;

        const currentIndex = filteredTasks.findIndex(t => t.id === task.id);
        if (currentIndex === -1) return;

        const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
        if (targetIndex < 0 || targetIndex >= filteredTasks.length) return;

        const targetTask = filteredTasks[targetIndex];

        // Ensure both have valid order values before swapping
        const taskOrder = task.order || 0;
        const targetOrder = targetTask.order || 0;

        setReorderingId(task.id);
        try {
            await updateTask(task.id, { order: targetOrder });
            await updateTask(targetTask.id, { order: taskOrder });
            await fetchData(); // Wait for fetch
        } catch (error) {
            console.error('Failed to reorder tasks', error);
            alert('เกิดข้อผิดพลาดในการจัดลำดับ');
        } finally {
            setReorderingId(null);
        }
    };

    // Open modal
    const openCreateModal = () => {
        setEditingTask(null);
        setTaskForm({
            projectId: projects[0]?.id || '',
            category: '',
            type: 'task',
            parentTaskId: '',
            name: '',
            cost: 0,
            quantity: '',
            planStartDate: new Date().toISOString().slice(0, 10),
            planEndDate: '',
            planDuration: 30,
            progress: 0,
            responsible: '',
            color: '#3b82f6'
        });
        setIsModalOpen(true);
    };

    const openEditModal = (task: Task) => {
        setEditingTask(task);
        setTaskForm({
            projectId: task.projectId,
            category: task.category,
            type: task.type || 'task',
            parentTaskId: task.parentTaskId || '',
            name: task.name,
            cost: task.cost || 0,
            quantity: task.quantity || '',
            planStartDate: task.planStartDate,
            planEndDate: task.planEndDate,
            planDuration: task.planDuration,
            progress: task.progress,
            responsible: task.responsible || '',
            color: task.color || '#3b82f6'
        });
        setIsModalOpen(true);
    };

    // Handle submit
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);

        try {
            let status: Task['status'] = 'not-started';
            if (taskForm.progress === 100) status = 'completed';
            else if (taskForm.progress > 0) status = 'in-progress';

            if (editingTask) {
                await updateTask(editingTask.id, {
                    projectId: taskForm.projectId,
                    category: taskForm.category,
                    type: taskForm.type,
                    parentTaskId: taskForm.parentTaskId || null,
                    name: taskForm.name,
                    cost: taskForm.cost,
                    quantity: taskForm.quantity,
                    planStartDate: taskForm.planStartDate,
                    planEndDate: taskForm.planEndDate,
                    planDuration: taskForm.planDuration,
                    progress: taskForm.progress,
                    responsible: taskForm.responsible,
                    status
                });
            } else {
                // Determine new order: max order in this project + 1
                const projectTasks = tasks.filter(t => t.projectId === taskForm.projectId);
                const maxOrder = projectTasks.reduce((max, t) => Math.max(max, t.order || 0), 0);

                await createTask({
                    projectId: taskForm.projectId,
                    category: taskForm.category,
                    type: taskForm.type,
                    parentTaskId: taskForm.parentTaskId || null,
                    name: taskForm.name,
                    cost: taskForm.cost,
                    quantity: taskForm.quantity,
                    planStartDate: taskForm.planStartDate,
                    planEndDate: taskForm.planEndDate,
                    planDuration: taskForm.planDuration,
                    progress: taskForm.progress,
                    responsible: taskForm.responsible,
                    status,
                    order: maxOrder + 1
                });
            }

            setIsModalOpen(false);
            fetchData();
        } catch (error) {
            console.error('Error saving task:', error);
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

    // Handle delete
    const handleDelete = (taskId: string) => {
        setAlertDialog({
            isOpen: true,
            title: 'ยืนยันการลบ',
            message: 'คุณต้องการลบงานนี้ใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้',
            type: 'confirm',
            onConfirm: async () => {
                try {
                    await deleteTask(taskId);
                    fetchData();
                    setAlertDialog(prev => ({ ...prev, isOpen: false }));
                } catch (error) {
                    console.error('Error deleting task:', error);
                    setAlertDialog({
                        isOpen: true,
                        title: 'ข้อผิดพลาด',
                        message: 'ไม่สามารถลบงานได้',
                        type: 'error',
                        onConfirm: () => setAlertDialog(prev => ({ ...prev, isOpen: false }))
                    });
                }
            },
            onCancel: () => setAlertDialog(prev => ({ ...prev, isOpen: false }))
        });
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

    // Handle progress submit
    const handleProgressSubmit = async () => {
        if (!progressUpdate.taskId) return;

        setSavingProgress(true);
        try {
            const task = tasks.find(t => t.id === progressUpdate.taskId);
            if (!task) return;

            // Handle "เริ่มงาน" (-1) special case
            const isStartingWork = progressUpdate.newProgress === -1;
            const actualProgress = isStartingWork ? 0 : progressUpdate.newProgress;

            // Determine status
            let newStatus: Task['status'] = 'not-started';
            if (actualProgress === 100) newStatus = 'completed';
            else if (actualProgress > 0) newStatus = 'in-progress';
            else if (isStartingWork) newStatus = 'in-progress';
            else if (actualProgress === 0 && task.status === 'in-progress') newStatus = 'in-progress';

            const updateData: Partial<Task> = {
                progress: actualProgress, // Ensure logic uses clean value
                progressUpdatedAt: progressUpdate.updateDate,
                status: newStatus,
                actualStartDate: progressUpdate.actualStartDate,
                actualEndDate: progressUpdate.actualEndDate
            };

            if (progressUpdate.reason) {
                updateData.remarks = progressUpdate.reason;
            }

            await updateTask(progressUpdate.taskId, updateData);
            setIsProgressModalOpen(false);
            fetchData();
        } catch (error) {
            console.error('Error updating progress:', error);
            setAlertDialog({
                isOpen: true,
                title: 'ข้อผิดพลาด',
                message: 'เกิดข้อผิดพลาดในการอัปเดทข้อมูล',
                type: 'error',
                onConfirm: () => setAlertDialog(prev => ({ ...prev, isOpen: false }))
            });
        } finally {
            setSavingProgress(false);
        }
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
                setAlertDialog({
                    isOpen: true,
                    title: 'ข้อผิดพลาด',
                    message: 'เกิดข้อผิดพลาดในการเปลี่ยนสี',
                    type: 'error',
                    onConfirm: () => setAlertDialog(prev => ({ ...prev, isOpen: false }))
                });
                fetchData(); // Rollback on error
            }
        } else if (activeColorMenu.type === 'category') {
            const newColors = { ...categoryColors, [activeColorMenu.id]: color };
            setCategoryColors(newColors);
            localStorage.setItem('ganttCategoryColors', JSON.stringify(newColors));
        }

        setActiveColorMenu(null);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                <span className="ml-2 text-gray-600">กำลังโหลดข้อมูล...</span>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
                        <ListTodo className="w-6 h-6 text-blue-600" />
                        รายการงาน
                    </h1>
                    <p className="text-gray-600 text-sm mt-0.5">จัดการและติดตามความคืบหน้างานทั้งหมด</p>
                </div>

                {['admin', 'project_manager'].includes(user?.role || '') && (
                    <button
                        onClick={openCreateModal}
                        disabled={projects.length === 0}
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-sm hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                        <Plus className="w-4 h-4" />
                        เพิ่มงานใหม่
                    </button>
                )}
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                    { label: 'ทั้งหมด', value: stats.total, filter: 'all', active: statusFilter === 'all' },
                    { label: 'เสร็จสิ้น', value: stats.completed, filter: 'completed', active: statusFilter === 'completed', color: 'text-green-600' },
                    { label: 'กำลังดำเนินการ', value: stats.inProgress, filter: 'in-progress', active: statusFilter === 'in-progress', color: 'text-blue-600' },
                    { label: 'ยังไม่เริ่ม', value: stats.notStarted, filter: 'not-started', active: statusFilter === 'not-started', color: 'text-amber-600' },
                ].map((stat) => (
                    <button
                        key={stat.filter}
                        onClick={() => setStatusFilter(stat.filter as StatusFilter)}
                        className={`p-4 rounded-lg border text-left transition-all ${stat.active
                            ? 'bg-white border-blue-600 ring-1 ring-blue-600 shadow-sm'
                            : 'bg-white border-gray-100 hover:border-gray-300 hover:shadow-sm'
                            }`}
                    >
                        <p className="text-gray-600 text-xs font-medium">{stat.label}</p>
                        <p className={`text-xl font-semibold mt-0.5 ${stat.color || 'text-gray-900'}`}>{stat.value}</p>
                    </button>
                ))}
            </div>

            {/* Filters */}
            <div className="bg-white rounded-lg border border-gray-100 p-4 flex flex-col lg:flex-row gap-3 shadow-sm">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                        type="text"
                        placeholder="ค้นหาชื่องาน..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:border-black focus:ring-0"
                    />
                </div>

                <select
                    value={projectFilter}
                    onChange={(e) => setProjectFilter(e.target.value)}
                    className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                >
                    <option value="all">ทุกโครงการ</option>
                    {projects.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                </select>

                <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                >
                    {categories.map(cat => (
                        <option key={cat} value={cat}>
                            {cat === 'all' ? 'ทุกหมวดหมู่' : cat}
                        </option>
                    ))}
                </select>

                <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                >
                    <option value="order">เรียงตามลำดับ</option>
                    <option value="name">เรียงตามชื่อ</option>
                    <option value="progress">เรียงตาม Progress</option>
                    <option value="cost">เรียงตาม Cost</option>
                </select>
            </div>

            {/* Table */}
            {projects.length === 0 ? (
                <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
                    <ListTodo className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-600 mb-4">กรุณาสร้างโครงการก่อน</p>
                    <Link
                        href="/projects"
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 inline-block"
                    >
                        ไปหน้าโครงการ
                    </Link>
                </div>
            ) : filteredTasks.length === 0 ? (
                <div className="bg-white rounded-lg border border-gray-100 p-12 text-center">
                    <ListTodo className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-600 mb-4">
                        {tasks.length === 0 ? 'ยังไม่มีงาน' : 'ไม่พบงานที่ค้นหา'}
                    </p>
                    {tasks.length === 0 && ['admin', 'project_manager'].includes(user?.role || '') && (
                        <button
                            onClick={openCreateModal}
                            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                        >
                            เพิ่มงานแรก
                        </button>
                    )}
                </div>
            ) : (
                <div className="bg-white rounded-lg border border-gray-100 overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">ชื่องาน</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">โครงการ</th>
                                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase">วันที่ดำเนินการ</th>
                                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase">Cost</th>
                                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase">Q'ty</th>
                                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase">Progress</th>
                                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase">สถานะ</th>
                                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {paginatedTasks.map((task) => (
                                    <tr
                                        key={task.id}
                                        className={`transition-colors group ${reorderingId === task.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                                        style={{ backgroundColor: task.type === 'group' && task.color ? `${task.color}20` : undefined }}
                                    >
                                        <td className="px-4 py-3">
                                            <div className="max-w-[320px]">
                                                <div className="flex items-center gap-2">
                                                    {task.type === 'group' && (
                                                        <>
                                                            <button
                                                                className="w-3 h-3 rounded-full border border-gray-300 hover:scale-110 transition-transform flex-shrink-0 focus:outline-none"
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
                                                            <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium shrink-0 flex items-center gap-1">
                                                                <FolderKanban className="w-3 h-3" />
                                                                GROUP
                                                            </span>
                                                        </>
                                                    )}
                                                    <p className={`text-sm truncate ${task.type === 'group' ? 'font-bold text-gray-900' : 'font-medium text-gray-900'}`}>
                                                        {task.name}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-1 mt-0.5">
                                                    <button
                                                        className="w-2 h-2 rounded-full border border-gray-300 hover:scale-125 transition-transform flex-shrink-0 focus:outline-none"
                                                        style={{ backgroundColor: categoryColors[task.category] || '#9ca3af' }}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            const rect = e.currentTarget.getBoundingClientRect();
                                                            setActiveColorMenu({
                                                                id: task.category,
                                                                type: 'category',
                                                                top: rect.bottom + window.scrollY,
                                                                left: rect.left + window.scrollX
                                                            });
                                                        }}
                                                        title="เปลี่ยนสีหมวดหมู่"
                                                    />
                                                    <span className="text-xs text-gray-500">{task.category}</span>
                                                    {task.parentTaskId && (
                                                        <span className="text-xs text-blue-500">
                                                            ← {tasks.find(t => t.id === task.parentTaskId)?.name || 'Parent'}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <Link
                                                href={`/projects/${task.projectId}`}
                                                className="text-sm text-blue-600 hover:text-blue-700"
                                            >
                                                {getProjectName(task.projectId)}
                                            </Link>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <div className="flex flex-col text-xs">
                                                <span className="text-gray-600">
                                                    แผน: {new Date(task.planStartDate).toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: '2-digit' })} - {new Date(task.planEndDate).toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                                                </span>
                                                {task.actualStartDate && (
                                                    <span className="text-green-600 font-medium">
                                                        จริง: {new Date(task.actualStartDate).toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: '2-digit' })} - {task.actualEndDate ? new Date(task.actualEndDate).toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '...'}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className="text-sm font-medium text-gray-700">{task.cost ? task.cost.toLocaleString() : '-'}</span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className="text-sm text-gray-700">{task.quantity || '-'}</span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2 justify-center">
                                                <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full ${task.progress === 100 ? 'bg-green-500' :
                                                            task.progress >= 50 ? 'bg-blue-500' :
                                                                task.progress > 0 ? 'bg-amber-500' :
                                                                    'bg-gray-300'
                                                            }`}
                                                        style={{ width: `${task.progress}%` }}
                                                    />
                                                </div>
                                                <span className="text-sm font-medium text-gray-700">{task.progress}%</span>
                                            </div>
                                            {task.progressUpdatedAt && (
                                                <p className="text-xs text-gray-500 mt-1 text-center">
                                                    อัพเดท: {new Date(task.progressUpdatedAt).toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                                                </p>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {getStatusBadge(task.status)}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center justify-center gap-1">
                                                {/* Update Progress: Admin, PM, Engineer */}
                                                {['admin', 'project_manager', 'engineer'].includes(user?.role || '') && task.type !== 'group' && (
                                                    <button
                                                        onClick={() => openProgressModal(task, task.progress)}
                                                        className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors border border-blue-200 hover:shadow-sm"
                                                    >
                                                        อัปเดท
                                                    </button>
                                                )}

                                                {/* Edit/Delete: Admin, PM */}
                                                {['admin', 'project_manager'].includes(user?.role || '') && (
                                                    <>
                                                        <button
                                                            onClick={() => openEditModal(task)}
                                                            className="p-1.5 hover:bg-gray-100 rounded-sm text-gray-500 hover:text-blue-600"
                                                        >
                                                            <Edit2 className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(task.id)}
                                                            className="p-1.5 hover:bg-gray-100 rounded-sm text-gray-500 hover:text-red-600"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </>
                                                )}

                                                {/* Reorder: Admin, PM - Only when filtered by project and sorted by order */}
                                                {['admin', 'project_manager'].includes(user?.role || '') &&
                                                    projectFilter !== 'all' &&
                                                    sortBy === 'order' && (
                                                        <div className="flex flex-col ml-1 border-l border-gray-200 pl-1 h-full justify-center min-h-[32px]">
                                                            {reorderingId === task.id ? (
                                                                <div className="p-1">
                                                                    <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                                                                </div>
                                                            ) : (
                                                                <>
                                                                    <button
                                                                        onClick={() => handleMoveTask(task, 'up')}
                                                                        className="p-0.5 hover:bg-gray-100 rounded-sm text-gray-500 hover:text-blue-600 disabled:opacity-30"
                                                                        disabled={filteredTasks.indexOf(task) === 0 || reorderingId !== null}
                                                                    >
                                                                        <ArrowUp className="w-3 h-3" />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleMoveTask(task, 'down')}
                                                                        className="p-0.5 hover:bg-gray-100 rounded-sm text-gray-500 hover:text-blue-600 disabled:opacity-30"
                                                                        disabled={filteredTasks.indexOf(task) === filteredTasks.length - 1 || reorderingId !== null}
                                                                    >
                                                                        <ArrowDown className="w-3 h-3" />
                                                                    </button>
                                                                </>
                                                            )}
                                                        </div>
                                                    )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Footer with Pagination */}
                    <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t border-gray-200">
                        <p className="text-sm text-gray-600">
                            แสดง {paginatedTasks.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} ถึง {Math.min(currentPage * itemsPerPage, filteredTasks.length)} จาก {filteredTasks.length} รายการ
                        </p>

                        {totalPages > 1 && (
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setCurrentPage(c => Math.max(1, c - 1))}
                                    disabled={currentPage === 1}
                                    className="p-1 rounded-sm hover:bg-gray-200 disabled:opacity-30 disabled:hover:bg-transparent"
                                >
                                    <ChevronLeft className="w-5 h-5 text-gray-600" />
                                </button>
                                <span className="text-sm font-medium text-gray-700">
                                    หน้า {currentPage} / {totalPages}
                                </span>
                                <button
                                    onClick={() => setCurrentPage(c => Math.min(totalPages, c + 1))}
                                    disabled={currentPage === totalPages}
                                    className="p-1 rounded-sm hover:bg-gray-200 disabled:opacity-30 disabled:hover:bg-transparent"
                                >
                                    <ChevronRight className="w-5 h-5 text-gray-600" />
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Create/Edit Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg border border-gray-100 w-full max-w-3xl max-h-[90vh] flex flex-col shadow-xl">
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                            <div>
                                <h2 className="text-lg font-bold text-gray-900">
                                    {editingTask ? 'แก้ไขงาน' : 'เพิ่มงานใหม่'}
                                </h2>
                                <p className="text-xs text-gray-500 mt-1">
                                    {editingTask ? 'แก้ไขรายละเอียดงานที่มีอยู่' : 'สร้างงานหรือกลุ่มงานใหม่ในโครงการ'}
                                </p>
                            </div>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-900 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Body - Scrollable */}
                        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                            <form id="task-form" onSubmit={handleSubmit} className="space-y-4">

                                {/* Section 1: Core Info */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {/* Category - Spans 1 col */}
                                    <div className="md:col-span-1">
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">หมวดหมู่ *</label>
                                        <input
                                            type="text"
                                            list="category-suggestions"
                                            required
                                            value={taskForm.category}
                                            onChange={(e) => setTaskForm({ ...taskForm, category: e.target.value })}
                                            placeholder="เลือกหรือพิมพ์ใหม่..."
                                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:border-black focus:ring-0 outline-none transition-all"
                                        />
                                        <datalist id="category-suggestions">
                                            {[...new Set(
                                                tasks
                                                    .filter(t => !taskForm.projectId || t.projectId === taskForm.projectId)
                                                    .map(t => t.category)
                                            )].map((c, i) => (
                                                <option key={i} value={c} />
                                            ))}
                                        </datalist>
                                    </div>

                                    {/* Name - Spans 2 cols */}
                                    <div className="md:col-span-2">
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                            {taskForm.type === 'group' ? 'ชื่อ Group *' : 'ชื่องาน *'}
                                        </label>
                                        <input
                                            type="text"
                                            required
                                            value={taskForm.name}
                                            onChange={(e) => setTaskForm({ ...taskForm, name: e.target.value })}
                                            placeholder={taskForm.type === 'group' ? 'ชื่อหมวดหมู่ย่อย (Sub-Group)' : 'ระบุชื่องาน...'}
                                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:border-black focus:ring-0 outline-none transition-all"
                                        />
                                    </div>

                                    {/* Project */}
                                    <div className="md:col-span-1">
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">โครงการ *</label>
                                        <select
                                            required
                                            value={taskForm.projectId}
                                            onChange={(e) => setTaskForm({ ...taskForm, projectId: e.target.value })}
                                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:border-black focus:ring-0 outline-none"
                                        >
                                            <option value="" disabled>เลือกโครงการ...</option>
                                            {projects.map(p => (
                                                <option key={p.id} value={p.id}>{p.name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Parent Task (Under Group) */}
                                    <div className="md:col-span-2">
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">อยู่ภายใต้ (Parent Group)</label>
                                        <select
                                            value={taskForm.parentTaskId}
                                            onChange={(e) => setTaskForm({ ...taskForm, parentTaskId: e.target.value })}
                                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:border-black focus:ring-0 outline-none"
                                        >
                                            <option value="">หมวดหมู่หลัก</option>
                                            {tasks
                                                .filter(t =>
                                                    t.projectId === taskForm.projectId &&
                                                    t.type === 'group' &&
                                                    t.id !== editingTask?.id
                                                )
                                                .map(t => (
                                                    <option key={t.id} value={t.id}>
                                                        {t.category} → {t.name}
                                                    </option>
                                                ))
                                            }
                                        </select>
                                    </div>

                                    {/* Type */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">ประเภท</label>
                                        <div className="flex rounded-lg border border-gray-200 p-1 bg-gray-50/50">
                                            <button
                                                type="button"
                                                onClick={() => setTaskForm({ ...taskForm, type: 'task' })}
                                                className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-semibold rounded-md transition-all ${taskForm.type === 'task' ? 'bg-white text-blue-600 shadow-sm border border-gray-100' : 'text-gray-500 hover:text-gray-700'}`}
                                            >
                                                <ListTodo className="w-3.5 h-3.5" />
                                                Task
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setTaskForm({ ...taskForm, type: 'group' })}
                                                className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-semibold rounded-md transition-all ${taskForm.type === 'group' ? 'bg-white text-blue-600 shadow-sm border border-gray-100' : 'text-gray-500 hover:text-gray-700'}`}
                                            >
                                                <FolderKanban className="w-3.5 h-3.5" />
                                                Group
                                            </button>
                                        </div>
                                    </div>

                                    {/* Color Picker - Span 2 */}
                                    <div className="md:col-span-2">
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
                                                    className={`w-6 h-6 rounded-full border-2 transition-all ${(taskForm as any).color === color ? 'border-gray-900 scale-110 shadow-sm' : 'border-transparent hover:scale-110'}`}
                                                    style={{ backgroundColor: color }}
                                                    onClick={() => setTaskForm({ ...taskForm, color } as any)}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {taskForm.type === 'group' && (
                                    <div className="bg-blue-50 text-blue-700 text-xs p-3 rounded-lg flex items-start gap-2">
                                        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                                        <p>สำหรับ "กลุ่ม" วันที่, ต้นทุน, และความคืบหน้าจะถูกคำนวณอัตโนมัติจากงานย่อย</p>
                                    </div>
                                )}

                                {taskForm.type !== 'group' && (
                                    <>
                                        {/* Section 2: Metrics */}
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Cost (Baht)</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={taskForm.cost}
                                                    onChange={(e) => setTaskForm({ ...taskForm, cost: parseFloat(e.target.value) || 0 })}
                                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:border-black focus:ring-0 outline-none transition-all"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Quantity (Q'ty)</label>
                                                <input
                                                    type="text"
                                                    value={taskForm.quantity}
                                                    onChange={(e) => setTaskForm({ ...taskForm, quantity: e.target.value })}
                                                    placeholder="e.g. 50 m2"
                                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:border-black focus:ring-0 outline-none transition-all"
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
                                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:border-black focus:ring-0 outline-none transition-all"
                                                />
                                            </div>
                                        </div>

                                        {/* Section 3: Dates & Responsible */}
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1.5">วันเริ่มต้น *</label>
                                                <input
                                                    type="date"
                                                    required
                                                    value={taskForm.planStartDate}
                                                    onChange={(e) => setTaskForm({ ...taskForm, planStartDate: e.target.value })}
                                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:border-black focus:ring-0 outline-none transition-all"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1.5">วันสิ้นสุด *</label>
                                                <input
                                                    type="date"
                                                    required
                                                    value={taskForm.planEndDate}
                                                    onChange={(e) => setTaskForm({ ...taskForm, planEndDate: e.target.value })}
                                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:border-black focus:ring-0 outline-none transition-all"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1.5">ผู้รับผิดชอบ</label>
                                                <input
                                                    type="text"
                                                    list="member-list"
                                                    value={taskForm.responsible}
                                                    onChange={(e) => setTaskForm({ ...taskForm, responsible: e.target.value })}
                                                    placeholder="ระบุชื่อ..."
                                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:border-black focus:ring-0 outline-none transition-all"
                                                />
                                                <datalist id="member-list">
                                                    {members.map((member) => (
                                                        <option key={member.id} value={member.name}>{member.name} ({member.role})</option>
                                                    ))}
                                                </datalist>
                                            </div>
                                        </div>
                                    </>
                                )}

                            </form>
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-end gap-3 px-4 py-3 border-t border-gray-100 bg-gray-50 rounded-b-lg">
                            <button
                                type="button"
                                onClick={() => setIsModalOpen(false)}
                                className="px-4 py-2 text-sm font-bold text-gray-600 hover:text-gray-800 transition-colors"
                            >
                                ยกเลิก
                            </button>
                            <button
                                type="submit"
                                form="task-form"
                                disabled={saving}
                                className="px-6 py-2 text-sm font-bold text-white bg-black rounded-lg hover:bg-gray-800 focus:ring-2 focus:ring-offset-1 focus:ring-gray-900 transition-all shadow-sm flex items-center gap-2"
                            >
                                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                                {editingTask ? 'บันทึกการแก้ไข' : 'สร้างงานใหม่'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Progress Update Modal */}
            {isProgressModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg border border-gray-100 w-full max-w-lg shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                            <h2 className="text-lg font-bold text-gray-900">
                                อัปเดทความคืบหน้า
                            </h2>
                            <button
                                onClick={() => setIsProgressModalOpen(false)}
                                className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-400 hover:text-gray-600"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-6 overflow-y-auto custom-scrollbar">

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
                                        id: {progressUpdate.taskId.slice(0, 8)}
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
                            <div className="bg-gray-50 -mx-6 -mb-6 p-4 border-t border-gray-100 mt-8">
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
                </div>
            )}
            {/* Color Picker Popover */}
            {activeColorMenu && (
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
            )}

            {/* Alert/Confirm Modal */}
            {alertDialog.isOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden scale-100 animate-in zoom-in-95 duration-200">
                        <div className="p-6 text-center">
                            <div className={`w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center ${alertDialog.type === 'error' ? 'bg-red-100 text-red-600' :
                                alertDialog.type === 'success' ? 'bg-green-100 text-green-600' :
                                    alertDialog.type === 'confirm' ? 'bg-blue-100 text-blue-600' :
                                        'bg-gray-100 text-gray-600'
                                }`}>
                                {alertDialog.type === 'error' && <AlertTriangle className="w-6 h-6" />}
                                {alertDialog.type === 'success' && <CheckCircle2 className="w-6 h-6" />}
                                {(alertDialog.type === 'confirm' || alertDialog.type === 'info') && <Info className="w-6 h-6" />}
                            </div>

                            <h3 className="text-lg font-bold text-gray-900 mb-2">
                                {alertDialog.title}
                            </h3>
                            <p className="text-sm text-gray-500 mb-6">
                                {alertDialog.message}
                            </p>

                            <div className="flex gap-3 justify-center">
                                {(alertDialog.type === 'confirm') && (
                                    <button
                                        onClick={alertDialog.onCancel}
                                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                                    >
                                        ยกเลิก
                                    </button>
                                )}
                                <button
                                    onClick={alertDialog.onConfirm}
                                    className={`px-4 py-2 text-sm font-medium text-white rounded-lg shadow-sm transition-colors ${alertDialog.type === 'error' ? 'bg-red-600 hover:bg-red-700' :
                                        alertDialog.type === 'success' ? 'bg-green-600 hover:bg-green-700' :
                                            'bg-black hover:bg-gray-800'
                                        }`}
                                >
                                    ตกลง
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
