'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import GanttChart from '@/components/charts/gantt/GanttChart';
import { Calendar, Loader2, FolderKanban, Plus, TrendingUp, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Project, Task } from '@/types/construction';
import { getProjects, getTasks, updateTask, createTask } from '@/lib/firestore';
import { format, parseISO, addDays, differenceInDays } from 'date-fns';
import AddTaskModal from '@/components/gantt/modals/AddTaskModal';
import ProgressUpdateModal from '@/components/gantt/modals/ProgressUpdateModal';

// This component handles the logic for both the main gantt page and individual project gantt pages
export default function GanttClient({ preSelectedProjectId }: { preSelectedProjectId?: string }) {
    const router = useRouter();
    const searchParams = useSearchParams();

    // Priority: Prop (from dynamic route) > Query Param > Default (empty)
    const paramId = searchParams.get('projectId') || searchParams.get('project');
    const effectiveProjectId = preSelectedProjectId || paramId || '';

    const [projects, setProjects] = useState<Project[]>([]);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedProjectId, setSelectedProjectId] = useState<string>(effectiveProjectId);
    const [importing, setImporting] = useState(false);

    // Modal States
    const [showAddTaskModal, setShowAddTaskModal] = useState(false);
    const [addTaskInitialData, setAddTaskInitialData] = useState<any>(undefined);

    // Progress Modal State
    const [progressModalTask, setProgressModalTask] = useState<Task | undefined>(undefined);

    // Track updating tasks for loading state
    const [updatingTaskIds, setUpdatingTaskIds] = useState<Set<string>>(new Set());

    // Track category order saving
    const [isSavingOrder, setIsSavingOrder] = useState(false);

    // Get unique categories for AddTaskModal
    const existingCategories = [...new Set(tasks.map(t => t.category))].filter(Boolean);

    // Fetch Projects
    const fetchProjects = useCallback(async () => {
        try {
            setLoading(true);
            const projectsData = await getProjects();
            setProjects(projectsData);

            // If we don't have a specific ID yet, default to the first (latest) project
            if (projectsData.length > 0 && !effectiveProjectId) {
                // IMPORTANT: If we are purely client-side without URL param, set state but don't force URL push unless needed
                setSelectedProjectId(projectsData[0].id);
            }
        } catch (error) {
            console.error('Error fetching projects:', error);
        } finally {
            setLoading(false);
        }
    }, [effectiveProjectId]);

    // Fetch Tasks
    const fetchTasks = useCallback(async () => {
        try {
            if (!selectedProjectId) return;
            const tasksData = await getTasks(selectedProjectId);
            setTasks(tasksData);
        } catch (error) {
            console.error('Error fetching tasks:', error);
        }
    }, [selectedProjectId]);

    // Initial Load
    useEffect(() => {
        fetchProjects();
    }, [fetchProjects]);

    // When ID changes (either from props/url or selection), fetch tasks
    useEffect(() => {
        if (selectedProjectId) {
            fetchTasks();
        }
    }, [selectedProjectId, fetchTasks]);

    // Update internal state if upstream prop changes (e.g. navigation)
    useEffect(() => {
        if (effectiveProjectId) {
            setSelectedProjectId(effectiveProjectId);
        }
    }, [effectiveProjectId]);

    const handleProjectChange = (newId: string) => {
        setSelectedProjectId(newId);
        // Navigate to the clean URL for this project
        router.push(`/gantt/${newId}`);
    };

    // --- Handlers from original file ---
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

            const isStartingWork = newProgress === -1;
            const actualProgress = isStartingWork ? 0 : newProgress;

            let newStatus: Task['status'] = 'not-started';
            if (actualProgress === 100) newStatus = 'completed';
            else if (actualProgress > 0) newStatus = 'in-progress';
            else if (isStartingWork) newStatus = 'in-progress';

            const updateData: Partial<Task> = {
                progress: actualProgress,
                progressUpdatedAt: updateDate,
                status: newStatus
            };

            if (reason) updateData.remarks = reason;

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

            if (actualProgress === 100) {
                updateData.actualEndDate = updateDate;
            } else {
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
            const siblingTasks = tasks.filter(t => t.parentTaskId === parentId && t.type !== 'group');
            let defaultStartDate = format(new Date(), 'yyyy-MM-dd');

            if (siblingTasks.length > 0) {
                let maxEndDate = siblingTasks[0].planEndDate;
                siblingTasks.forEach(t => {
                    if (t.planEndDate > maxEndDate) maxEndDate = t.planEndDate;
                });
                try {
                    const nextDay = addDays(parseISO(maxEndDate), 1);
                    defaultStartDate = format(nextDay, 'yyyy-MM-dd');
                } catch (e) {
                    defaultStartDate = maxEndDate;
                }
            } else if (parent.planStartDate) {
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
            const storageEndDate = (() => {
                try {
                    const start = parseISO(newTaskData.planStartDate);
                    const end = addDays(start, planDuration - 1);
                    return format(end, 'yyyy-MM-dd');
                } catch { return newTaskData.planStartDate; }
            })();

            const currentMaxOrder = tasks.length > 0 ? Math.max(...tasks.map(t => t.order || 0)) : 0;
            let predecessorId: string | undefined;
            if (autoLink) {
                if (newTaskData.parentTaskId) {
                    const siblings = tasks.filter(t => t.parentTaskId === newTaskData.parentTaskId);
                    if (siblings.length > 0) predecessorId = siblings[siblings.length - 1].id;
                } else {
                    if (tasks.length > 0) predecessorId = tasks[tasks.length - 1].id;
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

            const { parseCSV } = await import('@/lib/csv-utils');
            const data = parseCSV(text);

            if (data.length === 0) throw new Error('File is empty or invalid');

            const { batchCreateTasks, getNewTaskId } = await import('@/lib/firestore');
            const idMap: Record<string, string> = {};
            let activeGroup: { id: string, category: string } | null = null;
            let count = 0;
            const currentMaxOrder = tasks.length > 0 ? Math.max(...tasks.map(t => t.order || 0)) : 0;
            let lastTaskId: string | null = tasks.length > 0 ? tasks[tasks.length - 1].id : null;
            const tasksToCreate: any[] = [];

            for (const row of data) {
                const name = row['Task Name'] || row['Task'] || row['Name'] || row['name'];
                if (!name) continue;

                // Filter out instruction row if present (Thai headers in data row)
                if (name === 'ชื่องาน' || row['Category'] === 'หมวดหมู่') continue;

                const category = row['Category'] || 'Imported';
                const subcategory = row['Subcategory'] || row['Sub Category'] || '';
                const subsubcategory = row['SubSubcategory'] || row['Sub Subcategory'] || '';

                const parseDate = (val: string): string | null => {
                    if (!val || val === '-' || val.trim() === '') return null;
                    const cleaned = val.trim();
                    if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned;

                    // Support d/m/yyyy or dd/mm/yyyy
                    const dmyMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
                    if (dmyMatch) {
                        const [_, day, month, year] = dmyMatch;
                        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                    }

                    // Support short year
                    if (/^\d{1,2}\/\d{1,2}\/\d{2}$/.test(cleaned)) {
                        const [day, month, year] = cleaned.split('/');
                        const fullYear = parseInt(year) < 50 ? `20${year}` : `19${year}`;
                        return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                    }

                    const d = new Date(cleaned);
                    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
                    return null;
                };

                let planStart = parseDate(row['Plan Start'] || row['Start']);
                if (!planStart) planStart = format(new Date(), 'yyyy-MM-dd');

                let planEnd = parseDate(row['Plan End'] || row['End']);
                const durationInput = parseInt(row['Duration'] || row['Duration (Days)']);

                // Priority: Plan End > Duration
                let duration = 1;
                if (planEnd) {
                    const start = parseISO(planStart);
                    const end = parseISO(planEnd);
                    duration = differenceInDays(end, start) + 1;
                    if (duration < 1) duration = 1;
                } else {
                    duration = durationInput || 1;
                    const startDateParams = parseISO(planStart);
                    const endDateParams = addDays(startDateParams, duration - 1);
                    planEnd = format(endDateParams, 'yyyy-MM-dd');
                }

                // Parse Numbers safely
                const cost = parseFloat((row['Cost'] || '0').toString().replace(/,/g, '')) || 0;
                const progress = parseFloat((row['Progress'] || row['Progress (%)'] || '0').toString().replace(/%/g, '')) || 0;

                // Status Mapping
                let status = 'not-started';
                const statusRaw = (row['Status'] || '').toLowerCase().trim();
                if (statusRaw === 'in-progress' || statusRaw === 'in progress' || statusRaw === 'กำลังดำเนินการ') status = 'in-progress';
                else if (statusRaw === 'completed' || statusRaw === 'เสร็จสิ้น' || statusRaw === 'done') status = 'completed';
                else if (statusRaw === 'delayed' || statusRaw === 'ล่าช้า' || statusRaw === 'on-hold') status = 'delayed'; // Map on-hold/delayed based on type? Types says 'delayed', Project says 'on-hold'. Task has 'delayed'.
                else if (progress === 100) status = 'completed';
                else if (progress > 0) status = 'in-progress';

                // Actual Dates
                const actualStartDate = parseDate(row['Actual Start'] || row['ActualStartDate']);
                const actualEndDate = parseDate(row['Actual End'] || row['ActualEndDate']);
                let actualDuration: number | undefined = undefined;
                if (actualStartDate && actualEndDate) {
                    actualDuration = differenceInDays(parseISO(actualEndDate), parseISO(actualStartDate)) + 1;
                }

                const type = (row['Type']?.toLowerCase() === 'group' ? 'group' : 'task');
                const newTaskId = getNewTaskId();
                let parentId: string | undefined = undefined;

                if (type === 'group') {
                    parentId = undefined;
                    activeGroup = { id: newTaskId, category: category };
                } else {
                    if (activeGroup && activeGroup.category === category) parentId = activeGroup.id;
                    else activeGroup = null;
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
                    cost: cost,
                    quantity: row['Quantity'] || undefined,
                    responsible: row['Responsible'] || undefined,
                    progress: progress,
                    status: status as any,
                    actualStartDate: actualStartDate || undefined,
                    actualEndDate: actualEndDate || undefined,
                    actualDuration: actualDuration,
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
        const headers = ['Category', 'Subcategory', 'SubSubcategory', 'Type', 'Task Name', 'Plan Start', 'Plan End', 'Duration (Days)', 'Cost', 'Quantity', 'Responsible', 'Progress (%)', 'Status', 'Actual Start', 'Actual End'];

        const rows = tasks.map(task => [
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
        ].join(','));

        const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
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
            setUpdatingTaskIds(prev => { const newSet = new Set(prev); newSet.add(taskId); return newSet; });
            setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updates } : t));
            const { updateTask } = await import('@/lib/firestore');
            await updateTask(taskId, updates);
            fetchTasks(); // Optional: Sync fully
        } catch (error) {
            console.error('Error updating task:', error);
            fetchTasks();
        } finally {
            setUpdatingTaskIds(prev => { const newSet = new Set(prev); newSet.delete(taskId); return newSet; });
        }
    };

    const handleCategoryOrderChange = async (newOrder: string[]) => {
        if (!selectedProjectId) return;

        setIsSavingOrder(true);

        // Optimistic update local project state
        setProjects(prev => prev.map(p =>
            p.id === selectedProjectId
                ? { ...p, categoryOrder: newOrder }
                : p
        ));

        try {
            const { updateProject } = await import('@/lib/firestore');
            await updateProject(selectedProjectId, { categoryOrder: newOrder });
        } catch (error) {
            console.error('Failed to update category order', error);
            fetchProjects(); // Revert
            alert('บันทึกการจัดเรียงหมวดหมู่ล้มเหลว');
        } finally {
            setIsSavingOrder(false);
        }
    };

    const handleSubcategoryOrderChange = async (categoryName: string, newOrder: string[]) => {
        if (!selectedProjectId || !selectedProject) return;

        setIsSavingOrder(true);

        // Build updated subcategoryOrder
        const currentSubcategoryOrder = selectedProject.subcategoryOrder || {};
        const updatedSubcategoryOrder = {
            ...currentSubcategoryOrder,
            [categoryName]: newOrder
        };

        // Optimistic update local project state
        setProjects(prev => prev.map(p =>
            p.id === selectedProjectId
                ? { ...p, subcategoryOrder: updatedSubcategoryOrder }
                : p
        ));

        try {
            const { updateProject } = await import('@/lib/firestore');
            await updateProject(selectedProjectId, { subcategoryOrder: updatedSubcategoryOrder });
        } catch (error) {
            console.error('Failed to update subcategory order', error);
            fetchProjects(); // Revert
            alert('บันทึกการจัดเรียงหมวดหมู่ย่อยล้มเหลว');
        } finally {
            setIsSavingOrder(false);
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
                </div>
                <div className="bg-white rounded border border-gray-300 p-12 text-center shadow-none">
                    <FolderKanban className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 mb-4 text-sm">ไม่พบโครงการ กรุณาสร้างโครงการก่อน</p>
                    <Link href="/projects" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-sm hover:bg-blue-700 inline-block transition-colors">ไปหน้าโครงการ</Link>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4 font-sans">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                <div className="flex items-center gap-4">
                    <Link href="/projects" className="p-2 -ml-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors" title="กลับไปหน้ารวมโครงการ">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div>
                        <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                            <Calendar className="w-5 h-5 text-gray-600" />
                            Gantt Chart
                        </h1>
                        <p className="text-gray-500 text-xs mt-0.5 font-medium">แผนงานและกำหนดการโครงการ</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {/* Only show project switcher when project is NOT specified via URL or prop */}
                    {!preSelectedProjectId && !paramId && (
                        <select
                            value={selectedProjectId}
                            onChange={(e) => handleProjectChange(e.target.value)}
                            className="px-3 py-1.5 bg-white border border-gray-300 rounded-sm text-sm text-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                        >
                            {projects.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    )}

                    <button onClick={() => { setAddTaskInitialData(undefined); setShowAddTaskModal(true); }} className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-sm flex items-center gap-1.5 hover:bg-blue-700 transition-colors">
                        <Plus className="w-4 h-4" /> เพิ่มงาน
                    </button>

                    <label className={`px-3 py-1.5 text-sm font-medium border rounded-sm flex items-center gap-2 transition-colors cursor-pointer ${importing ? 'bg-gray-100 text-gray-400' : 'bg-white border-gray-300 text-blue-600 hover:bg-blue-50'}`}>
                        {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderKanban className="w-4 h-4" />}
                        Import <input type="file" accept=".csv" className="hidden" onChange={handleImportFile} disabled={importing} />
                    </label>

                    <button onClick={handleExport} disabled={tasks.length === 0} className={`px-3 py-1.5 text-sm font-medium border rounded-sm flex items-center gap-2 transition-colors ${tasks.length === 0 ? 'bg-gray-100 text-gray-400 border-gray-300 cursor-not-allowed' : 'text-gray-700 bg-white border-gray-300 hover:bg-gray-50'}`}>
                        Export CSV
                    </button>

                    <Link href={`/scurve/${selectedProjectId}`} className="px-3 py-1.5 text-sm font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-sm flex items-center gap-1.5 hover:bg-emerald-100 transition-colors">
                        <TrendingUp className="w-4 h-4" />
                        S-Curve
                    </Link>

                    <Link href={`/projects/${selectedProjectId}`} className="px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-sm flex items-center gap-1.5 hover:bg-blue-100 transition-colors">
                        View Details →
                    </Link>
                </div>
            </div>

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
                    categoryOrder={selectedProject.categoryOrder}
                    onCategoryOrderChange={handleCategoryOrderChange}
                    subcategoryOrder={selectedProject.subcategoryOrder}
                    onSubcategoryOrderChange={handleSubcategoryOrderChange}
                    isSavingOrder={isSavingOrder}
                />
            )}

            <AddTaskModal
                isOpen={showAddTaskModal}
                onClose={() => { setShowAddTaskModal(false); setAddTaskInitialData(undefined); }}
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
