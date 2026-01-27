'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import GanttChart from '@/components/charts/gantt/GanttChart';
import { Download, Calendar, Loader2, FolderKanban, Plus, X, Save } from 'lucide-react';
import Link from 'next/link';
import { Project, Task } from '@/types/construction';
import { getProjects, getTasks, updateTask, createTask, addTask } from '@/lib/firestore';
import { format, differenceInDays, parseISO, addDays } from 'date-fns';

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

    // Add Task Modal State
    const [showAddTaskModal, setShowAddTaskModal] = useState(false);
    const [saving, setSaving] = useState(false);
    const [importing, setImporting] = useState(false);
    const [autoLink, setAutoLink] = useState(true);
    const [newTask, setNewTask] = useState({
        name: '',
        category: '',
        subcategory: '',
        subsubcategory: '',
        type: 'task',
        planStartDate: format(new Date(), 'yyyy-MM-dd'),
        duration: '1', // Duration in days
        cost: '',
        quantity: '',
        responsible: '',
        parentTaskId: '',
        color: '#3b82f6'
    });

    // Calculate end date from start date and duration
    // Calculate end date from start date and duration
    const calculatedEndDate = (() => {
        if (!newTask.planStartDate) return null;
        const startDate = parseISO(newTask.planStartDate);
        if (isNaN(startDate.getTime())) return null;

        try {
            const days = Math.max(1, parseInt(newTask.duration) || 1);
            return addDays(startDate, days - 1);
        } catch {
            return startDate;
        }
    })();

    // Display format for UI
    const displayEndDate = calculatedEndDate ? format(calculatedEndDate, 'dd/MM/yyyy') : '-';
    // Storage format for Firestore
    const storageEndDate = calculatedEndDate ? format(calculatedEndDate, 'yyyy-MM-dd') : '';

    // Get unique categories from existing tasks
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

    // Track updating tasks for loading state
    const [updatingTaskIds, setUpdatingTaskIds] = useState<Set<string>>(new Set());

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
            // If 0 and not starting work, default to 'not-started' (Reset)

            const updateData: Partial<Task> = {
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
    }, [selectedProjectId, fetchTasks]);

    // Handle opening modal for subtask
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

            setNewTask({
                name: '',
                category: parent.category, // Inherit category from parent
                subcategory: parent.subcategory || '', // Inherit subcategory
                subsubcategory: parent.subsubcategory || '', // Inherit subsubcategory if available
                type: 'task', // Default to task (not group)
                planStartDate: defaultStartDate,
                duration: '1',
                cost: '',
                quantity: '',
                responsible: '',
                parentTaskId: parentId, // Set parent to this Group/Task
                color: '#3b82f6'
            });
            setShowAddTaskModal(true);
        }
    };

    // Handle opening modal for category task
    const handleAddTaskToCategory = (category: string, subcategory?: string, subsubcategory?: string) => {
        setNewTask({
            name: '',
            category: category,
            subcategory: subcategory || '',
            subsubcategory: subsubcategory || '',
            type: 'task',
            planStartDate: format(new Date(), 'yyyy-MM-dd'),
            duration: '1',
            cost: '',
            quantity: '',
            responsible: '',
            parentTaskId: '',
            color: '#3b82f6'
        });
        setShowAddTaskModal(true);
    };

    // Handle adding a new task
    const handleAddTask = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedProjectId || !newTask.name || !newTask.category || !newTask.planStartDate) return;

        setSaving(true);
        try {
            const planDuration = Math.max(1, parseInt(newTask.duration) || 1);
            const currentMaxOrder = tasks.length > 0 ? Math.max(...tasks.map(t => t.order || 0)) : 0;

            // Determine predecessor
            let predecessorId: string | undefined;
            if (autoLink) {
                if (newTask.parentTaskId) {
                    // If subtask, link to the last sibling
                    const siblings = tasks.filter(t => t.parentTaskId === newTask.parentTaskId);
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
                name: newTask.name,
                category: newTask.category,
                subcategory: (newTask as any).subcategory,
                subsubcategory: (newTask as any).subsubcategory,
                type: newTask.type as 'task' | 'group',
                planStartDate: newTask.planStartDate,
                planEndDate: storageEndDate,
                planDuration: planDuration,
                cost: newTask.cost ? parseFloat(newTask.cost) : 0,
                quantity: newTask.quantity || undefined,
                responsible: newTask.responsible || undefined,
                progress: 0,
                status: 'not-started',
                order: currentMaxOrder + 1,
                parentTaskId: newTask.parentTaskId || undefined,
                color: newTask.color,
                predecessors: predecessorId ? [predecessorId] : undefined
            });

            // Reset form and close modal
            // Reset form and close modal
            setNewTask({
                name: '',
                category: '',
                subcategory: '',
                subsubcategory: '',
                type: 'task',
                planStartDate: format(new Date(), 'yyyy-MM-dd'),
                duration: '1',
                cost: '',
                quantity: '',
                responsible: '',
                parentTaskId: '',
                color: '#3b82f6'
            });
            setAutoLink(true); // Reset to default
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
            if (data.length > 0) {
                console.log('📋 First row data:', data[0]);
            }

            if (data.length === 0) throw new Error('File is empty or invalid');

            const { batchCreateTasks, getNewTaskId } = await import('@/lib/firestore');

            const idMap: Record<string, string> = {};
            let activeGroup: { id: string, category: string } | null = null;
            let count = 0;
            const currentMaxOrder = tasks.length > 0 ? Math.max(...tasks.map(t => t.order || 0)) : 0;

            // Track the last processed task for auto-linking predecessors
            let lastTaskId: string | null = tasks.length > 0 ? tasks[tasks.length - 1].id : null;

            const tasksToCreate: any[] = [];

            // 1. Prepare all task objects first
            for (const row of data) {
                const name = row['Task Name'] || row['Task'] || row['Name'] || row['name'];
                if (!name) continue;

                const category = row['Category'] || 'Imported';
                const subcategory = row['Subcategory'] || row['Sub Category'] || '';
                const subsubcategory = row['SubSubcategory'] || row['Sub Subcategory'] || '';

                // Helper: Parse date in various formats
                const parseDate = (val: string): string | null => {
                    if (!val || val === '-' || val.trim() === '') return null;

                    const cleaned = val.trim();

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

                    // Try parsing as Date object
                    const d = new Date(cleaned);
                    if (!isNaN(d.getTime())) {
                        return d.toISOString().split('T')[0];
                    }

                    console.warn('⚠️ Unknown date format:', cleaned);
                    return null;
                };

                const duration = parseInt(row['Duration'] || row['Duration (Days)']) || 1;
                let planStart = parseDate(row['Plan Start'] || row['Start']);
                if (!planStart) planStart = format(new Date(), 'yyyy-MM-dd');

                // Always calculate planEnd from Duration if available (User Request)
                const startDateParams = parseISO(planStart);
                const endDateParams = addDays(startDateParams, duration - 1);
                const planEnd = format(endDateParams, 'yyyy-MM-dd');

                // Default type to 'task' as requested ("type will be task all the time")
                // We keep 'group' support only if explicitly stated, but default is strict 'task'
                const type = (row['Type']?.toLowerCase() === 'group' ? 'group' : 'task');

                // Generate new ID for this task
                const newTaskId = getNewTaskId();

                // Determine Parent ID (Simplify: Ignore CSV Parent ID mostly, rely on Category hierarchy or flat list)
                // User said "Import can input only green areas", implying no complex ID mapping.
                // We'll treat them as minimal hierarchy unless explicitly grouped by activeGroup logic (which we can relax or keep for safety).
                // Let's just set parentId to undefined for safety in simplified mode, 
                // UNLESS we want to support the 'legacy' group nesting if 'Type' column exists and is used.
                // Given "green areas only", we assume flat list with Category/Subcat properties driving the view.
                let parentId: string | undefined = undefined;

                if (type === 'group') {
                    parentId = undefined;
                    activeGroup = { id: newTaskId, category: category };
                } else {
                    // If we are in a group block (same category), we CAN link it, but if users just paste flat rows, 
                    // maybe we shouldn't enforce parent linkage unless they asked for it.
                    // Existing logic tries to be smart. Let's keep it harmless: if category matches active group, link it.
                    // But importantly, we STOP checking row['Parent ID'] because we killed that column in export.
                    if (activeGroup && activeGroup.category === category) {
                        parentId = activeGroup.id;
                    } else {
                        activeGroup = null;
                    }
                }

                // Logic for predecessors (auto-link)
                // If it's a task (not group), link to the previous task
                const predecessors = (lastTaskId && type !== 'group') ? [lastTaskId] : undefined;

                const newTask = {
                    id: newTaskId,
                    name,
                    category,
                    subcategory: subcategory || undefined,
                    subsubcategory: subsubcategory || undefined, // Add this line
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

                // Debug first task
                if (count === 0) {
                    console.log('✅ First task to import:', newTask);
                }

                // Update state for next iteration
                if (type !== 'group') {
                    lastTaskId = newTaskId;
                }
                if (row['ID']) idMap[row['ID']] = newTaskId;

                count++;
            }

            console.log(`📦 Total tasks to import: ${tasksToCreate.length}`);

            // 2. Batch create using firestore helper
            // Firestore batch limit is 500, we should chunk if needed
            const chunkSize = 450;
            for (let i = 0; i < tasksToCreate.length; i += chunkSize) {
                const chunk = tasksToCreate.slice(i, i + chunkSize);
                await batchCreateTasks(selectedProjectId, chunk);
                console.log(`✅ Imported batch ${Math.floor(i / chunkSize) + 1}: ${chunk.length} tasks`);
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

        // Add instruction row
        const instructionRow = [
            'หมวดหมู่',
            'หมวดหมู่ย่อย',
            'หมวดหมู่ย่อยระดับ 3',
            'ประเภท (task/group)',
            'ชื่องาน',
            'วันเริ่มต้น (YYYY-MM-DD, DD/MM/YYYY, DD/MM/YY)',
            'วันสิ้นสุด (YYYY-MM-DD, DD/MM/YYYY, DD/MM/YY)',
            'ระยะเวลา (วัน)',
            'ค่าใช้จ่าย (ตัวเลข)',
            'จำนวน',
            'ผู้รับผิดชอบ',
            'ความคืบหน้า (0-100)',
            'สถานะ (not-started, in-progress, completed)',
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

        // Add BOM for Thai characters in Excel
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
            // Set loading state
            setUpdatingTaskIds(prev => {
                const newSet = new Set(prev);
                newSet.add(taskId);
                return newSet;
            });

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
        } finally {
            // Clear loading state
            setUpdatingTaskIds(prev => {
                const newSet = new Set(prev);
                newSet.delete(taskId);
                return newSet;
            });
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


                </div>

                {/* Right: Actions */}
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



            {/* Add Task Modal */}
            {showAddTaskModal && (
                <div className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center p-4">
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
                            {/* Parent Group Indicator */}
                            {newTask.parentTaskId && (
                                <div className="p-2 bg-blue-50 border border-blue-200 rounded-sm flex items-center gap-2">
                                    <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                                        อยู่ภายใต้
                                    </span>
                                    <span className="text-sm font-medium text-blue-800">
                                        {tasks.find(t => t.id === newTask.parentTaskId)?.name || 'Unknown'}
                                    </span>
                                </div>
                            )}


                            {/* Category & Subcategory - Compact Grid */}
                            <div className="grid grid-cols-3 gap-3 p-3 bg-gray-50/50 rounded-sm border border-gray-100">
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">
                                        หมวดหมู่ <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={newTask.category}
                                        onChange={(e) => setNewTask({ ...newTask, category: e.target.value })}
                                        placeholder="งานโครงสร้าง"
                                        list="category-suggestions"
                                        disabled={!!newTask.parentTaskId}
                                        className={`w-full px-2 py-1.5 border border-gray-300 rounded-sm text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none ${newTask.parentTaskId ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`}
                                    />
                                    <datalist id="category-suggestions">
                                        {existingCategories.map(cat => (
                                            <option key={cat} value={cat} />
                                        ))}
                                    </datalist>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">
                                        หมวดหมู่ย่อย
                                    </label>
                                    <input
                                        type="text"
                                        value={newTask.subcategory}
                                        onChange={(e) => setNewTask({ ...newTask, subcategory: e.target.value })}
                                        placeholder="ระบุ (ถ้ามี)"
                                        list="subcategory-suggestions"
                                        disabled={!!newTask.parentTaskId}
                                        className={`w-full px-2 py-1.5 border border-gray-300 rounded-sm text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none ${newTask.parentTaskId ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`}
                                    />
                                    <datalist id="subcategory-suggestions">
                                        {[...new Set(tasks.map(t => t.subcategory).filter(Boolean))].map(sub => (
                                            <option key={sub} value={sub} />
                                        ))}
                                    </datalist>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">
                                        หมวดหมู่ย่อย 2
                                    </label>
                                    <input
                                        type="text"
                                        value={newTask.subsubcategory}
                                        onChange={(e) => setNewTask({ ...newTask, subsubcategory: e.target.value })}
                                        placeholder="ระบุ (ถ้ามี)"
                                        disabled={!!newTask.parentTaskId}
                                        className={`w-full px-2 py-1.5 border border-gray-300 rounded-sm text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none ${newTask.parentTaskId ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`}
                                    />
                                </div>
                            </div>

                            {/* Name */}
                            <div>
                                <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wide mb-1">
                                    ชื่อกิจกรรม / งาน <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={newTask.name}
                                    onChange={(e) => setNewTask(prev => ({ ...prev, name: e.target.value }))}
                                    placeholder="เช่น งานขุดดินฐานราก"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none font-medium"
                                />
                            </div>

                            {/* Date Range */}
                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">
                                        วันเริ่มต้น
                                    </label>
                                    <input
                                        type="date"
                                        value={newTask.planStartDate}
                                        onChange={(e) => setNewTask(prev => ({ ...prev, planStartDate: e.target.value }))}
                                        className="w-full px-2 py-1.5 border border-gray-300 rounded-sm text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">
                                        ระยะเวลา (วัน)
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={newTask.duration}
                                        onChange={(e) => setNewTask(prev => ({ ...prev, duration: e.target.value }))}
                                        className="w-full px-2 py-1.5 border border-gray-300 rounded-sm text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none font-mono text-center font-bold text-blue-600"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">
                                        วันสิ้นสุด
                                    </label>
                                    <div className="w-full px-2 py-1.5 border border-gray-200 bg-gray-50 rounded-sm text-xs text-gray-700 font-mono">
                                        {displayEndDate}
                                    </div>
                                </div>
                            </div>

                            {/* Resources & Cost */}
                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">
                                        งบประมาณ (บาท)
                                    </label>
                                    <input
                                        type="number"
                                        value={newTask.cost || ''}
                                        onChange={(e) => setNewTask(prev => ({ ...prev, cost: e.target.value }))}
                                        placeholder="0"
                                        className="w-full px-2 py-1.5 border border-gray-300 rounded-sm text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none font-mono"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">
                                        ปริมาณ
                                    </label>
                                    <input
                                        type="text"
                                        value={newTask.quantity || ''}
                                        onChange={(e) => setNewTask(prev => ({ ...prev, quantity: e.target.value }))}
                                        placeholder="เช่น 20 ตร.ม."
                                        className="w-full px-2 py-1.5 border border-gray-300 rounded-sm text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">
                                        ผู้รับผิดชอบ
                                    </label>
                                    <input
                                        type="text"
                                        value={newTask.responsible || ''}
                                        onChange={(e) => setNewTask(prev => ({ ...prev, responsible: e.target.value }))}
                                        placeholder="ระบุชื่อ"
                                        className="w-full px-2 py-1.5 border border-gray-300 rounded-sm text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                            </div>

                            {/* Auto Link Checkbox */}
                            <div className="flex items-center gap-2 pt-1">
                                <input
                                    type="checkbox"
                                    id="autoLink"
                                    checked={autoLink}
                                    onChange={(e) => setAutoLink(e.target.checked)}
                                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                />
                                <label htmlFor="autoLink" className="text-xs font-medium text-gray-600 cursor-pointer user-select-none">
                                    เชื่อมต่องานอัตโนมุติ (Auto-connect to previous task)
                                </label>
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
                                    disabled={saving || !newTask.name || !newTask.category || !newTask.planStartDate}
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
            {
                isProgressModalOpen && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200] p-4">
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
                                    <label className="block text-sm font-medium text-gray-700 mb-2">ระบุความคืบหน้า (%)</label>
                                    <div className="flex flex-col gap-3">
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="number"
                                                min="0"
                                                max="100"
                                                value={progressUpdate.newProgress === -1 ? 0 : progressUpdate.newProgress}
                                                onChange={(e) => {
                                                    const val = parseInt(e.target.value);
                                                    if (!isNaN(val)) {
                                                        setProgressUpdate({ ...progressUpdate, newProgress: Math.min(100, Math.max(0, val)) });
                                                    }
                                                }}
                                                className="w-24 px-3 py-2 text-center text-lg font-bold border border-gray-300 rounded-sm focus:border-blue-500 outline-none"
                                            />
                                            <div className="flex-1 flex gap-2 flex-wrap">
                                                {[0, 25, 50, 75, 100].map((val) => (
                                                    <button
                                                        key={val}
                                                        type="button"
                                                        onClick={() => setProgressUpdate({ ...progressUpdate, newProgress: val })}
                                                        className={`px-3 py-1.5 text-xs font-medium rounded-sm border transition-colors ${progressUpdate.newProgress === val
                                                            ? 'bg-blue-600 text-white border-blue-600'
                                                            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                                            }`}
                                                    >
                                                        {val === 0 ? 'Reset' : `${val}%`}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => setProgressUpdate({ ...progressUpdate, newProgress: -1 })}
                                            className={`w-full py-2 text-sm font-medium rounded-sm border border-dashed transition-colors flex items-center justify-center gap-2 ${progressUpdate.newProgress === -1
                                                ? 'bg-amber-50 text-amber-600 border-amber-300'
                                                : 'bg-gray-50 text-gray-500 border-gray-300 hover:bg-gray-100'
                                                }`}
                                        >
                                            🚩 เริ่มงาน (Start Work Only)
                                        </button>
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
                )
            }
        </div >
    );
}
