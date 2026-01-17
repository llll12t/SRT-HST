'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import GanttChart from '@/components/charts/GanttChart';
import { Download, Calendar, Loader2, FolderKanban, Plus, X, Save } from 'lucide-react';
import Link from 'next/link';
import { Project, Task } from '@/types/construction';
import { getProjects, getTasks, updateTask, createTask } from '@/lib/firestore';
import { format, differenceInDays, parseISO, addDays } from 'date-fns';

export default function GanttPage() {
    const searchParams = useSearchParams();
    const projectParam = searchParams.get('project');

    const [projects, setProjects] = useState<Project[]>([]);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedProjectId, setSelectedProjectId] = useState<string>('');

    // Add Task Modal State
    const [showAddTaskModal, setShowAddTaskModal] = useState(false);
    const [saving, setSaving] = useState(false);
    const [importing, setImporting] = useState(false);
    const [newTask, setNewTask] = useState({
        name: '',
        category: '',
        planStartDate: format(new Date(), 'yyyy-MM-dd'),
        duration: '1', // Duration in days
        cost: '',
        quantity: '',
        responsible: ''
    });

    // Calculate end date from start date and duration
    const calculatedEndDate = (() => {
        try {
            const startDate = parseISO(newTask.planStartDate);
            const days = Math.max(1, parseInt(newTask.duration) || 1);
            return addDays(startDate, days - 1);
        } catch {
            return parseISO(newTask.planStartDate);
        }
    })();

    // Display format for UI
    const displayEndDate = format(calculatedEndDate, 'dd/MM/yyyy');
    // Storage format for Firestore
    const storageEndDate = format(calculatedEndDate, 'yyyy-MM-dd');

    // Get unique categories from existing tasks
    const existingCategories = [...new Set(tasks.map(t => t.category))].filter(Boolean);

    useEffect(() => {
        fetchProjects();
    }, []);

    useEffect(() => {
        if (projectParam && projects.length > 0) {
            setSelectedProjectId(projectParam);
        }
    }, [projectParam, projects]);

    // Progress update modal state
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

    const openProgressModal = (taskId: string) => {
        const task = tasks.find(t => t.id === taskId);
        if (task) {
            setProgressUpdate({
                taskId: task.id,
                taskName: task.name,
                currentProgress: task.progress || 0,
                newProgress: task.progress || 0,
                updateDate: task.progressUpdatedAt || new Date().toISOString().split('T')[0],
                reason: ''
            });
            setIsProgressModalOpen(true);
        }
    };

    const handleProgressSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
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

            const updateData: any = {
                progress: actualProgress,
                progressUpdatedAt: progressUpdate.updateDate,
                status: newStatus
            };

            if (progressUpdate.reason) {
                updateData.remarks = progressUpdate.reason;
            }

            // Handle actualStartDate
            if (isStartingWork) {
                updateData.actualStartDate = progressUpdate.updateDate;
            } else if (actualProgress === 0) {
                if (newStatus === 'in-progress') {
                    if (!task.actualStartDate) updateData.actualStartDate = progressUpdate.updateDate;
                } else {
                    updateData.actualStartDate = '';
                }
            } else if (actualProgress > 0) {
                if (!task.actualStartDate) {
                    updateData.actualStartDate = task.planStartDate;
                } else if (progressUpdate.updateDate < task.actualStartDate) {
                    updateData.actualStartDate = progressUpdate.updateDate;
                }
            }

            // Set actualEndDate if completing work
            if (actualProgress === 100) {
                updateData.actualEndDate = progressUpdate.updateDate;
            } else {
                // Clear actualEndDate if not complete
                if (task.actualEndDate) updateData.actualEndDate = '';
            }

            await updateTask(progressUpdate.taskId, updateData);
            setIsProgressModalOpen(false);
            fetchTasks();
        } catch (error) {
            console.error('Error updating progress:', error);
            alert('เกิดข้อผิดพลาดในการอัปเดท');
        } finally {
            setSavingProgress(false);
        }
    };

    useEffect(() => {
        if (selectedProjectId) {
            fetchTasks();
        }
    }, [selectedProjectId]);

    // Handle adding a new task
    const handleAddTask = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedProjectId || !newTask.name || !newTask.category) return;

        setSaving(true);
        try {
            const { createTask } = await import('@/lib/firestore');
            const planDuration = Math.max(1, parseInt(newTask.duration) || 1);
            await createTask({
                projectId: selectedProjectId,
                name: newTask.name,
                category: newTask.category,
                planStartDate: newTask.planStartDate,
                planEndDate: storageEndDate,
                planDuration: planDuration,
                cost: newTask.cost ? parseFloat(newTask.cost) : 0,
                quantity: newTask.quantity || undefined,
                responsible: newTask.responsible || undefined,
                progress: 0,
                status: 'not-started',
                order: tasks.length + 1
            });

            // Reset form and close modal
            setNewTask({
                name: '',
                category: '',
                planStartDate: format(new Date(), 'yyyy-MM-dd'),
                duration: '1',
                cost: '',
                quantity: '',
                responsible: ''
            });
            setShowAddTaskModal(false);

            // Refresh tasks
            fetchTasks();
        } catch (error) {
            console.error('Error creating task:', error);
            alert('เกิดข้อผิดพลาดในการสร้างงาน');
        } finally {
            setSaving(false);
        }
    };

    const fetchProjects = async () => {
        try {
            setLoading(true);
            const projectsData = await getProjects();
            setProjects(projectsData);

            if (projectsData.length > 0 && !projectParam) {
                setSelectedProjectId(projectsData[0].id);
            }
        } catch (error) {
            console.error('Error fetching projects:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchTasks = async () => {
        try {
            if (!selectedProjectId) return;
            const tasksData = await getTasks(selectedProjectId);
            setTasks(tasksData);
        } catch (error) {
            console.error('Error fetching tasks:', error);
        }
    };

    const selectedProject = projects.find(p => p.id === selectedProjectId);

    const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !selectedProjectId) return;

        if (!file.name.toLowerCase().endsWith('.csv')) {
            alert('กรุณาเลือกไฟล์ CSV เท่านั้น');
            e.target.value = '';
            return;
        }

        if (!confirm(`ต้องการนำเข้าข้อมูลงานไปยังโครงการ "${selectedProject?.name}" หรือไม่?`)) {
            e.target.value = '';
            return;
        }

        setImporting(true);
        try {
            const text = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target?.result as string);
                reader.onerror = reject;
                reader.readAsText(file, 'UTF-8');
            });

            const lines = text.split(/\r?\n/).filter(line => line.trim());
            if (lines.length < 2) throw new Error('File is empty');

            const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
            const data = [];

            for (let i = 1; i < lines.length; i++) {
                // Improved CSV parsing to handle commas inside quotes
                const row: string[] = [];
                let inQuotes = false;
                let currentValue = '';
                const line = lines[i];

                for (let j = 0; j < line.length; j++) {
                    const char = line[j];
                    if (char === '"') {
                        inQuotes = !inQuotes;
                    } else if (char === ',' && !inQuotes) {
                        row.push(currentValue.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
                        currentValue = '';
                    } else {
                        currentValue += char;
                    }
                }
                row.push(currentValue.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));

                const rowObj: any = {};
                headers.forEach((h, idx) => rowObj[h] = row[idx] || '');
                data.push(rowObj);
            }

            const { addTask } = await import('@/lib/firestore');
            let count = 0;
            const currentMaxOrder = tasks.length > 0 ? Math.max(...tasks.map(t => t.order || 0)) : 0;

            for (const row of data) {
                const name = row['Task Name'] || row['Task'] || row['Name'] || row['name'];
                if (!name) continue;

                const category = row['Category'] || 'Imported';

                // Parse Dates
                const parseDate = (val: string) => {
                    if (!val || val === '-') return null;
                    const d = new Date(val);
                    return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
                };

                const planStart = parseDate(row['Plan Start'] || row['Start']) || storageEndDate;
                const planEnd = parseDate(row['Plan End'] || row['End']) || storageEndDate;
                const duration = parseInt(row['Duration'] || row['Duration (Days)']) || 1;

                await addTask({
                    projectId: selectedProjectId,
                    name,
                    category,
                    planStartDate: planStart,
                    planEndDate: planEnd,
                    planDuration: duration,
                    cost: parseFloat(row['Cost'] || '0') || 0,
                    quantity: row['Quantity'] || undefined,
                    responsible: row['Responsible'] || undefined,
                    progress: parseFloat(row['Progress'] || row['Progress (%)'] || '0') || 0,
                    status: 'not-started',
                    order: currentMaxOrder + count + 1
                });
                count++;
            }

            alert(`นำเข้าข้อมูลสำเร็จ ${count} รายการ`);
            fetchTasks();

        } catch (error) {
            console.error('Import error:', error);
            alert('เกิดข้อผิดพลาดในการนำเข้าไฟล์');
        } finally {
            setImporting(false);
            e.target.value = '';
        }
    };

    const handleExport = () => {
        if (tasks.length === 0) return;

        const headers = [
            'Category',
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

        const rows = tasks.map(task => {
            return [
                `"${(task.category || '').replace(/"/g, '""')}"`,
                `"${(task.name || '').replace(/"/g, '""')}"`,
                task.planStartDate,
                task.planEndDate,
                task.planDuration || 0,
                task.cost || 0,
                `"${(task.quantity || '').replace(/"/g, '""')}"`,
                `"${(task.responsible || '').replace(/"/g, '""')}"`,
                task.progress || 0,
                task.status || 'not-started',
                task.actualStartDate || '-',
                task.actualEndDate || '-'
            ].join(',');
        });

        // Add BOM for Thai characters in Excel
        const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `gantt_export_${selectedProject?.name || 'project'}_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    // Calculate stats
    const stats = {
        total: tasks.length,
        completed: tasks.filter(t => t.status === 'completed').length,
        inProgress: tasks.filter(t => t.status === 'in-progress').length,
        notStarted: tasks.filter(t => t.status === 'not-started').length
    };

    // Calculate overall progress
    // Calculate overall progress based on Duration
    const totalDuration = tasks.reduce((sum, t) => {
        const d = differenceInDays(parseISO(t.planEndDate), parseISO(t.planStartDate)) + 1;
        return sum + Math.max(0, d);
    }, 0);

    const weightedProgress = tasks.reduce((sum, t) => {
        const d = differenceInDays(parseISO(t.planEndDate), parseISO(t.planStartDate)) + 1;
        const duration = Math.max(0, d);
        return sum + (duration * (Number(t.progress) || 0) / 100);
    }, 0);
    const overallProgress = totalDuration > 0 ? (weightedProgress / totalDuration) * 100 : 0;

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                <span className="ml-2 text-gray-500">กำลังโหลดข้อมูล...</span>
            </div>
        );
    }

    if (projects.length === 0) {
        return (
            <div className="space-y-6">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
                        <Calendar className="w-6 h-6 text-blue-600" />
                        Gantt Chart
                    </h1>
                    <p className="text-gray-500 text-sm mt-0.5">แผนงานและกำหนดการโครงการ</p>
                </div>

                <div className="bg-white rounded border border-gray-300 p-12 text-center shadow-none">
                    <FolderKanban className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 mb-4 text-sm">ไม่พบโครงการ กรุณาสร้างโครงการก่อน</p>
                    <Link
                        href="/projects"
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-sm hover:bg-blue-700 inline-block transition-colors"
                    >
                        ไปหน้าโครงการ
                    </Link>
                </div>
            </div>
        );
    }

    const handleTaskUpdate = async (taskId: string, updates: Partial<Task>) => {
        try {
            // Optimistically update local state for smoothness
            setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updates } : t));

            // Persist to Firestore
            const { updateTask } = await import('@/lib/firestore');
            await updateTask(taskId, updates);

            // Re-fetch to ensure consistency (optional, but good for derived fields)
            fetchTasks();
        } catch (error) {
            console.error('Error updating task:', error);
            // Revert changes on error (basic version: just re-fetch)
            fetchTasks();
        }
    };

    return (
        <div className="space-y-4 font-sans">
            {/* Header with Inline Stats */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                {/* Left: Title */}
                <div className="flex items-center gap-4">
                    <div>
                        <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                            <Calendar className="w-5 h-5 text-gray-600" />
                            Gantt Chart
                        </h1>
                        <p className="text-gray-500 text-xs mt-0.5 font-medium">แผนงานและกำหนดการโครงการ</p>
                    </div>

                    {/* Inline Stats - Compact */}
                    <div className="hidden md:flex items-center gap-1 ml-4">
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 border border-gray-200 rounded-sm">
                            <span className="text-[10px] text-gray-500 font-bold uppercase">Project</span>
                            <span className="text-xs font-bold text-gray-900 max-w-[100px] truncate">{selectedProject?.name}</span>
                        </div>
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 border border-gray-200 rounded-sm">
                            <span className="text-[10px] text-gray-500 font-bold uppercase">Progress</span>
                            <span className="text-xs font-bold text-blue-600 font-mono">{overallProgress.toFixed(1)}%</span>
                            <div className="w-12 h-1 bg-gray-200 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-600 rounded-full" style={{ width: `${overallProgress}%` }} />
                            </div>
                        </div>
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 border border-gray-200 rounded-sm">
                            <span className="text-[10px] text-gray-500 font-bold uppercase">Completed</span>
                            <span className="text-xs font-bold text-green-600 font-mono">{stats.completed}</span>
                        </div>
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 border border-gray-200 rounded-sm">
                            <span className="text-[10px] text-gray-500 font-bold uppercase">In Progress</span>
                            <span className="text-xs font-bold text-amber-600 font-mono">{stats.inProgress}</span>
                        </div>
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 border border-gray-200 rounded-sm">
                            <span className="text-[10px] text-gray-500 font-bold uppercase">Not Started</span>
                            <span className="text-xs font-bold text-gray-400 font-mono">{stats.notStarted}</span>
                        </div>
                    </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2">
                    <select
                        value={selectedProjectId}
                        onChange={(e) => setSelectedProjectId(e.target.value)}
                        className="px-3 py-1.5 bg-white border border-gray-300 rounded-sm text-sm text-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                    >
                        {projects.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </select>

                    <button
                        onClick={() => setShowAddTaskModal(true)}
                        className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-sm flex items-center gap-1.5 hover:bg-blue-700 transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        เพิ่มงาน
                    </button>

                    <label className={`px-3 py-1.5 text-sm font-medium border rounded-sm flex items-center gap-2 transition-colors cursor-pointer ${importing ? 'bg-gray-100 text-gray-400' : 'bg-white border-gray-300 text-blue-600 hover:bg-blue-50'}`}>
                        {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderKanban className="w-4 h-4" />}
                        Import
                        <input type="file" accept=".csv" className="hidden" onChange={handleImportFile} disabled={importing} />
                    </label>

                    <button
                        onClick={handleExport}
                        disabled={tasks.length === 0}
                        className={`px-3 py-1.5 text-sm font-medium border rounded-sm flex items-center gap-2 transition-colors ${tasks.length === 0
                            ? 'bg-gray-100 text-gray-400 border-gray-300 cursor-not-allowed'
                            : 'text-gray-700 bg-white border-gray-300 hover:bg-gray-50'
                            }`}
                    >
                        <Download className="w-4 h-4" />
                        Export CSV
                    </button>
                </div>
            </div>

            {/* Gantt Chart */}
            {selectedProject && (
                <GanttChart
                    tasks={tasks}
                    startDate={selectedProject.startDate}
                    endDate={selectedProject.endDate}
                    title={selectedProject.name}
                    onTaskUpdate={handleTaskUpdate}
                    onOpenProgressModal={openProgressModal}
                />
            )}

            {/* Quick Actions */}
            <div className="flex items-center justify-between bg-white rounded-sm border border-gray-300 p-3 shadow-none">
                <div className="text-xs text-gray-500 font-medium">
                    {tasks.length > 0 ? (
                        <span>
                            Total {tasks.length} Items |
                            Period: {selectedProject?.startDate} → {selectedProject?.endDate}
                        </span>
                    ) : (
                        <span>No tasks available</span>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <Link
                        href={`/projects/${selectedProjectId}`}
                        className="px-3 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded-sm transition-colors"
                    >
                        View Details →
                    </Link>
                </div>
            </div>

            {/* Add Task Modal */}
            {showAddTaskModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-sm border border-gray-300 w-full max-w-lg shadow-none">
                        {/* Modal Header */}
                        {/* Modal Header */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50/50">
                            <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide">เพิ่มงานใหม่</h2>
                            <button
                                onClick={() => setShowAddTaskModal(false)}
                                className="p-1 hover:bg-gray-200 rounded-sm transition-colors text-gray-500"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <form onSubmit={handleAddTask} className="p-4 space-y-4">
                            {/* Category */}
                            <div>
                                <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-wide mb-1">
                                    หมวดหมู่ <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={newTask.category}
                                    onChange={(e) => {
                                        const category = e.target.value;
                                        setNewTask(prev => {
                                            const updates: any = { category };

                                            // Find existing tasks in this category
                                            const categoryTasks = tasks.filter(t => t.category === category);

                                            if (categoryTasks.length > 0) {
                                                // Find the latest planEndDate
                                                let maxEndDate = categoryTasks[0].planEndDate;
                                                categoryTasks.forEach(t => {
                                                    if (t.planEndDate > maxEndDate) maxEndDate = t.planEndDate;
                                                });
                                                updates.planStartDate = maxEndDate;
                                            }

                                            return { ...prev, ...updates };
                                        });
                                    }}
                                    placeholder="เช่น งานโครงสร้าง"
                                    list="category-suggestions"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                                />
                                <datalist id="category-suggestions">
                                    {existingCategories.map(cat => (
                                        <option key={cat} value={cat} />
                                    ))}
                                </datalist>
                            </div>

                            {/* Task Name */}
                            <div>
                                <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-wide mb-1">
                                    ชื่องาน <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={newTask.name}
                                    onChange={(e) => setNewTask(prev => ({ ...prev, name: e.target.value }))}
                                    placeholder="เช่น งานขุดดินฐานราก"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                                />
                            </div>

                            {/* Date Range */}
                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-wide mb-1">
                                        วันเริ่มต้น
                                    </label>
                                    <input
                                        type="date"
                                        value={newTask.planStartDate}
                                        onChange={(e) => setNewTask(prev => ({ ...prev, planStartDate: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-wide mb-1">
                                        จำนวนวัน
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={newTask.duration}
                                        onChange={(e) => setNewTask(prev => ({ ...prev, duration: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none font-mono text-center"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-wide mb-1">
                                        วันสิ้นสุด
                                    </label>
                                    <div className="w-full px-3 py-2 border border-gray-200 bg-gray-50 rounded-sm text-sm text-gray-700 font-mono">
                                        {displayEndDate}
                                    </div>
                                </div>
                            </div>

                            {/* Cost & Quantity */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-wide mb-1">
                                        งบประมาณ (บาท)
                                    </label>
                                    <input
                                        type="number"
                                        value={newTask.cost || ''}
                                        onChange={(e) => setNewTask(prev => ({ ...prev, cost: e.target.value }))}
                                        placeholder="0"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none font-mono"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-wide mb-1">
                                        ปริมาณ
                                    </label>
                                    <input
                                        type="text"
                                        value={newTask.quantity || ''}
                                        onChange={(e) => setNewTask(prev => ({ ...prev, quantity: e.target.value }))}
                                        placeholder="เช่น 20 ตร.ม."
                                        className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                            </div>

                            {/* Responsible */}
                            <div>
                                <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-wide mb-1">
                                    ผู้รับผิดชอบ
                                </label>
                                <input
                                    type="text"
                                    value={newTask.responsible || ''}
                                    onChange={(e) => setNewTask(prev => ({ ...prev, responsible: e.target.value }))}
                                    placeholder="เช่น นายช่าง ก"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                                />
                            </div>

                            {/* Actions */}
                            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                                <button
                                    type="button"
                                    onClick={() => setShowAddTaskModal(false)}
                                    className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-sm transition-colors"
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving || !newTask.name || !newTask.category}
                                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-sm hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {saving ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            กำลังบันทึก...
                                        </>
                                    ) : (
                                        <>
                                            <Save className="w-4 h-4" />
                                            บันทึก
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Progress Update Modal */}
            {isProgressModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-sm w-full max-w-md shadow-none border border-gray-400">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                            <h2 className="text-lg font-semibold text-gray-900">
                                อัปเดทความคืบหน้า
                            </h2>
                            <button
                                onClick={() => setIsProgressModalOpen(false)}
                                className="p-1 hover:bg-gray-100 rounded-sm text-gray-400"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            {/* Task Name */}
                            <div className="bg-gray-50 rounded-sm p-3 border border-gray-200">
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
                                        className={`px-4 py-2 text-sm font-medium rounded-sm transition-colors ${progressUpdate.newProgress === -1
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
                                            className={`px-4 py-2 text-sm font-medium rounded-sm transition-colors ${progressUpdate.newProgress === val
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
                                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-sm text-sm focus:border-black"
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
                                    placeholder="ระบุสาเหตุ (ถ้ามี) เช่น ฝนตกหนัก, รอวัสดุ"
                                    rows={2}
                                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-sm text-sm focus:border-black resize-none"
                                />
                            </div>

                            <div className="flex gap-3 pt-3">
                                <button
                                    type="button"
                                    onClick={() => setIsProgressModalOpen(false)}
                                    className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-sm hover:bg-gray-200"
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleProgressSubmit()}
                                    disabled={savingProgress}
                                    className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-sm hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
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
