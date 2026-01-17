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
    ArrowDown
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
        actualEndDate: ''
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
    const [reorderingId, setReorderingId] = useState<string | null>(null);

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
            actualEndDate: ''
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
            actualEndDate: task.actualEndDate || ''
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
                    status
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
                    order: maxOrder + 1
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
                progress: actualProgress,
                progressUpdatedAt: progressUpdate.updateDate,
                status: newStatus
            };

            // Only set remarks if there's a value
            if (progressUpdate.reason) {
                updateData.remarks = progressUpdate.reason;
            }

            // Handle actualStartDate
            if (isStartingWork) {
                // "เริ่มงาน" - set actualStartDate to selected date
                updateData.actualStartDate = progressUpdate.updateDate;
            } else if (actualProgress === 0) {
                // Progress is 0%
                if (newStatus === 'in-progress') {
                    // If keeping in-progress, DON'T clear actualStartDate
                    // If it was missing for some reason, we could possibly start it? 
                    // But safer to just preserve existing or assume established.
                    if (!task.actualStartDate) updateData.actualStartDate = progressUpdate.updateDate;
                } else {
                    // Not in-progress (reset to not-started) - clear actualStartDate
                    updateData.actualStartDate = '';
                }
            } else if (actualProgress > 0) {
                if (!task.actualStartDate) {
                    // First time having progress - use plan start date as default
                    updateData.actualStartDate = task.planStartDate;
                } else if (progressUpdate.updateDate < task.actualStartDate) {
                    // Update date is earlier than current actualStartDate - update it
                    updateData.actualStartDate = progressUpdate.updateDate;
                }
            }

            // Set actualEndDate if completing work
            if (actualProgress === 100) {
                updateData.actualEndDate = progressUpdate.updateDate;
            }

            // Clear actualEndDate if not complete
            if (actualProgress < 100) {
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
                <div className="bg-white rounded-lg border border-gray-200 p-4">
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

                <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <ListTodo className="w-4 h-4 text-gray-600" />
                        <p className="text-gray-600 text-xs font-medium">งานทั้งหมด</p>
                    </div>
                    <p className="text-2xl font-semibold text-gray-900">{stats.totalTasks}</p>
                </div>

                <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                        <p className="text-gray-600 text-xs font-medium">เสร็จสิ้น</p>
                    </div>
                    <p className="text-2xl font-semibold text-green-600">{stats.completedTasks}</p>
                </div>

                <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Clock className="w-4 h-4 text-amber-600" />
                        <p className="text-gray-600 text-xs font-medium">กำลังดำเนินการ</p>
                    </div>
                    <p className="text-2xl font-semibold text-amber-600">{stats.inProgressTasks}</p>
                </div>

                <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <AlertCircle className="w-4 h-4 text-gray-400" />
                        <p className="text-gray-600 text-xs font-medium">ยังไม่เริ่ม</p>
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
                    <div className="divide-y divide-gray-100">
                        {Object.entries(groupedTasks).map(([category, categoryTasks]) => (
                            <div key={category}>
                                {/* Category Header */}
                                <div className="bg-gray-50 px-5 py-2">
                                    <span className="text-xs font-semibold text-gray-600 uppercase">{category}</span>
                                    <span className="text-xs text-gray-500 ml-2">({categoryTasks.length} งาน)</span>
                                </div>

                                {/* Tasks */}
                                {categoryTasks.map((task) => (
                                    <div
                                        key={task.id}
                                        className="grid grid-cols-12 gap-4 px-5 py-4 hover:bg-gray-50 transition-colors items-center"
                                    >
                                        {/* Col 1: Title & Meta */}
                                        <div className="col-span-5 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <p className="text-sm font-medium text-gray-900 truncate" title={task.name}>{task.name}</p>
                                                <span className={`badge ${getStatusConfig(task.status).class} shrink-0`}>
                                                    {getStatusConfig(task.status).label}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-3 text-xs text-gray-500">
                                                {task.cost ? <span>{task.cost.toLocaleString()} ฿</span> : null}
                                                {task.quantity ? <span>Qty: {task.quantity}</span> : null}
                                                {task.responsible && <span className="truncate max-w-[150px]" title={task.responsible}>ดูแลโดย: {task.responsible}</span>}
                                            </div>
                                        </div>

                                        {/* Col 2: Dates */}
                                        <div className="col-span-3 text-xs">
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-2 text-gray-500">
                                                    <span className="w-8 shrink-0">แผน:</span>
                                                    <span>{new Date(task.planStartDate).toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: '2-digit' })} - {new Date(task.planEndDate).toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>
                                                </div>
                                                {task.actualStartDate && (
                                                    <div className="flex items-center gap-2 text-green-600 font-medium">
                                                        <span className="w-8 shrink-0">จริง:</span>
                                                        <span>{new Date(task.actualStartDate).toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: '2-digit' })} - {task.actualEndDate ? new Date(task.actualEndDate).toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '...'}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Col 3: Progress */}
                                        <div className="col-span-2">
                                            <div className="flex items-center justify-between text-xs mb-1">
                                                <span className="text-gray-600">Progress</span>
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
                                            {task.progressUpdatedAt && (
                                                <p className="text-xs text-gray-500 mt-1">
                                                    อัพเดท: {new Date(task.progressUpdatedAt).toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                                                </p>
                                            )}
                                        </div>

                                        {/* Col 4: Actions */}
                                        <div className="col-span-2 flex items-center justify-end gap-2">
                                            {/* Update Button */}
                                            {['admin', 'project_manager', 'engineer'].includes(user?.role || '') && (
                                                <button
                                                    onClick={() => openProgressModal(task, task.progress)}
                                                    className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors border border-blue-200 whitespace-nowrap"
                                                >
                                                    อัปเดท
                                                </button>
                                            )}

                                            {/* Edit/Delete/Reorder */}
                                            {['admin', 'project_manager'].includes(user?.role || '') && (
                                                <>
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

                                                    {/* Reorder Buttons */}
                                                    <div className="flex flex-col ml-1 border-l border-gray-200 pl-1 h-full justify-center min-h-[32px]">
                                                        {reorderingId === task.id ? (
                                                            <div className="p-1">
                                                                <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                                                            </div>
                                                        ) : (
                                                            <>
                                                                <button
                                                                    onClick={() => handleMoveTask(task, 'up', categoryTasks)}
                                                                    className="p-0.5 hover:bg-gray-100 rounded text-gray-400 hover:text-blue-600 disabled:opacity-30"
                                                                    disabled={categoryTasks.indexOf(task) === 0 || reorderingId !== null}
                                                                >
                                                                    <ArrowUp className="w-3 h-3" />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleMoveTask(task, 'down', categoryTasks)}
                                                                    className="p-0.5 hover:bg-gray-100 rounded text-gray-400 hover:text-blue-600 disabled:opacity-30"
                                                                    disabled={categoryTasks.indexOf(task) === categoryTasks.length - 1 || reorderingId !== null}
                                                                >
                                                                    <ArrowDown className="w-3 h-3" />
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </>
                                            )}
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

                            {/* Actual Dates Section */}
                            <div className="pt-4 border-t border-gray-200">
                                <p className="text-sm font-medium text-gray-900 mb-3">วันที่ดำเนินการจริง</p>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">เริ่มงานจริง</label>
                                        <input
                                            type="date"
                                            value={taskForm.actualStartDate}
                                            onChange={(e) => setTaskForm({ ...taskForm, actualStartDate: e.target.value })}
                                            className="w-full px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm focus:bg-white focus:border-green-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">เสร็จงานจริง</label>
                                        <input
                                            type="date"
                                            value={taskForm.actualEndDate}
                                            onChange={(e) => setTaskForm({ ...taskForm, actualEndDate: e.target.value })}
                                            className="w-full px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm focus:bg-white focus:border-green-500"
                                        />
                                    </div>
                                </div>
                                <p className="text-xs text-gray-500 mt-2">สามารถเว้นว่างได้หากยังไม่เริ่ม/เสร็จงาน</p>
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
                                    <p className={`text-2xl font-bold ${progressUpdate.newProgress === 100 ? 'text-green-600' : progressUpdate.newProgress === -1 ? 'text-amber-500' : 'text-blue-600'}`}>
                                        {progressUpdate.newProgress === -1 ? 'เริ่มงาน' : `${progressUpdate.newProgress}%`}
                                    </p>
                                    <p className="text-xs text-gray-500">ใหม่</p>
                                </div>
                            </div>

                            {/* Progress Selection Buttons */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">เลือก Progress</label>
                                <div className="flex items-center justify-center gap-2 flex-wrap">
                                    {/* Start Work Button */}
                                    <button
                                        type="button"
                                        onClick={() => setProgressUpdate({ ...progressUpdate, newProgress: -1 })}
                                        className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${progressUpdate.newProgress === -1
                                            ? 'bg-amber-500 text-white'
                                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                            }`}
                                    >
                                        เริ่มงาน
                                    </button>
                                    {/* Progress Buttons */}
                                    {[25, 50, 75, 100].map((val) => (
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
