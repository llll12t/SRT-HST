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
    Info,
    Download,
    FolderKanban,
    GripVertical
} from 'lucide-react';
import { format, parseISO, addDays, differenceInDays } from 'date-fns';
import { Project, Task, Member } from '@/types/construction';
import { getProject, updateProject, getTasks, createTask, updateTask, deleteTask, updateTaskProgress, getMembers } from '@/lib/firestore';
import { useAuth } from '@/contexts/AuthContext';





const formatDateTH = (dateStr: string | undefined | null) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '-';
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const yearBE = (date.getFullYear() + 543).toString().slice(-2);
    return `${day}/${month}/${yearBE}`;
};

export default function ProjectDetailPage() {
    const { user } = useAuth();
    const params = useParams();
    const router = useRouter();
    const projectId = params.id as string;

    const [project, setProject] = useState<Project | null>(null);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [members, setMembers] = useState<Member[]>([]);
    const [loading, setLoading] = useState(true);
    const [importing, setImporting] = useState(false);

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
    const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

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
        const savedColors = localStorage.getItem('gantt_category_colors');
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

    const fetchData = async (silent = false) => {
        try {
            if (!silent) setLoading(true);
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
            if (!silent) setLoading(false);
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

    // Group tasks by category - Moved up for access in handlers
    const groupedTasks = React.useMemo(() => {
        return tasks.reduce((acc, task) => {
            if (!acc[task.category]) {
                acc[task.category] = [];
            }
            acc[task.category].push(task);
            return acc;
        }, {} as Record<string, Task[]>);
    }, [tasks]);

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
                    cost: taskForm.type === 'group' ? 0 : taskForm.cost,
                    quantity: taskForm.type === 'group' ? '' : taskForm.quantity,
                    planStartDate: taskForm.planStartDate,
                    planEndDate: taskForm.planEndDate,
                    planDuration: taskForm.planDuration,
                    progress: taskForm.type === 'group' ? 0 : taskForm.progress,
                    responsible: taskForm.type === 'group' ? '' : taskForm.responsible,
                    actualStartDate: taskForm.type === 'group' ? undefined : (taskForm.actualStartDate || undefined),
                    actualEndDate: taskForm.type === 'group' ? undefined : (taskForm.actualEndDate || undefined),
                    status: taskForm.type === 'group' ? 'not-started' : status,
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
                    cost: taskForm.type === 'group' ? 0 : taskForm.cost,
                    quantity: taskForm.type === 'group' ? '' : taskForm.quantity,
                    planStartDate: taskForm.planStartDate,
                    planEndDate: taskForm.planEndDate,
                    planDuration: taskForm.planDuration,
                    progress: taskForm.type === 'group' ? 0 : taskForm.progress,
                    responsible: taskForm.type === 'group' ? '' : taskForm.responsible,
                    actualStartDate: taskForm.type === 'group' ? undefined : (taskForm.actualStartDate || undefined),
                    actualEndDate: taskForm.type === 'group' ? undefined : (taskForm.actualEndDate || undefined),
                    status: taskForm.type === 'group' ? 'not-started' : status,
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

    // Handle clear all tasks
    const handleClearAllTasks = async () => {
        if (tasks.length === 0) return;
        if (!confirm('คุณแน่ใจหรือไม่ที่จะลบข้อมูลงานทั้งหมดในโครงการนี้? การกระทำนี้ไม่สามารถย้อนกลับได้')) return;

        try {
            setLoading(true);
            // Delete in batches of 20 to avoid overwhelming the connection
            const batchSize = 20;
            for (let i = 0; i < tasks.length; i += batchSize) {
                const batch = tasks.slice(i, i + batchSize);
                await Promise.all(batch.map(t => deleteTask(t.id)));
            }
            await fetchData();
            alert('ลบข้อมูลงานทั้งหมดเรียบร้อยแล้ว');
        } catch (error) {
            console.error('Error clearing tasks:', error);
            alert('เกิดข้อผิดพลาดในการลบข้อมูล');
        } finally {
            setLoading(false);
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

    // Drag and Drop State
    const [dragState, setDragState] = useState<{
        id: string;
        type: 'category' | 'task';
        data?: any;
    } | null>(null);

    const handleDragStart = (e: React.DragEvent, id: string, type: 'category' | 'task', data?: any) => {
        setDragState({ id, type, data });
        e.dataTransfer.effectAllowed = 'move';
        // Create ghost image if needed, or default
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDropCategory = async (e: React.DragEvent, targetCategory: string) => {
        e.preventDefault();
        if (!dragState || dragState.type !== 'category' || dragState.id === targetCategory) return;

        const draggedCategory = dragState.id;

        // Calculate current sorted categories
        const sortedCategories = Object.keys(groupedTasks).sort((a, b) => {
            const minOrderA = Math.min(...groupedTasks[a].map(t => t.order || 0));
            const minOrderB = Math.min(...groupedTasks[b].map(t => t.order || 0));
            return minOrderA - minOrderB;
        });

        const fromIndex = sortedCategories.indexOf(draggedCategory);
        const toIndex = sortedCategories.indexOf(targetCategory);

        if (fromIndex === -1 || toIndex === -1) return;

        // Optimistic Update
        const newOrder = [...sortedCategories];
        newOrder.splice(fromIndex, 1);
        newOrder.splice(toIndex, 0, draggedCategory);

        // We need to re-calculate orders for ALL tasks in the affected categories 
        // to reflect this new block order immediately in UI
        const optimisticTasks = [...tasks];
        let currentOrderCounter = 1;

        // This simulates the new order for UI
        for (const cat of newOrder) {
            const catTasks = optimisticTasks.filter(t => t.category === cat).sort((a, b) => (a.order || 0) - (b.order || 0));
            for (const task of catTasks) {
                task.order = currentOrderCounter++;
            }
        }

        setTasks(optimisticTasks);
        setProcessingIds(prev => new Set(prev).add(draggedCategory));
        setDragState(null);

        // Apply to backend
        try {
            const updates = [];
            currentOrderCounter = 1;

            for (const cat of newOrder) {
                const catTasks = groupedTasks[cat].sort((a, b) => (a.order || 0) - (b.order || 0));
                for (const task of catTasks) {
                    updates.push(updateTask(task.id, { order: currentOrderCounter++ }));
                }
            }

            await Promise.all(updates);
            // Silent refetch to confirm
            fetchData(true);
        } catch (error) {
            console.error('Error reordering categories:', error);
            alert('เกิดข้อผิดพลาดในการจัดลำดับหมวดหมู่');
            fetchData(); // Revert on error
        } finally {
            setProcessingIds(prev => {
                const next = new Set(prev);
                next.delete(draggedCategory);
                return next;
            });
        }
    };

    const handleDropTask = async (e: React.DragEvent, targetTask: Task) => {
        e.preventDefault();
        e.stopPropagation();
        if (!dragState || dragState.type !== 'task' || dragState.id === targetTask.id) return;

        const draggedTask = dragState.data as Task;

        // Validation: Prevent dropping parent into its own descendant
        let current = targetTask;
        while (current.parentTaskId) {
            if (current.parentTaskId === draggedTask.id) return;
            const parent = tasks.find(t => t.id === current.parentTaskId);
            if (!parent) break;
            current = parent;
        }

        const sourceCategory = draggedTask.category;
        const targetCategory = targetTask.category;

        setProcessingIds(prev => new Set(prev).add(draggedTask.id));
        setDragState(null);

        try {
            // Determine Goal: Nesting or Reordering?
            // If dragging a Task onto a Group, we treat it as "Nest into Group"
            // If dragging a Group onto a Group, we treat it as "Reorder Group" (Sibling)
            const draggedType = draggedTask.type || 'task';
            const targetType = targetTask.type || 'task';
            const isNesting = draggedType === 'task' && targetType === 'group';

            let newParentId: string | null;
            let newOrder: number;

            if (isNesting) {
                // NESTING: Become a child of targetTask
                newParentId = targetTask.id;
                // Append to end of children
                const siblings = tasks.filter(t => t.parentTaskId === newParentId);
                const maxOrder = siblings.reduce((max, t) => Math.max(max, t.order || 0), 0);
                newOrder = maxOrder + 1;
            } else {
                // REORDERING: Become a sibling of targetTask
                newParentId = targetTask.parentTaskId || null; // Inherit parent
                // Insert at specific position among siblings
                // We need to fetch all siblings to adjust their orders
                const siblings = tasks
                    .filter(t => t.parentTaskId === newParentId && t.category === targetCategory) // Same parent contest
                    .sort((a, b) => (a.order || 0) - (b.order || 0));

                // Find where target is
                const targetIndex = siblings.findIndex(t => t.id === targetTask.id);
                if (targetIndex === -1) {
                    newOrder = 1; // Fallback
                } else {
                    // Start orders from a clean slate to avoid conflicts, or just shift?
                    // Simple shift strategy:
                    // If moving down: target index
                    // If moving up: target index
                    // Actually, let's just grab the order of target and use that, pushing target down?
                    // We'll trust the backend reorder or do a full reindex of siblings.

                    // Let's do a full reindex for safety
                    // Remove dragged task from siblings list if it was there (same parent)
                    const cleanSiblings = siblings.filter(t => t.id !== draggedTask.id);
                    // Insert dragged task at target index
                    // If we drop ON target, does it go before or after?
                    // Standard: Before. 
                    const insertIndex = cleanSiblings.findIndex(t => t.id === targetTask.id);
                    // If not found (shouldn't happen), append
                    const finalIndex = insertIndex !== -1 ? insertIndex : cleanSiblings.length;

                    // We can't calculate exact order here easily without reindexing everyone.
                    // Let's rely on assigning an order value that puts it there. 
                    // Best way: calc new orders for EVERYONE in this sibling group.

                    cleanSiblings.splice(finalIndex, 0, draggedTask); // Temporarily add to calculate index
                    newOrder = finalIndex + 1; // 1-based index
                }
            }

            // Perform Updates
            // 1. Update the Dragged Task locally (Optimistic)
            setTasks(prev => prev.map(t => {
                if (t.id === draggedTask.id) {
                    return {
                        ...t,
                        category: targetCategory,
                        parentTaskId: newParentId,
                        order: newOrder
                    };
                }
                return t;
            }));

            // 2. Expand the group if we nested into it
            if (isNesting) {
                setCollapsedTasks(prev => {
                    const next = new Set(prev);
                    next.delete(targetTask.id);
                    return next;
                });
            }

            // 3. Backend Updates
            // We need to update:
            // a) The dragged task (parent, category, order)
            // b) Sibling reordering if needed.

            // To keep it simple and robust:
            // Just update the dragged task first.
            await updateTask(draggedTask.id, {
                category: targetCategory,
                parentTaskId: newParentId,
                order: newOrder
            });

            // If it was valid reordering, we technically should re-normalize orders for all siblings 
            // to ensure no gaps or duplicates, but 'order' is float or just sort key? 
            // Code uses int. Let's do a re-normalization for the TARGET sibling group to be clean.

            const finalSiblings = tasks
                .filter(t => t.parentTaskId === newParentId && t.category === targetCategory) // Refresh from state? state is optimistic
                .map(t => t.id === draggedTask.id ? { ...t, order: newOrder, category: targetCategory, parentTaskId: newParentId } : t) // Ensure updated
                .sort((a, b) => {
                    // Sort by order, but force dragged item to its new place if duplicate?
                    // Actually, if we just updated draggedTask order, and didn't touch others, 
                    // a collision (duplicate order) might occur if we just guessed.
                    // The logic above 'newOrder' was loose.

                    // BETTER STRATEGY: Rerank ALL siblings.
                    return (a.order || 0) - (b.order || 0);
                });

            // Re-insertion in sorted array logic
            // Exclude dragged, Re-insert at Target Index, Save All.

            // 1. Get raw siblings ignoring dragged
            const rawSiblings = tasks.filter(t => t.parentTaskId === newParentId && t.category === targetCategory && t.id !== draggedTask.id)
                .sort((a, b) => (a.order || 0) - (b.order || 0));

            // 2. Find insertion point
            let insertIdx = rawSiblings.findIndex(t => t.id === targetTask.id);
            if (isNesting) insertIdx = rawSiblings.length; // Append
            else if (insertIdx === -1) insertIdx = 0; // Fallback

            // 3. Construct new list
            const newList = [...rawSiblings];
            if (!isNesting) newList.splice(insertIdx, 0, draggedTask);
            else newList.push(draggedTask); // Should already be 'draggedTask' with updated fields? No, use the object.

            // 4. Batch Update Orders
            const reorderUpdates = newList.map((t, idx) =>
                updateTask(t.id, {
                    order: idx + 1,
                    category: targetCategory, // ensure cat sync
                    parentTaskId: newParentId // ensure parent sync
                })
            );

            await Promise.all(reorderUpdates);
            fetchData(true);

        } catch (error) {
            console.error('Error reordering tasks:', error);
            alert('จัดลำดับไม่สำเร็จ');
            fetchData();
        } finally {
            setProcessingIds(prev => {
                const next = new Set(prev);
                next.delete(draggedTask.id);
                return next;
            });
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
            localStorage.setItem('gantt_category_colors', JSON.stringify(newColors));
        }

        setActiveColorMenu(null);
    };

    // Handle Import File
    const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !projectId) return;

        if (!file.name.toLowerCase().endsWith('.csv')) {
            alert('กรุณาเลือกไฟล์ CSV เท่านั้น');
            e.target.value = '';
            return;
        }

        if (!confirm(`ต้องการนำเข้าข้อมูลงานไปยังโครงการ "${project?.name}" หรือไม่?`)) {
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

            // Dynamically import addTask to match Gantt logic
            const { addTask } = await import('@/lib/firestore');
            const idMap: Record<string, string> = {}; // Map Old ID -> New ID

            // State for "Simple Mode" inference (Group Context)
            let activeGroup: { id: string, category: string } | null = null;

            let count = 0;
            const currentMaxOrder = tasks.length > 0 ? Math.max(...tasks.map(t => t.order || 0)) : 0;
            let lastTaskId: string | null = tasks.length > 0 ? tasks[tasks.length - 1].id : null;

            for (const row of data) {
                const name = row['Task Name'] || row['Task'] || row['Name'] || row['name'];
                if (!name) continue;

                const category = row['Category'] || 'Imported';

                const parseDate = (val: string) => {
                    if (!val || val === '-') return null;
                    if (val.includes('/')) {
                        const parts = val.split('/');
                        if (parts.length === 3) {
                            const day = parseInt(parts[0], 10);
                            const month = parseInt(parts[1], 10);
                            let year = parseInt(parts[2], 10);
                            if (year < 100) year += 2000;
                            if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
                                return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                            }
                        }
                    }
                    const d = new Date(val);
                    return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
                };

                const duration = parseInt(row['Duration'] || row['Duration (Days)']) || 1;
                let planStart = parseDate(row['Plan Start'] || row['Start']);
                if (!planStart) planStart = format(new Date(), 'yyyy-MM-dd');

                let planEnd = parseDate(row['Plan End'] || row['End']);
                if (!planEnd) {
                    const startDateParams = parseISO(planStart);
                    const endDateParams = addDays(startDateParams, duration - 1);
                    planEnd = format(endDateParams, 'yyyy-MM-dd');
                }

                const type = (row['Type']?.toLowerCase() === 'group' ? 'group' : 'task') as 'task' | 'group';
                let parentId: string | undefined = undefined;

                if (type === 'group') {
                    // Start of a new group
                    // currentGroupId will be set AFTER creation
                    parentId = undefined;
                } else {
                    // It's a task. Should it be nested?
                    // If we are in a "Context" (activeGroup) AND the category matches, nest it.
                    if (activeGroup && activeGroup.category === category) {
                        parentId = activeGroup.id;
                    } else {
                        // Category changed or no active group -> Reset context
                        activeGroup = null;
                    }
                }

                // Fallback: If explicit Parent ID is provided (Advanced Mode), use it
                if (row['Parent ID'] && idMap[row['Parent ID']]) {
                    parentId = idMap[row['Parent ID']];
                }

                const newTaskId: string = await addTask({
                    projectId: projectId,
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
                    order: currentMaxOrder + count + 1,
                    type: type,
                    parentTaskId: parentId,
                    predecessors: (lastTaskId && type !== 'group') ? [lastTaskId] : undefined
                });

                if (type !== 'group') {
                    lastTaskId = newTaskId;
                }
                if (row['ID']) idMap[row['ID']] = newTaskId;

                // Update Context
                if (type === 'group') {
                    activeGroup = { id: newTaskId, category: category };
                }

                count++;
            }

            alert(`นำเข้าข้อมูลสำเร็จ ${count} รายการ`);
            fetchData();
        } catch (error) {
            console.error('Import error:', error);
            alert('เกิดข้อผิดพลาดในการนำเข้าไฟล์');
        } finally {
            setImporting(false);
            e.target.value = '';
        }
    };

    // Handle Export
    const handleExport = () => {
        if (tasks.length === 0) return;

        const headers = [
            'Category', 'Type', 'Task Name', 'Plan Start', 'Plan End', 'Duration (Days)',
            'Cost', 'Quantity', 'Responsible', 'Progress (%)', 'Status',
            'Actual Start', 'Actual End'
        ];

        const rows = tasks.map(task => {
            return [
                `"${(task.category || '').replace(/"/g, '""')}"`,
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

        const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `project_export_${project?.name || 'project'}_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };



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
                            {project.owner} • {formatDateTH(project.startDate)} - {formatDateTH(project.endDate)}
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

                    {/* Import/Export Buttons */}
                    {['admin', 'project_manager'].includes(user?.role || '') && (
                        <>
                            <label className={`px-3 py-2 text-sm font-medium border rounded-lg flex items-center gap-2 transition-colors cursor-pointer ${importing ? 'bg-gray-100 text-gray-400' : 'bg-white border-gray-200 text-blue-600 hover:bg-blue-50'}`}>
                                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderKanban className="w-4 h-4" />}
                                Import
                                <input type="file" accept=".csv" className="hidden" onChange={handleImportFile} disabled={importing} />
                            </label>

                            <button
                                onClick={handleExport}
                                disabled={tasks.length === 0}
                                className={`px-3 py-2 text-sm font-medium border rounded-lg flex items-center gap-2 transition-colors ${tasks.length === 0
                                    ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                                    : 'text-gray-700 bg-white border-gray-200 hover:bg-gray-50'
                                    }`}
                            >
                                <Download className="w-4 h-4" />
                                Export CSV
                            </button>
                        </>
                    )}
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
                    {tasks.length > 0 && ['admin', 'project_manager'].includes(user?.role || '') && (
                        <button
                            onClick={handleClearAllTasks}
                            className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors flex items-center gap-1.5"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                            ล้างข้อมูลทั้งหมด
                        </button>
                    )}
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
                        {Object.keys(groupedTasks).sort((a, b) => {
                            const minOrderA = Math.min(...groupedTasks[a].map(t => t.order || 0));
                            const minOrderB = Math.min(...groupedTasks[b].map(t => t.order || 0));
                            return minOrderA - minOrderB;
                        }).map((category) => {
                            const categoryTasks = groupedTasks[category];

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

                                // Dynamic Group Dates Calculation
                                let displayStartDate = task.planStartDate;
                                let displayEndDate = task.planEndDate;
                                let displayActualStartDate = task.actualStartDate;
                                let displayActualEndDate = task.actualEndDate;
                                let hasLeaves = false;

                                if (isGroup) {
                                    const getDescendants = (pid: string): Task[] => {
                                        const direct = categoryTasks.filter(c => c.parentTaskId === pid);
                                        let all = [...direct];
                                        direct.forEach(d => all.push(...getDescendants(d.id)));
                                        return all;
                                    };
                                    const leaves = getDescendants(task.id).filter(t => t.type !== 'group');
                                    hasLeaves = leaves.length > 0;

                                    if (hasLeaves) {
                                        // Plan Dates
                                        const validStarts = leaves.map(t => t.planStartDate).filter(Boolean).sort();
                                        const validEnds = leaves.map(t => t.planEndDate).filter(Boolean).sort();
                                        if (validStarts.length > 0) displayStartDate = validStarts[0];
                                        if (validEnds.length > 0) displayEndDate = validEnds[validEnds.length - 1];

                                        // Actual Dates (Optional but consistent)
                                        const validActualStarts = leaves.map(t => t.actualStartDate).filter(Boolean).sort();
                                        const validActualEnds = leaves.map(t => t.actualEndDate).filter(Boolean).sort();

                                        if (validActualStarts.length > 0) displayActualStartDate = validActualStarts[0];
                                        // For Actual End, usually strictly max of COMPLETED tasks? 
                                        // But here we'll just take max of whatever is set to match 'Range' concept.
                                        if (validActualEnds.length > 0) displayActualEndDate = validActualEnds[validActualEnds.length - 1];
                                    }
                                }

                                return (
                                    <React.Fragment key={task.id}>
                                        <div
                                            className={`grid grid-cols-12 gap-4 px-5 py-3 hover:bg-gray-50 transition-colors items-center group/row relative
                                            ${isGroup ? 'bg-gray-50/50' : ''} ${processingIds.has(task.id) ? 'bg-blue-50 animate-pulse' : ''}`}
                                            style={{ backgroundColor: task.type === 'group' && task.color ? `${task.color}15` : undefined }}
                                            onDragOver={handleDragOver}
                                            onDrop={(e) => handleDropTask(e, task)}
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
                                                        {!isGroup && (
                                                            <span className={`badge ${getStatusConfig(task.status).class} shrink-0 scale-90`}>
                                                                {getStatusConfig(task.status).label}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {!isGroup && (
                                                        <div className="flex items-center gap-3 text-xs text-gray-500 pl-4">
                                                            {(task.cost ?? 0) > 0 && <span>Cost: {task.cost?.toLocaleString()}</span>}
                                                            {task.quantity && <span>Qty: {task.quantity}</span>}
                                                            {task.responsible && <span className="truncate max-w-[100px]" title={task.responsible}>โดย: {task.responsible}</span>}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Col 2: Dates */}
                                            <div className="col-span-6 lg:col-span-3 text-xs pl-2 lg:border-l border-gray-100 flex flex-col justify-center h-full">
                                                {!isGroup && (
                                                    <div className="flex flex-col gap-1.5">
                                                        <div className="flex items-center gap-2 text-gray-500">
                                                            <span className="w-8 shrink-0 text-[10px] font-bold uppercase tracking-wider text-gray-400 bg-gray-50 px-1 rounded">Plan</span>
                                                            <span className="font-mono text-gray-700">
                                                                {formatDateTH(displayStartDate)} - {formatDateTH(displayEndDate)}
                                                            </span>
                                                        </div>
                                                        {displayActualStartDate && (
                                                            <div className="flex items-center gap-2 text-green-700 font-medium">
                                                                <span className="w-8 shrink-0 text-[10px] font-bold uppercase tracking-wider text-green-600 bg-green-50 px-1 rounded">Real</span>
                                                                <span className="font-mono text-green-700">
                                                                    {formatDateTH(displayActualStartDate)} - {displayActualEndDate ? formatDateTH(displayActualEndDate) : '...'}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Col 3: Progress */}
                                            <div className="col-span-4 lg:col-span-2 px-2 flex flex-col justify-center h-full">
                                                {!isGroup && (
                                                    <>
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
                                                    </>
                                                )}
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

                                                            {/* Drag Handle */}
                                                            <div
                                                                draggable
                                                                onDragStart={(e) => handleDragStart(e, task.id, 'task', task)}
                                                                onDragOver={handleDragOver}
                                                                onDrop={(e) => handleDropTask(e, task)}
                                                                className="p-1.5 cursor-move hover:bg-gray-200 rounded-md text-gray-400 hover:text-blue-600 transition-colors ml-1"
                                                            >
                                                                {processingIds.has(task.id) ? (
                                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                                ) : (
                                                                    <GripVertical className="w-4 h-4" />
                                                                )}
                                                            </div>
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
                                    <div
                                        className={`bg-gray-50/50 px-4 py-3 flex items-center justify-between border-b border-gray-100 backdrop-blur-sm group/category 
                                        ${dragState?.type === 'category' ? 'border-dashed border-2 border-blue-200' : ''}
                                        ${processingIds.has(category) ? 'bg-blue-50 animate-pulse' : ''}`}
                                        onDragOver={handleDragOver}
                                        onDrop={(e) => handleDropCategory(e, category)}
                                    >
                                        <div className="flex items-center gap-3">
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

                                        {/* Category Reorder Handle */}
                                        {['admin', 'project_manager'].includes(user?.role || '') && (
                                            <div
                                                draggable
                                                onDragStart={(e) => handleDragStart(e, category, 'category')}
                                                className="flex items-center gap-1 opacity-0 group-hover/category:opacity-100 transition-opacity cursor-move p-1 text-gray-400 hover:text-blue-600"
                                            >
                                                <GripVertical className="w-4 h-4" />
                                            </div>
                                        )}
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
                                {taskForm.type !== 'group' && (
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
                                )}

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
