'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import GanttChart from '@/components/charts/gantt/GanttChart';
import { Calendar, Loader2, FolderKanban, Plus } from 'lucide-react';
import Link from 'next/link';
import { Project, Task } from '@/types/construction';
import { getProjects, getTasks, updateTask, createTask } from '@/lib/firestore'; // Removed addTask, unused
import { format, differenceInDays, parseISO, addDays } from 'date-fns';
import AddTaskModal from '@/components/gantt/modals/AddTaskModal';
import ProgressUpdateModal from '@/components/gantt/modals/ProgressUpdateModal';

const formatDateTH = (dateStr: string | Date | undefined | null) => {
    if (!dateStr) return '-';
    const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
    if (isNaN(date.getTime())) return '-';
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const yearBE = (date.getFullYear() + 543).toString().slice(-2);
    return `${day}/${month}/${yearBE}`;
};

export default function GanttPage() {
    const searchParams = useSearchParams();
    const projectParam = searchParams.get('project') || searchParams.get('projectId');

    const [projects, setProjects] = useState<Project[]>([]);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedProjectId, setSelectedProjectId] = useState<string>('');
    const [importing, setImporting] = useState(false);

    // Modal States
    const [showAddTaskModal, setShowAddTaskModal] = useState(false);
    const [addTaskInitialData, setAddTaskInitialData] = useState<any>(undefined);

    // Progress Modal State
    const [progressModalTask, setProgressModalTask] = useState<Task | undefined>(undefined);

    // Track updating tasks for loading state
    const [updatingTaskIds, setUpdatingTaskIds] = useState<Set<string>>(new Set());

    // Get unique categories for AddTaskModal
    const existingCategories = [...new Set(tasks.map(t => t.category))].filter(Boolean);

    // Define fetch functions FIRST (useCallback)
    const fetchProjects = useCallback(async () => {
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
    }, [projectParam]);

    const fetchTasks = useCallback(async () => {
        try {
            if (!selectedProjectId) return;
            const tasksData = await getTasks(selectedProjectId);
            setTasks(tasksData);
        } catch (error) {
            console.error('Error fetching tasks:', error);
        }
    }, [selectedProjectId]);

    // THEN use them in useEffect
    useEffect(() => {
        fetchProjects();
    }, [fetchProjects]);

    useEffect(() => {
        if (projectParam && projects.length > 0) {
            setSelectedProjectId(projectParam);
        }
    }, [projectParam, projects]);

    useEffect(() => {
        if (selectedProjectId) {
            fetchTasks();
        }
    }, [selectedProjectId, fetchTasks]);

    // Handlers
    const openProgressModal = (taskId: string) => {
        const task = tasks.find(t => t.id === taskId);
        if (task) {
            setProgressModalTask(task);
        }
    };

    const handleProgressUpdate = async (taskId: string, newProgress: number, updateDate: string, reason: string) => {
        try {
            const task = tasks.find(t => t.id === taskId);
            if (!task) return;

            // Handle "เริ่มงาน" (-1) special case
            const isStartingWork = newProgress === -1;
            const actualProgress = isStartingWork ? 0 : newProgress;

            // Determine status
            let newStatus: Task['status'] = 'not-started';
            if (actualProgress === 100) newStatus = 'completed';
            else if (actualProgress > 0) newStatus = 'in-progress';
            else if (isStartingWork) newStatus = 'in-progress';
            // If 0 and not starting work, default to 'not-started' (Reset)

            const updateData: Partial<Task> = {
                progress: actualProgress,
                progressUpdatedAt: updateDate,
                status: newStatus
            };

            if (reason) {
                updateData.remarks = reason;
            }

            // Handle actualStartDate
            if (isStartingWork) {
                updateData.actualStartDate = updateDate;
            } else if (actualProgress === 0) {
                if (newStatus === 'in-progress') {
                    if (!task.actualStartDate) updateData.actualStartDate = updateDate;
                } else {
                    updateData.actualStartDate = '';
                }
            } else if (actualProgress > 0) {
                if (!task.actualStartDate) {
                    updateData.actualStartDate = task.planStartDate;
                } else if (updateDate < task.actualStartDate) {
                    updateData.actualStartDate = updateDate;
                }
            }

            // Set actualEndDate if completing work
            if (actualProgress === 100) {
                updateData.actualEndDate = updateDate;
            } else {
                // Clear actualEndDate if not complete
                if (task.actualEndDate) updateData.actualEndDate = '';
            }

            await updateTask(taskId, updateData);
            fetchTasks();
        } catch (error) {
            console.error('Error updating progress:', error);
            alert('เกิดข้อผิดพลาดในการอัปเดท');
        }
    };

    const handleAddSubTask = (parentId: string) => {
        const parent = tasks.find(t => t.id === parentId);
        if (parent) {
            // Find sibling tasks (children of the same parent)
            const siblingTasks = tasks.filter(t => t.parentTaskId === parentId && t.type !== 'group');

            let defaultStartDate = format(new Date(), 'yyyy-MM-dd');

            if (siblingTasks.length > 0) {
                // Find the latest end date among siblings
                let maxEndDate = siblingTasks[0].planEndDate;
                siblingTasks.forEach(t => {
                    if (t.planEndDate > maxEndDate) maxEndDate = t.planEndDate;
                });
                // Start the day after the last sibling ends
                try {
                    const nextDay = addDays(parseISO(maxEndDate), 1);
                    defaultStartDate = format(nextDay, 'yyyy-MM-dd');
                } catch (e) {
                    defaultStartDate = maxEndDate;
                }
            } else if (parent.planStartDate) {
                // If no siblings, use parent's start date
                defaultStartDate = parent.planStartDate;
            }

            setAddTaskInitialData({
                parentTaskId: parentId,
                category: parent.category,
                subcategory: parent.subcategory || '',
                subsubcategory: parent.subsubcategory || '',
                type: 'task',
                planStartDate: defaultStartDate
            });
            setShowAddTaskModal(true);
        }
    };

    const handleAddTaskToCategory = (category: string, subcategory?: string, subsubcategory?: string) => {
        setAddTaskInitialData({
            category,
            subcategory,
            subsubcategory,
            type: 'task',
            planStartDate: format(new Date(), 'yyyy-MM-dd')
        });
        setShowAddTaskModal(true);
    };

    const handleAddTask = async (newTaskData: any, autoLink: boolean) => {
        if (!selectedProjectId) return;

        try {
            const planDuration = Math.max(1, parseInt(newTaskData.duration) || 1);

            // Calculate storage end date
            const storageEndDate = (() => {
                try {
                    const start = parseISO(newTaskData.planStartDate);
                    const end = addDays(start, planDuration - 1);
                    return format(end, 'yyyy-MM-dd');
                } catch { return newTaskData.planStartDate; }
            })();

            const currentMaxOrder = tasks.length > 0 ? Math.max(...tasks.map(t => t.order || 0)) : 0;

            // Determine predecessor
            let predecessorId: string | undefined;
            if (autoLink) {
                if (newTaskData.parentTaskId) {
                    // If subtask, link to the last sibling
                    const siblings = tasks.filter(t => t.parentTaskId === newTaskData.parentTaskId);
                    if (siblings.length > 0) {
                        predecessorId = siblings[siblings.length - 1].id;
                    }
                } else {
                    // If root task, link to the absolute last task in the project
                    if (tasks.length > 0) {
                        predecessorId = tasks[tasks.length - 1].id;
                    }
                }
            }

            await createTask({
                projectId: selectedProjectId,
                name: newTaskData.name,
                category: newTaskData.category,
                subcategory: newTaskData.subcategory,
                subsubcategory: newTaskData.subsubcategory,
                type: newTaskData.type,
                planStartDate: newTaskData.planStartDate,
                planEndDate: storageEndDate,
                planDuration: planDuration,
                cost: newTaskData.cost ? parseFloat(newTaskData.cost) : 0,
                quantity: newTaskData.quantity || undefined,
                responsible: newTaskData.responsible || undefined,
                progress: 0,
                status: 'not-started',
                order: currentMaxOrder + 1,
                parentTaskId: newTaskData.parentTaskId || undefined,
                color: newTaskData.color,
                predecessors: predecessorId ? [predecessorId] : undefined
            });

            // Refresh tasks
            fetchTasks();
            setShowAddTaskModal(false);
            setAddTaskInitialData(undefined);
        } catch (error) {
            console.error('Error creating task:', error);
            alert('เกิดข้อผิดพลาดในการสร้างงาน');
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

            // Use robust CSV parser
            const { parseCSV } = await import('@/lib/csv-utils');
            const data = parseCSV(text);

            console.log('📊 CSV Import - Total rows:', data.length);

            if (data.length === 0) throw new Error('File is empty or invalid');

            const { batchCreateTasks, getNewTaskId } = await import('@/lib/firestore');

            const idMap: Record<string, string> = {};
            let activeGroup: { id: string, category: string } | null = null;
            let count = 0;
            const currentMaxOrder = tasks.length > 0 ? Math.max(...tasks.map(t => t.order || 0)) : 0;

            let lastTaskId: string | null = tasks.length > 0 ? tasks[tasks.length - 1].id : null;
            const tasksToCreate: any[] = [];

            // 1. Prepare all task objects first
            for (const row of data) {
                const name = row['Task Name'] || row['Task'] || row['Name'] || row['name'];
                if (!name) continue;

                const category = row['Category'] || 'Imported';
                const subcategory = row['Subcategory'] || row['Sub Category'] || '';
                const subsubcategory = row['SubSubcategory'] || row['Sub Subcategory'] || '';

                const parseDate = (val: string): string | null => {
                    if (!val || val === '-' || val.trim() === '') return null;
                    const cleaned = val.trim();
                    if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned;
                    if (/^\d{2}\/\d{2}\/\d{4}$/.test(cleaned)) {
                        const [day, month, year] = cleaned.split('/');
                        return `${year}-${month}-${day}`;
                    }
                    if (/^\d{2}\/\d{2}\/\d{2}$/.test(cleaned)) {
                        const [day, month, year] = cleaned.split('/');
                        const fullYear = parseInt(year) < 50 ? `20${year}` : `19${year}`;
                        return `${fullYear}-${month}-${day}`;
                    }
                    const d = new Date(cleaned);
                    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
                    return null;
                };

                const duration = parseInt(row['Duration'] || row['Duration (Days)']) || 1;
                let planStart = parseDate(row['Plan Start'] || row['Start']);
                if (!planStart) planStart = format(new Date(), 'yyyy-MM-dd');

                const startDateParams = parseISO(planStart);
                const endDateParams = addDays(startDateParams, duration - 1);
                const planEnd = format(endDateParams, 'yyyy-MM-dd');

                const type = (row['Type']?.toLowerCase() === 'group' ? 'group' : 'task');
                const newTaskId = getNewTaskId();

                let parentId: string | undefined = undefined;

                if (type === 'group') {
                    parentId = undefined;
                    activeGroup = { id: newTaskId, category: category };
                } else {
                    if (activeGroup && activeGroup.category === category) {
                        parentId = activeGroup.id;
                    } else {
                        activeGroup = null;
                    }
                }

                const predecessors = (lastTaskId && type !== 'group') ? [lastTaskId] : undefined;

                const newTask = {
                    id: newTaskId,
                    name,
                    category,
                    subcategory: subcategory || undefined,
                    subsubcategory: subsubcategory || undefined,
                    planStartDate: planStart,
                    planEndDate: planEnd,
                    planDuration: duration,
                    cost: parseFloat(row['Cost'] || '0') || 0,
                    quantity: row['Quantity'] || undefined,
                    responsible: row['Responsible'] || undefined,
                    progress: parseFloat(row['Progress'] || row['Progress (%)'] || '0') || 0,
                    status: 'not-started',
                    order: currentMaxOrder + count + 1,
                    type: type,
                    parentTaskId: parentId,
                    predecessors
                };

                tasksToCreate.push(newTask);
                if (type !== 'group') lastTaskId = newTaskId;
                if (row['ID']) idMap[row['ID']] = newTaskId;
                count++;
            }

            const chunkSize = 450;
            for (let i = 0; i < tasksToCreate.length; i += chunkSize) {
                const chunk = tasksToCreate.slice(i, i + chunkSize);
                await batchCreateTasks(selectedProjectId, chunk);
            }

            alert(`นำเข้าข้อมูลสำเร็จ ${count} รายการ`);
            fetchTasks();

        } catch (error) {
            console.error('Import error:', error);
            alert('เกิดข้อผิดพลาดในการนำเข้าไฟล์: ' + (error instanceof Error ? error.message : 'Unknown error'));
        } finally {
            setImporting(false);
            e.target.value = '';
        }
    };

    const handleExport = () => {
        if (tasks.length === 0) return;

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

        const instructionRow = [
            'หมวดหมู่',
            'หมวดหมู่ย่อย',
            'หมวดหมู่ย่อยระดับ 3',
            'ประเภท (task/group)',
            'ชื่องาน',
            'วันเริ่มต้น',
            'วันสิ้นสุด',
            'ระยะเวลา (วัน)',
            'ค่าใช้จ่าย',
            'จำนวน',
            'ผู้รับผิดชอบ',
            'ความคืบหน้า',
            'สถานะ',
            'วันเริ่มจริง',
            'วันสิ้นสุดจริง'
        ];

        const rows = tasks.map(task => {
            return [
                `"${(task.category || '').replace(/"/g, '""')}"`,
                `"${(task.subcategory || '').replace(/"/g, '""')}"`,
                `"${(task.subsubcategory || '').replace(/"/g, '""')}"`,
                task.type || 'task',
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

        const csvContent = '\uFEFF' + [
            headers.join(','),
            instructionRow.map(cell => `"${cell}"`).join(','),
            ...rows
        ].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `gantt_export_${selectedProject?.name || 'project'}_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const handleTaskUpdate = async (taskId: string, updates: Partial<Task>) => {
        try {
            setUpdatingTaskIds(prev => {
                const newSet = new Set(prev);
                newSet.add(taskId);
                return newSet;
            });

            setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updates } : t));

            const { updateTask } = await import('@/lib/firestore');
            await updateTask(taskId, updates);

            fetchTasks();
        } catch (error) {
            console.error('Error updating task:', error);
            fetchTasks();
        } finally {
            setUpdatingTaskIds(prev => {
                const newSet = new Set(prev);
                newSet.delete(taskId);
                return newSet;
            });
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

    return (
        <div className="space-y-4 font-sans">
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                <div className="flex items-center gap-4">
                    <div>
                        <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                            <Calendar className="w-5 h-5 text-gray-600" />
                            Gantt Chart
                        </h1>
                        <p className="text-gray-500 text-xs mt-0.5 font-medium">แผนงานและกำหนดการโครงการ</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {!projectParam && (
                        <select
                            value={selectedProjectId}
                            onChange={(e) => setSelectedProjectId(e.target.value)}
                            className="px-3 py-1.5 bg-white border border-gray-300 rounded-sm text-sm text-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                        >
                            {projects.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    )}

                    <button
                        onClick={() => {
                            setAddTaskInitialData(undefined);
                            setShowAddTaskModal(true);
                        }}
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
                        Export CSV
                    </button>

                    <Link
                        href={`/projects/${selectedProjectId}`}
                        className="px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-sm flex items-center gap-1.5 hover:bg-blue-100 transition-colors"
                    >
                        View Details →
                    </Link>
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
                    onAddSubTask={handleAddSubTask}
                    onAddTaskToCategory={handleAddTaskToCategory}
                    updatingTaskIds={updatingTaskIds}
                />
            )}

            {/* Modals */}
            <AddTaskModal
                isOpen={showAddTaskModal}
                onClose={() => {
                    setShowAddTaskModal(false);
                    setAddTaskInitialData(undefined);
                }}
                onSave={handleAddTask}
                existingCategories={existingCategories}
                tasks={tasks}
                initialData={addTaskInitialData}
            />

            <ProgressUpdateModal
                isOpen={!!progressModalTask}
                onClose={() => setProgressModalTask(undefined)}
                task={progressModalTask}
                onUpdate={handleProgressUpdate}
            />
        </div>
    );
}
