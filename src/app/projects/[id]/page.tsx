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
    X
} from 'lucide-react';
import { Project, Task } from '@/types/construction';
import { getProject, updateProject, getTasks, createTask, updateTask, deleteTask, updateTaskProgress } from '@/lib/firestore';

export default function ProjectDetailPage() {
    const params = useParams();
    const router = useRouter();
    const projectId = params.id as string;

    const [project, setProject] = useState<Project | null>(null);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);

    // Task modal
    const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
    const [editingTask, setEditingTask] = useState<Task | null>(null);
    const [saving, setSaving] = useState(false);
    const [taskForm, setTaskForm] = useState({
        category: '',
        name: '',
        description: '',
        weight: 0,
        planStartDate: '',
        planEndDate: '',
        planDuration: 0,
        progress: 0,
        responsible: ''
    });

    // Fetch data
    useEffect(() => {
        if (projectId) {
            fetchData();
        }
    }, [projectId]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [projectData, tasksData] = await Promise.all([
                getProject(projectId),
                getTasks(projectId)
            ]);
            setProject(projectData);
            setTasks(tasksData);
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
        totalWeight: tasks.reduce((sum, t) => sum + (Number(t.weight) || 0), 0),
        weightedProgress: tasks.reduce((sum, t) => sum + ((Number(t.weight) || 0) * (Number(t.progress) || 0) / 100), 0)
    };

    const calculatedProgress = stats.totalWeight > 0
        ? (stats.weightedProgress / stats.totalWeight) * 100
        : 0;

    // Open task modal
    const openCreateTaskModal = () => {
        setEditingTask(null);
        setTaskForm({
            category: '',
            name: '',
            description: '',
            weight: 0,
            planStartDate: project?.startDate || '',
            planEndDate: project?.endDate || '',
            planDuration: 30,
            progress: 0,
            responsible: ''
        });
        setIsTaskModalOpen(true);
    };

    const openEditTaskModal = (task: Task) => {
        setEditingTask(task);
        setTaskForm({
            category: task.category,
            name: task.name,
            description: task.description || '',
            weight: task.weight,
            planStartDate: task.planStartDate,
            planEndDate: task.planEndDate,
            planDuration: task.planDuration,
            progress: task.progress,
            responsible: task.responsible || ''
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
                    weight: taskForm.weight,
                    planStartDate: taskForm.planStartDate,
                    planEndDate: taskForm.planEndDate,
                    planDuration: taskForm.planDuration,
                    progress: taskForm.progress,
                    responsible: taskForm.responsible,
                    status
                });
            } else {
                await createTask({
                    projectId,
                    category: taskForm.category,
                    name: taskForm.name,
                    description: taskForm.description,
                    weight: taskForm.weight,
                    planStartDate: taskForm.planStartDate,
                    planEndDate: taskForm.planEndDate,
                    planDuration: taskForm.planDuration,
                    progress: taskForm.progress,
                    responsible: taskForm.responsible,
                    status,
                    order: tasks.length + 1
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

    // Handle quick progress update
    const handleProgressUpdate = async (taskId: string, progress: number) => {
        try {
            await updateTaskProgress(taskId, progress);
            fetchData();
        } catch (error) {
            console.error('Error updating progress:', error);
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
                <span className="ml-2 text-gray-500">กำลังโหลดข้อมูล...</span>
            </div>
        );
    }

    if (!project) {
        return (
            <div className="text-center py-20">
                <p className="text-gray-500 mb-4">ไม่พบโครงการ</p>
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
                        <p className="text-gray-500 text-sm mt-1">
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
                    <button
                        onClick={openCreateTaskModal}
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                    >
                        <Plus className="w-4 h-4" />
                        เพิ่มงาน
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Target className="w-4 h-4 text-blue-600" />
                        <p className="text-gray-500 text-xs font-medium">Progress</p>
                    </div>
                    <p className="text-2xl font-semibold text-blue-600">{calculatedProgress.toFixed(2)}%</p>
                    <div className="h-1.5 bg-gray-100 rounded-full mt-2 overflow-hidden">
                        <div
                            className="h-full bg-blue-500 rounded-full"
                            style={{ width: `${calculatedProgress}%` }}
                        />
                    </div>
                </div>

                <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <ListTodo className="w-4 h-4 text-gray-600" />
                        <p className="text-gray-500 text-xs font-medium">งานทั้งหมด</p>
                    </div>
                    <p className="text-2xl font-semibold text-gray-900">{stats.totalTasks}</p>
                </div>

                <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                        <p className="text-gray-500 text-xs font-medium">เสร็จสิ้น</p>
                    </div>
                    <p className="text-2xl font-semibold text-green-600">{stats.completedTasks}</p>
                </div>

                <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Clock className="w-4 h-4 text-amber-600" />
                        <p className="text-gray-500 text-xs font-medium">กำลังดำเนินการ</p>
                    </div>
                    <p className="text-2xl font-semibold text-amber-600">{stats.inProgressTasks}</p>
                </div>

                <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <AlertCircle className="w-4 h-4 text-gray-400" />
                        <p className="text-gray-500 text-xs font-medium">ยังไม่เริ่ม</p>
                    </div>
                    <p className="text-2xl font-semibold text-gray-600">{stats.notStartedTasks}</p>
                </div>
            </div>

            {/* Description */}
            {project.description && (
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <h3 className="font-medium text-gray-900 mb-2">รายละเอียดโครงการ</h3>
                    <p className="text-gray-600 text-sm">{project.description}</p>
                </div>
            )}

            {/* Tasks List */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
                    <div>
                        <h2 className="font-semibold text-gray-900">รายการงาน</h2>
                        <p className="text-gray-500 text-sm mt-0.5">น้ำหนักรวม: {stats.totalWeight.toFixed(2)}%</p>
                    </div>
                </div>

                {tasks.length === 0 ? (
                    <div className="p-12 text-center">
                        <ListTodo className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500 mb-4">ยังไม่มีรายการงาน</p>
                        <button
                            onClick={openCreateTaskModal}
                            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            เพิ่มงานแรก
                        </button>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-100">
                        {Object.entries(groupedTasks).map(([category, categoryTasks]) => (
                            <div key={category}>
                                {/* Category Header */}
                                <div className="bg-gray-50 px-5 py-2">
                                    <span className="text-xs font-semibold text-gray-600 uppercase">{category}</span>
                                    <span className="text-xs text-gray-400 ml-2">({categoryTasks.length} งาน)</span>
                                </div>

                                {/* Tasks */}
                                {categoryTasks.map((task) => (
                                    <div
                                        key={task.id}
                                        className="px-5 py-4 hover:bg-gray-50 transition-colors flex items-center gap-4"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className="text-sm font-medium text-gray-900 truncate">{task.name}</p>
                                                <span className={`badge ${getStatusConfig(task.status).class}`}>
                                                    {getStatusConfig(task.status).label}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                                                <span>น้ำหนัก: {task.weight}%</span>
                                                <span>{task.planStartDate} → {task.planEndDate}</span>
                                                {task.responsible && <span>ผู้รับผิดชอบ: {task.responsible}</span>}
                                            </div>
                                        </div>

                                        {/* Progress */}
                                        <div className="w-32">
                                            <div className="flex items-center justify-between text-xs mb-1">
                                                <span className="text-gray-500">Progress</span>
                                                <span className={`font-medium ${task.progress === 100 ? 'text-green-600' : 'text-gray-700'
                                                    }`}>{task.progress}%</span>
                                            </div>
                                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full ${task.progress === 100 ? 'bg-green-500' :
                                                        task.progress >= 50 ? 'bg-blue-500' :
                                                            task.progress > 0 ? 'bg-amber-500' :
                                                                'bg-gray-300'
                                                        }`}
                                                    style={{ width: `${task.progress}%` }}
                                                />
                                            </div>
                                        </div>

                                        {/* Quick Progress Buttons */}
                                        <div className="flex items-center gap-1">
                                            {[0, 25, 50, 75, 100].map((val) => (
                                                <button
                                                    key={val}
                                                    onClick={() => handleProgressUpdate(task.id, val)}
                                                    className={`px-2 py-1 text-xs rounded ${task.progress === val
                                                        ? 'bg-blue-100 text-blue-700'
                                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                                        }`}
                                                >
                                                    {val}%
                                                </button>
                                            ))}
                                        </div>

                                        {/* Actions */}
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => openEditTaskModal(task)}
                                                className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-blue-600"
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteTask(task.id)}
                                                className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-red-600"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Task Modal */}
            {isTaskModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
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

                        <form onSubmit={handleTaskSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">หมวดหมู่ *</label>
                                <input
                                    type="text"
                                    required
                                    value={taskForm.category}
                                    onChange={(e) => setTaskForm({ ...taskForm, category: e.target.value })}
                                    placeholder="เช่น งานเตรียมการ, งานรั้ว Area 1"
                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:border-blue-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">ชื่องาน *</label>
                                <input
                                    type="text"
                                    required
                                    value={taskForm.name}
                                    onChange={(e) => setTaskForm({ ...taskForm, name: e.target.value })}
                                    placeholder="เช่น งานเขียนแบบและตรวจสร้าง"
                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:border-blue-500"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">น้ำหนักงาน (%) *</label>
                                    <input
                                        type="number"
                                        required
                                        min="0"
                                        max="100"
                                        step="0.01"
                                        value={taskForm.weight}
                                        onChange={(e) => setTaskForm({ ...taskForm, weight: parseFloat(e.target.value) || 0 })}
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
                                    value={taskForm.responsible}
                                    onChange={(e) => setTaskForm({ ...taskForm, responsible: e.target.value })}
                                    placeholder="ชื่อผู้รับผิดชอบ"
                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:border-blue-500"
                                />
                            </div>

                            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                                <button
                                    type="button"
                                    onClick={() => setIsTaskModalOpen(false)}
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
        </div>
    );
}
