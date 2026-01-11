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
    Filter
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
    const [sortBy, setSortBy] = useState<'name' | 'progress' | 'cost'>('name');

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTask, setEditingTask] = useState<Task | null>(null);
    const [saving, setSaving] = useState(false);
    const [taskForm, setTaskForm] = useState({
        projectId: '',
        category: '',
        name: '',
        weight: 1, // Hidden default
        cost: 0,
        quantity: '',
        planStartDate: '',
        planEndDate: '',
        planDuration: 30,
        progress: 0,
        responsible: ''
    });

    // Progress update modal
    const [isProgressModalOpen, setIsProgressModalOpen] = useState(false);
    const [progressUpdate, setProgressUpdate] = useState({
        taskId: '',
        taskName: '',
        currentProgress: 0,
        newProgress: 0,
        updateDate: new Date().toISOString().split('T')[0],
        reason: ''
    });
    const [savingProgress, setSavingProgress] = useState(false);

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
            if (sortBy === 'name') return a.name.localeCompare(b.name);
            if (sortBy === 'progress') return b.progress - a.progress;
            if (sortBy === 'cost') return (b.cost || 0) - (a.cost || 0);
            return 0;
        });

        return result;
    }, [tasks, searchQuery, statusFilter, projectFilter, categoryFilter, sortBy]);

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

    // Open modal
    const openCreateModal = () => {
        setEditingTask(null);
        setTaskForm({
            projectId: projects[0]?.id || '',
            category: '',
            name: '',
            weight: 1,
            cost: 0,
            quantity: '',
            planStartDate: new Date().toISOString().slice(0, 10),
            planEndDate: '',
            planDuration: 30,
            progress: 0,
            responsible: ''
        });
        setIsModalOpen(true);
    };

    const openEditModal = (task: Task) => {
        setEditingTask(task);
        setTaskForm({
            projectId: task.projectId,
            category: task.category,
            name: task.name,
            weight: task.weight || 1,
            cost: task.cost || 0,
            quantity: task.quantity || '',
            planStartDate: task.planStartDate,
            planEndDate: task.planEndDate,
            planDuration: task.planDuration,
            progress: task.progress,
            responsible: task.responsible || ''
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
                    name: taskForm.name,
                    weight: taskForm.weight,
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
                await createTask({
                    projectId: taskForm.projectId,
                    category: taskForm.category,
                    name: taskForm.name,
                    weight: taskForm.weight,
                    cost: taskForm.cost,
                    quantity: taskForm.quantity,
                    planStartDate: taskForm.planStartDate,
                    planEndDate: taskForm.planEndDate,
                    planDuration: taskForm.planDuration,
                    progress: taskForm.progress,
                    responsible: taskForm.responsible,
                    status,
                    order: tasks.length + 1
                });
            }

            setIsModalOpen(false);
            fetchData();
        } catch (error) {
            console.error('Error saving task:', error);
            alert('เกิดข้อผิดพลาดในการบันทึก');
        } finally {
            setSaving(false);
        }
    };

    // Handle delete
    const handleDelete = async (taskId: string) => {
        if (!confirm('ยืนยันการลบงานนี้?')) return;

        try {
            await deleteTask(taskId);
            fetchData();
        } catch (error) {
            console.error('Error deleting task:', error);
        }
    };

    // Handle quick progress update - open modal
    const openProgressModal = (task: Task, progress: number) => {
        setProgressUpdate({
            taskId: task.id,
            taskName: task.name,
            currentProgress: task.progress,
            newProgress: progress,
            updateDate: new Date().toISOString().split('T')[0],
            reason: ''
        });
        setIsProgressModalOpen(true);
    };

    // Handle progress submit with date and reason
    const handleProgressSubmit = async () => {
        if (!progressUpdate.taskId) return;

        setSavingProgress(true);
        try {
            const task = tasks.find(t => t.id === progressUpdate.taskId);
            if (!task) return;

            const updateData: Partial<Task> = {
                progress: progressUpdate.newProgress,
                status: progressUpdate.newProgress === 100 ? 'completed' : progressUpdate.newProgress > 0 ? 'in-progress' : 'not-started'
            };

            // Only set remarks if there's a value
            if (progressUpdate.reason) {
                updateData.remarks = progressUpdate.reason;
            }

            if (!task.actualStartDate && progressUpdate.newProgress > 0) {
                updateData.actualStartDate = progressUpdate.updateDate;
            }

            if (progressUpdate.newProgress === 100) {
                updateData.actualEndDate = progressUpdate.updateDate;
            }

            // Clear actualEndDate if reopening task - use empty string instead of undefined
            if (progressUpdate.newProgress < 100 && task.actualEndDate) {
                updateData.actualEndDate = '';
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

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                <span className="ml-2 text-gray-500">กำลังโหลดข้อมูล...</span>
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
                    <p className="text-gray-500 text-sm mt-0.5">จัดการและติดตามความคืบหน้างานทั้งหมด</p>
                </div>

                {['admin', 'project_manager'].includes(user?.role || '') && (
                    <button
                        onClick={openCreateModal}
                        disabled={projects.length === 0}
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50"
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
                            ? 'bg-blue-50 border-blue-200'
                            : 'bg-white border-gray-200 hover:border-gray-300'
                            }`}
                    >
                        <p className="text-gray-500 text-xs font-medium">{stat.label}</p>
                        <p className={`text-xl font-semibold mt-0.5 ${stat.color || 'text-gray-900'}`}>{stat.value}</p>
                    </button>
                ))}
            </div>

            {/* Filters */}
            <div className="bg-white rounded-lg border border-gray-200 p-4 flex flex-col lg:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="ค้นหาชื่องาน..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:border-blue-500"
                    />
                </div>

                <select
                    value={projectFilter}
                    onChange={(e) => setProjectFilter(e.target.value)}
                    className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-blue-500"
                >
                    <option value="all">ทุกโครงการ</option>
                    {projects.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                </select>

                <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-blue-500"
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
                    className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-blue-500"
                >
                    <option value="name">เรียงตามชื่อ</option>
                    <option value="progress">เรียงตาม Progress</option>
                    <option value="cost">เรียงตาม Cost</option>
                </select>
            </div>

            {/* Table */}
            {projects.length === 0 ? (
                <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
                    <ListTodo className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 mb-4">กรุณาสร้างโครงการก่อน</p>
                    <Link
                        href="/projects"
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 inline-block"
                    >
                        ไปหน้าโครงการ
                    </Link>
                </div>
            ) : filteredTasks.length === 0 ? (
                <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
                    <ListTodo className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 mb-4">
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
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ชื่องาน</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">โครงการ</th>
                                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">วันที่ดำเนินการ</th>
                                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Cost</th>
                                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Q'ty</th>
                                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Progress</th>
                                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">สถานะ</th>
                                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredTasks.map((task) => (
                                    <tr key={task.id} className="hover:bg-gray-50 transition-colors group">
                                        <td className="px-4 py-3">
                                            <div className="max-w-[280px]">
                                                <p className="text-sm font-medium text-gray-900 truncate">{task.name}</p>
                                                <p className="text-xs text-gray-400 mt-0.5">{task.category}</p>
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
                                                <span className="text-gray-500">
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
                                            <span className="text-sm font-medium text-gray-600">{task.cost ? task.cost.toLocaleString() : '-'}</span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className="text-sm text-gray-600">{task.quantity || '-'}</span>
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
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {getStatusBadge(task.status)}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center justify-center gap-1">
                                                {/* Update Progress: Admin, PM, Engineer */}
                                                {['admin', 'project_manager', 'engineer'].includes(user?.role || '') && (
                                                    <button
                                                        onClick={() => openProgressModal(task, task.progress)}
                                                        className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors border border-blue-200"
                                                    >
                                                        อัปเดท
                                                    </button>
                                                )}

                                                {/* Edit/Delete: Admin, PM */}
                                                {['admin', 'project_manager'].includes(user?.role || '') && (
                                                    <>
                                                        <button
                                                            onClick={() => openEditModal(task)}
                                                            className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-blue-600"
                                                        >
                                                            <Edit2 className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(task.id)}
                                                            className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-red-600"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t border-gray-200">
                        <p className="text-sm text-gray-500">
                            แสดง {filteredTasks.length} จาก {tasks.length} รายการ
                        </p>
                    </div>
                </div>
            )}

            {/* Create/Edit Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                            <h2 className="text-lg font-semibold text-gray-900">
                                {editingTask ? 'แก้ไขงาน' : 'เพิ่มงานใหม่'}
                            </h2>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="p-1 hover:bg-gray-100 rounded text-gray-400"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">โครงการ *</label>
                                <select
                                    required
                                    value={taskForm.projectId}
                                    onChange={(e) => setTaskForm({ ...taskForm, projectId: e.target.value })}
                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:border-blue-500"
                                >
                                    {projects.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
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
                                    {[...new Set(
                                        tasks
                                            .filter(t => !taskForm.projectId || t.projectId === taskForm.projectId)
                                            .map(t => t.category)
                                    )].map((c, i) => (
                                        <option key={i} value={c} />
                                    ))}
                                </datalist>
                            </div>

                            <div>
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

                            <div className="grid grid-cols-2 gap-4">
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
                            </div>

                            <div className="grid grid-cols-2 gap-4">
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
                            </div>

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

                            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                                >
                                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                                    {editingTask ? 'บันทึก' : 'เพิ่มงาน'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Progress Update Modal */}
            {isProgressModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl w-full max-w-md">
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

                        <div className="p-6 space-y-4">
                            {/* Task Name */}
                            <div className="bg-gray-50 rounded-lg p-3">
                                <p className="text-xs text-gray-500">งาน</p>
                                <p className="text-sm font-medium text-gray-900 mt-0.5">{progressUpdate.taskName}</p>
                            </div>

                            {/* Progress Change */}
                            <div className="flex items-center justify-center gap-4 py-3">
                                <div className="text-center">
                                    <p className="text-2xl font-bold text-gray-400">{progressUpdate.currentProgress}%</p>
                                    <p className="text-xs text-gray-500">ปัจจุบัน</p>
                                </div>
                                <div className="text-2xl text-gray-300">→</div>
                                <div className="text-center">
                                    <p className={`text-2xl font-bold ${progressUpdate.newProgress === 100 ? 'text-green-600' : 'text-blue-600'}`}>
                                        {progressUpdate.newProgress}%
                                    </p>
                                    <p className="text-xs text-gray-500">ใหม่</p>
                                </div>
                            </div>

                            {/* Progress Selection Buttons */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">เลือก Progress</label>
                                <div className="flex items-center justify-center gap-2">
                                    {[0, 25, 50, 75, 100].map((val) => (
                                        <button
                                            key={val}
                                            type="button"
                                            onClick={() => setProgressUpdate({ ...progressUpdate, newProgress: val })}
                                            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${progressUpdate.newProgress === val
                                                ? val === 100
                                                    ? 'bg-green-600 text-white'
                                                    : 'bg-blue-600 text-white'
                                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                                }`}
                                        >
                                            {val}%
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Date */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                    วันที่อัปเดท *
                                </label>
                                <input
                                    type="date"
                                    value={progressUpdate.updateDate}
                                    onChange={(e) => setProgressUpdate({ ...progressUpdate, updateDate: e.target.value })}
                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:border-blue-500"
                                />
                            </div>

                            {/* Reason */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                    เหตุผล / หมายเหตุ
                                </label>
                                <textarea
                                    value={progressUpdate.reason}
                                    onChange={(e) => setProgressUpdate({ ...progressUpdate, reason: e.target.value })}
                                    placeholder="เช่น งานเสร็จตามแผน, ล่าช้าเนื่องจากฝนตก..."
                                    rows={3}
                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:border-blue-500 resize-none"
                                />
                            </div>

                            {/* Buttons */}
                            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                                <button
                                    type="button"
                                    onClick={() => setIsProgressModalOpen(false)}
                                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    onClick={handleProgressSubmit}
                                    disabled={savingProgress || !progressUpdate.updateDate}
                                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                                >
                                    {savingProgress && <Loader2 className="w-4 h-4 animate-spin" />}
                                    บันทึก
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
