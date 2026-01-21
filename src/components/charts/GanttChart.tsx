'use client';

import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Task } from '@/types/construction';
import { format, parseISO, differenceInDays, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval, eachYearOfInterval, startOfMonth, endOfMonth, startOfYear, endOfYear, addMonths, subMonths, isSameDay, isToday, isWeekend, differenceInMonths, isBefore, isAfter, addDays } from 'date-fns';

const formatDateTH = (dateStr: string | Date | undefined | null) => {
    if (!dateStr) return '-';
    // Handle "autoupdate" prefix if passed accidentally, though we shouldn't pass it here
    const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
    if (isNaN(date.getTime())) return '-';
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const yearBE = (date.getFullYear() + 543).toString().slice(-2);
    return `${day}/${month}/${yearBE}`;
};

import { ChevronRight, ChevronDown, Plus, AlertTriangle, X } from 'lucide-react';

import { ViewMode, DragState, RowDragState } from './gantt/types';
import GanttToolbar from './gantt/GanttToolbar';
import TimelineHeader from './gantt/TimelineHeader';
import SCurveOverlay from './gantt/SCurveOverlay';
import { usePdfExport } from '@/hooks/usePdfExport';

interface GanttChartProps {
    tasks: Task[];
    startDate?: string;
    endDate?: string;
    title?: string;
    viewMode?: ViewMode;
    onViewModeChange?: (mode: ViewMode) => void;
    onTaskUpdate?: (taskId: string, updates: Partial<Task>) => Promise<void>;
    onOpenProgressModal?: (taskId: string) => void;
    onAddSubTask?: (parentId: string) => void;
    onAddTaskToCategory?: (category: string) => void;
}

export default function GanttChart({ tasks: propTasks, startDate = '2024-09-01', endDate = '2025-04-30', title, viewMode: controlledViewMode, onViewModeChange, onTaskUpdate, onOpenProgressModal, onAddSubTask, onAddTaskToCategory }: GanttChartProps) {
    // Optimistic State for smooth updates
    const [optimisticTasks, setOptimisticTasks] = useState<Task[]>(propTasks);
    // When props update (and we are NOT dragging/updating), sync.
    // If we ARE updating, we trust our local optimistic state until the update completes.
    useEffect(() => {
        setOptimisticTasks(propTasks);
    }, [propTasks]);

    // Use optimisticTasks for rendering instead of propTasks
    const tasks = optimisticTasks;

    const [internalViewMode, setInternalViewMode] = useState<ViewMode>('day');
    const viewMode = controlledViewMode || internalViewMode;

    const handleViewModeChange = (mode: ViewMode) => {
        if (onViewModeChange) {
            onViewModeChange(mode);
        } else {
            setInternalViewMode(mode);
        }
    };

    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(0);

    // Monitor container width for auto-fit
    useEffect(() => {
        if (!scrollContainerRef.current) return;
        const resizeObserver = new ResizeObserver(entries => {
            for (let entry of entries) {
                if (entry.contentRect.width > 0) setContainerWidth(entry.contentRect.width);
            }
        });
        resizeObserver.observe(scrollContainerRef.current);
        return () => resizeObserver.disconnect();
    }, []);

    // 1. Calculate range based on Project Start/End (Moved up)
    const timeRange = useMemo(() => {
        let pStart = startDate ? parseISO(startDate) : startOfMonth(new Date());
        let pEnd = endDate ? parseISO(endDate) : endOfMonth(addMonths(new Date(), 12));

        if (isNaN(pStart.getTime())) pStart = startOfMonth(new Date());
        if (isNaN(pEnd.getTime())) pEnd = endOfMonth(addMonths(new Date(), 12));

        return {
            start: pStart,
            end: pEnd
        };
    }, [startDate, endDate]);

    // 2. Generate timeline items (Moved up)
    const timeline = useMemo(() => {
        if (viewMode === 'day') {
            const days = eachDayOfInterval({ start: timeRange.start, end: timeRange.end });
            const months = eachMonthOfInterval({ start: timeRange.start, end: timeRange.end });
            return { items: days, groups: months, groupFormat: 'MMMM yyyy', itemFormat: 'd' };
        } else if (viewMode === 'week') {
            const weeks = eachWeekOfInterval({ start: timeRange.start, end: timeRange.end }, { weekStartsOn: 1 });
            const months = eachMonthOfInterval({ start: timeRange.start, end: timeRange.end });
            return { items: weeks, groups: months, groupFormat: 'MMMM yyyy', itemFormat: 'w' };
        } else {
            const months = eachMonthOfInterval({ start: timeRange.start, end: timeRange.end });
            const years = eachYearOfInterval({ start: timeRange.start, end: timeRange.end });
            return { items: months, groups: years, groupFormat: 'yyyy', itemFormat: 'MMM' };
        }
    }, [viewMode, timeRange]);

    // 3. Configuration with Auto-Fit
    const config = useMemo(() => {
        let base;
        switch (viewMode) {
            case 'day': base = { cellWidth: 30, label: 'วัน' }; break;
            case 'week': base = { cellWidth: 40, label: 'สัปดาห์' }; break;
            case 'month': base = { cellWidth: 100, label: 'เดือน' }; break;
            default: base = { cellWidth: 40, label: 'สัปดาห์' };
        }

        // Fit to width if content is smaller than container
        // We use a small threshold to avoid jitter
        if (containerWidth > 0 && timeline.items.length > 0) {
            const totalRequired = timeline.items.length * base.cellWidth;
            if (totalRequired < containerWidth) {
                // Subtract a tiny buffer to prevent scrollbar flicker
                const fitWidth = (containerWidth - 2) / timeline.items.length;
                return { ...base, cellWidth: Math.max(base.cellWidth, fitWidth) };
            }
        }
        return base;
    }, [viewMode, containerWidth, timeline.items.length]);

    const [showDates, setShowDates] = useState(true);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
    const [collapsedTasks, setCollapsedTasks] = useState<Set<string>>(new Set()); // For parent tasks
    const [showDependencies, setShowDependencies] = useState(true);
    // Column Visibility State
    const [visibleColumns, setVisibleColumns] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('gantt_visibleColumns');
            if (saved) {
                try {
                    return JSON.parse(saved);
                } catch (e) { console.error('Error parsing visible columns', e); }
            }
        }
        return {
            cost: true,
            weight: true,
            quantity: true,
            period: true,
            progress: true
        };
    });

    // Save visibleColumns to localStorage
    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('gantt_visibleColumns', JSON.stringify(visibleColumns));
        }
    }, [visibleColumns]);


    // Drag & Drop State for bars
    const [dragState, setDragState] = useState<DragState | null>(null);

    // Row Drag & Drop State for nesting/reordering
    const [rowDragState, setRowDragState] = useState<RowDragState | null>(null);
    const [dropTargetId, setDropTargetId] = useState<string | null>(null);
    const [dropPosition, setDropPosition] = useState<'above' | 'below' | 'child' | null>(null);
    const [isUpdating, setIsUpdating] = useState(false);

    // Reference Date State
    const [customDate, setCustomDate] = useState<Date | null>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('gantt_customDate');
            return saved ? parseISO(saved) : null;
        }
        return null;
    });

    // Save customDate
    useEffect(() => {
        if (typeof window !== 'undefined') {
            if (customDate) localStorage.setItem('gantt_customDate', format(customDate, 'yyyy-MM-dd'));
            else localStorage.removeItem('gantt_customDate');
        }
    }, [customDate]);

    // Modal State
    const [modalConfig, setModalConfig] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        type: 'confirm' | 'alert';
        onConfirm?: () => void;
    }>({ isOpen: false, title: '', message: '', type: 'alert' });
    const [dependencySource, setDependencySource] = useState<{ taskId: string, side: 'start' | 'end' } | null>(null);

    const handleDependencyClick = async (taskId: string, side: 'start' | 'end') => {
        if (!onTaskUpdate) return;

        if (dependencySource) {
            // If clicking the same point, cancel
            if (dependencySource.taskId === taskId && dependencySource.side === side) {
                setDependencySource(null);
                return;
            }

            // If we have a source, and this is a valid target (Finish-to-Start: End -> Start)
            // We only support FS (Finish-to-Start) for now: Source MUST be 'end', Target MUST be 'start'
            if (dependencySource.side === 'end' && side === 'start') {
                const targetId = taskId;
                const sourceId = dependencySource.taskId;

                // Prevent self-dependency
                if (targetId === sourceId) return;

                // Check for circular dependency (simple check)
                // TODO: Recursive check if needed, but for now simple prevention

                const targetTask = tasks.find(t => t.id === targetId);
                if (targetTask) {
                    const currentPreds = targetTask.predecessors || [];
                    if (!currentPreds.includes(sourceId)) {
                        await onTaskUpdate(targetId, {
                            predecessors: [...currentPreds, sourceId]
                        });
                    }
                }
            }
            // Reset
            setDependencySource(null);
        } else {
            // Start linking - only allow starting from 'end' (Right side)
            if (side === 'end') {
                setDependencySource({ taskId, side });
            } else {
                setModalConfig({
                    isOpen: true,
                    title: 'การเชื่อมโยงไม่ถูกต้อง',
                    message: 'กรุณาเริ่มสร้างการเชื่อมโยงจากจุดสิ้นสุด (จุดขวา) ของงาน',
                    type: 'alert'
                });
            }
        }
    };

    // Color Management
    const [categoryColors, setCategoryColors] = useState<Record<string, string>>({});
    const [activeColorMenu, setActiveColorMenu] = useState<{ id: string, type: 'category' | 'group', top: number, left: number } | null>(null);

    // Load category colors from localStorage
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('gantt_category_colors');
            if (saved) {
                try { setCategoryColors(JSON.parse(saved)); } catch (e) { }
            }
        }
    }, []);

    const handleColorChange = (color: string) => {
        if (!activeColorMenu) return;

        if (activeColorMenu.type === 'category') {
            const newColors = { ...categoryColors, [activeColorMenu.id]: color };
            setCategoryColors(newColors);
            localStorage.setItem('gantt_category_colors', JSON.stringify(newColors));
        } else if (activeColorMenu.type === 'group' && onTaskUpdate) {
            onTaskUpdate(activeColorMenu.id, { color });
        }
        setActiveColorMenu(null);
    };

    const COLORS = [
        '#3b82f6', // Blue (Default)
        '#ef4444', // Red
        '#22c55e', // Green
        '#eab308', // Yellow
        '#a855f7', // Purple
        '#ec4899', // Pink
        '#f97316', // Orange
        '#6b7280'  // Gray
    ];

    // Keep latest tasks in ref for access inside event listeners without triggering re-effects
    const tasksRef = useRef(tasks);
    useEffect(() => {
        tasksRef.current = tasks;
    }, [tasks]);

    // Global Mouse Event Listeners for Dragging
    useEffect(() => {
        if (!dragState) return;

        // Prevent text selection during drag
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'grabbing';

        let animationFrameId: number | null = null;

        const handleMouseMove = (e: MouseEvent) => {
            e.preventDefault();

            // Throttle with requestAnimationFrame for smooth updates
            if (animationFrameId) return;

            animationFrameId = requestAnimationFrame(() => {
                animationFrameId = null;

                const deltaX = e.clientX - dragState.startX;
                let daysDelta = 0;

                if (viewMode === 'day') {
                    daysDelta = deltaX / config.cellWidth;
                } else if (viewMode === 'week') {
                    daysDelta = (deltaX / config.cellWidth) * 7;
                } else {
                    daysDelta = (deltaX / config.cellWidth) * 30.44;
                }

                // Round to nearest day (integers only for simplicity)
                daysDelta = Math.round(daysDelta);

                let newStart = dragState.originalStart;
                let newEnd = dragState.originalEnd;

                if (dragState.type === 'move') {
                    newStart = addDays(dragState.originalStart, daysDelta);
                    newEnd = addDays(dragState.originalEnd, daysDelta);
                } else if (dragState.type === 'resize-left') {
                    newStart = addDays(dragState.originalStart, daysDelta);
                    // Prevent start > end
                    if (isAfter(newStart, newEnd)) newStart = newEnd;
                } else if (dragState.type === 'resize-right') {
                    newEnd = addDays(dragState.originalEnd, daysDelta);
                    // Prevent end < start
                    if (isBefore(newEnd, newStart)) newEnd = newStart;
                }

                setDragState(prev => prev ? { ...prev, currentStart: newStart, currentEnd: newEnd } : null);
            });
        };

        const handleMouseUp = async () => {
            // Restore body styles
            document.body.style.userSelect = '';
            document.body.style.cursor = '';

            if (dragState && onTaskUpdate && (dragState.currentStart?.getTime() !== dragState.originalStart.getTime() || dragState.currentEnd?.getTime() !== dragState.originalEnd.getTime())) {
                setIsUpdating(true); // Start loading

                // Keep `dragState` active during the async process? 
                // We need to keep it active for the visual animation (stripes on old positions),
                // but we also need to update the optimistic state.

                try {
                    // Apply changes
                    const formatDate = (d: Date) => format(d, 'yyyy-MM-dd');

                    // Update based on which bar was being dragged
                    if (dragState.barType === 'actual') {
                        const currentStart = dragState.currentStart || dragState.originalStart;
                        const currentEnd = dragState.currentEnd || dragState.originalEnd;

                        // Calculate Progress based on Duration Ratio
                        let newProgress = undefined;
                        const taskToCheck = tasksRef.current.find(t => t.id === dragState.taskId);
                        if (taskToCheck) {
                            const pStart = parseISO(taskToCheck.planStartDate);
                            const pEnd = parseISO(taskToCheck.planEndDate);
                            const planDuration = differenceInDays(pEnd, pStart) + 1;

                            if (planDuration > 0) {
                                const actualDuration = differenceInDays(currentEnd, currentStart) + 1;
                                newProgress = Math.round((actualDuration / planDuration) * 100);
                                // Clamp between 0 and 100
                                newProgress = Math.max(0, Math.min(100, newProgress));
                            }
                        }

                        // Optimistic Update
                        setOptimisticTasks(prev => prev.map(t => {
                            if (t.id === dragState.taskId) {
                                return {
                                    ...t,
                                    actualStartDate: formatDate(currentStart),
                                    actualEndDate: formatDate(currentEnd),
                                    ...(newProgress !== undefined && { progress: newProgress })
                                };
                            }
                            return t;
                        }));

                        await onTaskUpdate(dragState.taskId, {
                            actualStartDate: formatDate(currentStart),
                            actualEndDate: formatDate(currentEnd),
                            ...(newProgress !== undefined && { progress: newProgress })
                        });

                        setIsUpdating(false);
                        setDragState(null);

                    } else {
                        // Update Plan Dates
                        const newPlanStart = formatDate(dragState.currentStart || dragState.originalStart);
                        const newPlanEnd = formatDate(dragState.currentEnd || dragState.originalEnd);

                        // Optimistic Update (Initial Task)
                        setOptimisticTasks(prev => prev.map(t => {
                            if (t.id === dragState.taskId) {
                                return { ...t, planStartDate: newPlanStart, planEndDate: newPlanEnd };
                            }
                            return t;
                        }));

                        // We update the main task first
                        const mainUpdatePromise = onTaskUpdate(dragState.taskId, {
                            planStartDate: newPlanStart,
                            planEndDate: newPlanEnd
                        });

                        // PRE-CALCULATE ALL CASCADING UPDATES (Sync)
                        const updatesToApply: Array<{ id: string, start: string, end: string }> = [];
                        let hasDependencyTableUpdates = false;

                        // 1. Recursive update for Parent-Child hierarchy (Moves only)
                        if (dragState.type === 'move') {
                            const daysDifference = differenceInDays(
                                dragState.currentStart || dragState.originalStart,
                                dragState.originalStart
                            );

                            if (daysDifference !== 0) {
                                const getAllDescendantIds = (parentId: string): string[] => {
                                    const currentTasks = tasksRef.current;
                                    const children = currentTasks.filter(t => t.parentTaskId === parentId);
                                    let descendants: string[] = children.map(c => c.id);
                                    children.forEach(child => {
                                        descendants = [...descendants, ...getAllDescendantIds(child.id)];
                                    });
                                    return descendants;
                                };

                                const descendantIds = getAllDescendantIds(dragState.taskId);
                                const currentTasks = tasksRef.current;
                                const validDescendants = currentTasks.filter(t => descendantIds.includes(t.id));

                                validDescendants.forEach(t => {
                                    const childStart = parseISO(t.planStartDate);
                                    const childEnd = parseISO(t.planEndDate);
                                    updatesToApply.push({
                                        id: t.id,
                                        start: formatDate(addDays(childStart, daysDifference)),
                                        end: formatDate(addDays(childEnd, daysDifference))
                                    });
                                });
                            }
                        }

                        // 2. Cascade update for Dependencies (Moves & Resize Right)
                        let effectiveShift = 0;
                        if (dragState.type === 'move') {
                            effectiveShift = differenceInDays(
                                dragState.currentStart || dragState.originalStart,
                                dragState.originalStart
                            );
                        } else if (dragState.type === 'resize-right') {
                            const newEnd = dragState.currentEnd || dragState.originalEnd;
                            effectiveShift = differenceInDays(newEnd, dragState.originalEnd);
                        }

                        if (effectiveShift !== 0) {
                            const queue: { id: string, shift: number }[] = [{ id: dragState.taskId, shift: effectiveShift }];
                            const processed = new Set<string>();
                            const currentTasks = tasksRef.current; // Snapshot at moment of drop

                            while (queue.length > 0) {
                                const { id: currentId, shift } = queue.shift()!;
                                if (processed.has(currentId)) continue;
                                processed.add(currentId);

                                const successors = currentTasks.filter(t => t.predecessors?.includes(currentId));

                                for (const succ of successors) {
                                    const succStart = parseISO(succ.planStartDate);
                                    const succEnd = parseISO(succ.planEndDate);

                                    const newStart = addDays(succStart, shift);
                                    const newEnd = addDays(succEnd, shift);

                                    // Add to our master update list
                                    updatesToApply.push({
                                        id: succ.id,
                                        start: formatDate(newStart),
                                        end: formatDate(newEnd)
                                    });

                                    hasDependencyTableUpdates = true; // Mark that we have dependency updates (affects UX)

                                    queue.push({ id: succ.id, shift: shift });
                                }
                            }
                        }

                        // APPLY UPDATES
                        if (updatesToApply.length > 0) {
                            // A. Optimistic State Update
                            setOptimisticTasks(prev => prev.map(t => {
                                const update = updatesToApply.find(u => u.id === t.id);
                                if (update) {
                                    return { ...t, planStartDate: update.start, planEndDate: update.end };
                                }
                                return t;
                            }));

                            // B. Visual "Thinking" Effect (Only if dependencies are involved)
                            if (hasDependencyTableUpdates) {
                                setDragState(prev => prev ? ({
                                    ...prev,
                                    affectedTaskIds: new Set(updatesToApply.map(u => u.id))
                                }) : {
                                    isActive: false,
                                    type: 'move',
                                    taskId: dragState.taskId,
                                    originalStart: dragState.originalStart,
                                    originalEnd: dragState.originalEnd, // Placeholder, not used for visuals here
                                    barType: 'plan',
                                    startX: 0,
                                    affectedTaskIds: new Set(updatesToApply.map(u => u.id))
                                });

                                // Wait for animation
                                await new Promise(r => setTimeout(r, 600));
                            }

                            // C. Persist to Backend
                            await Promise.all([
                                mainUpdatePromise,
                                ...updatesToApply.map(u => onTaskUpdate(u.id, {
                                    planStartDate: u.start,
                                    planEndDate: u.end
                                }))
                            ]);
                        } else {
                            // Just wait for main update
                            await mainUpdatePromise;
                        }

                        setIsUpdating(false);
                        setDragState(null);
                    }
                } catch (error) {
                    console.error("Error updating tasks:", error);
                    setIsUpdating(false);
                    setDragState(null);
                }
            } else {
                setDragState(null);
            }
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);

        return () => {
            // Cleanup
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
            }
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [dragState, viewMode, config.cellWidth, onTaskUpdate]);

    const startDrag = (e: React.MouseEvent, task: Task, type: DragState['type'], barType: 'plan' | 'actual' = 'plan') => {
        if (!onTaskUpdate) return; // Read-only if no handler
        e.preventDefault();
        e.stopPropagation();

        let startDate: Date;
        let endDate: Date;

        if (barType === 'actual') {
            // For actual bar, use actual dates or fallback to plan dates
            const hasActualStart = task.actualStartDate && task.actualStartDate.length > 0;
            const hasActualEnd = task.actualEndDate && task.actualEndDate.length > 0;

            if (hasActualStart) {
                startDate = parseISO(task.actualStartDate!);
            } else {
                startDate = parseISO(task.planStartDate);
            }

            if (Number(task.progress) > 0) {
                if (hasActualEnd) {
                    endDate = parseISO(task.actualEndDate!);
                } else {
                    // Calculate based on progress
                    const plannedDuration = differenceInDays(parseISO(task.planEndDate), parseISO(task.planStartDate)) + 1;
                    const progressDays = Math.round(plannedDuration * (Number(task.progress) / 100));
                    endDate = addDays(startDate, Math.max(0, progressDays - 1));
                }
            } else {
                // Progress 0: Always start as 1 day marker
                endDate = startDate;
            }
        } else {
            startDate = parseISO(task.planStartDate);
            endDate = parseISO(task.planEndDate);
        }

        // Pre-calculate descendants for performance optimization during drag
        const affectedTaskIds = new Set<string>();
        if (type === 'move' && barType === 'plan') {
            const getAllDescendantIds = (parentId: string) => {
                const currentTasks = tasksRef.current; // Use ref for latest tasks
                const children = currentTasks.filter(t => t.parentTaskId === parentId);
                children.forEach(child => {
                    affectedTaskIds.add(child.id);
                    getAllDescendantIds(child.id);
                });
            };
            getAllDescendantIds(task.id);
        }

        setDragState({
            taskId: task.id,
            type,
            barType,
            startX: e.clientX,
            originalStart: startDate,
            originalEnd: endDate,
            currentStart: startDate,
            currentEnd: endDate,
            affectedTaskIds
        });
    };

    // Toggle category collapse
    const toggleCategory = (category: string) => {
        setCollapsedCategories(prev => {
            const newSet = new Set(prev);
            if (newSet.has(category)) {
                newSet.delete(category);
            } else {
                newSet.add(category);
            }
            return newSet;
        });
    };




    // Calculate Total Budget & Weight
    const budgetStats = useMemo(() => {
        const totalCost = tasks.reduce((sum, t) => sum + (t.cost || 0), 0);
        const totalDuration = tasks.reduce((sum, t) => {
            const d = differenceInDays(parseISO(t.planEndDate), parseISO(t.planStartDate)) + 1;
            return sum + Math.max(0, d);
        }, 0);

        // Use Cost weighting if available, else Duration
        const useCostWeighting = tasks.some(t => (t.cost || 0) > 0);

        return {
            totalCost,
            totalDuration,
            useCostWeighting,
            totalWeight: useCostWeighting ? totalCost : totalDuration
        };
    }, [tasks]);

    // Calculate weight for a task
    const getTaskWeight = (task: Task): number => {
        if (budgetStats.totalWeight <= 0) return 0;

        if (budgetStats.useCostWeighting) {
            return ((task.cost || 0) / budgetStats.totalWeight) * 100;
        } else {
            const duration = differenceInDays(parseISO(task.planEndDate), parseISO(task.planStartDate)) + 1;
            return (Math.max(0, duration) / budgetStats.totalWeight) * 100;
        }
    };

    // Calculate current progress stats
    const progressStats = useMemo(() => {
        let totalWeight = 0;
        let actualWeighted = 0;
        let planWeighted = 0;
        const today = new Date();

        tasks.forEach(task => {
            const weight = getTaskWeight(task);
            totalWeight += weight;
            actualWeighted += weight * (Number(task.progress) || 0) / 100;

            // Calculate plan up to today
            const tStart = parseISO(task.planStartDate);
            const tEnd = parseISO(task.planEndDate);
            if (isAfter(today, tEnd)) {
                planWeighted += weight;
            } else if (isAfter(today, tStart)) {
                const totalDuration = differenceInDays(tEnd, tStart) + 1;
                const daysPassed = differenceInDays(today, tStart) + 1;
                if (totalDuration > 0) {
                    planWeighted += weight * (daysPassed / totalDuration);
                }
            }
        });

        return {
            totalActual: actualWeighted,
            totalPlan: Math.min(100, planWeighted)
        };
    }, [tasks, budgetStats]);

    // Auto-scroll logic
    useEffect(() => {
        if (scrollContainerRef.current) {
            let offset = 0;
            if (viewMode === 'day') {
                const diff = differenceInDays(currentDate, timeRange.start);
                offset = diff * config.cellWidth;
            } else if (viewMode === 'month') {
                const diff = differenceInMonths(currentDate, timeRange.start);
                offset = diff * config.cellWidth;
            } else {
                const diff = differenceInDays(currentDate, timeRange.start) / 7;
                offset = diff * config.cellWidth;
            }
            scrollContainerRef.current.scrollLeft = Math.max(0, offset - 300);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewMode, timeRange.start, config.cellWidth]);

    const navigate = (direction: 'prev' | 'next') => {
        const amount = viewMode === 'day' ? 1 : viewMode === 'week' ? 3 : 12;
        setCurrentDate(prev => direction === 'prev' ? subMonths(prev, amount) : addMonths(prev, amount));
    };

    const handleExport = () => {
        const headers = ['Category', 'Task Name', 'Cost (Baht)', 'Weight (%)', 'Start Date', 'End Date', 'Duration (Days)', 'Progress (%)'];
        const rows = tasks.map(task => {
            const duration = differenceInDays(parseISO(task.planEndDate), parseISO(task.planStartDate)) + 1;
            const weight = getTaskWeight(task);
            return [
                `"${task.category}"`,
                `"${task.name}"`,
                task.cost || 0,
                weight.toFixed(2),
                task.planStartDate,
                task.planEndDate,
                duration,
                task.progress || 0
            ].join(',');
        });

        const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `gantt_export_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    // PDF Export using custom hook
    const { containerRef: chartContainerRef, exportToPdf: handleExportPDF } = usePdfExport({
        title,
        pageSize: 'A3',
        orientation: 'landscape'
    });

    // Group tasks with parent-child hierarchy
    const groupedTasks = useMemo(() => {
        const groups: Record<string, Task[]> = {};

        // Get all ROOT tasks (no parent - null or undefined) first
        const rootTasks = tasks.filter(t => !t.parentTaskId || t.parentTaskId === null);

        rootTasks.forEach(task => {
            if (!groups[task.category]) groups[task.category] = [];
            groups[task.category].push(task);
        });

        return groups;
    }, [tasks]);

    // Get child tasks for a parent
    const getChildTasks = (parentId: string) => {
        return tasks.filter(t => t.parentTaskId === parentId).sort((a, b) => a.order - b.order);
    };

    // Check if task has children
    const hasChildren = (taskId: string) => {
        return tasks.some(t => t.parentTaskId === taskId);
    };

    // Get all descendant tasks recursively for a Group
    const getAllDescendants = (taskId: string): Task[] => {
        // Ensure strictly string comparison to avoid ID mismatch issues
        const children = tasks.filter(t => t.parentTaskId && String(t.parentTaskId) === String(taskId));
        let descendants: Task[] = [];
        children.forEach(child => {
            if (child.type === 'group') {
                // Recursively get descendants of nested groups
                descendants = [...descendants, ...getAllDescendants(child.id)];
            } else {
                descendants.push(child);
            }
        });
        return descendants;
    };

    // Calculate Group summary (dates and progress from children)
    const getGroupSummary = (groupTask: Task) => {
        const descendants = getAllDescendants(groupTask.id);
        const leafTasks = descendants.filter(t => t.type !== 'group'); // Only count actual tasks

        // Track Min/Max Dates
        let minDate: Date | null = null;
        let maxDate: Date | null = null;
        let minActualDate: Date | null = null;
        let maxActualDate: Date | null = null;

        let totalCost = 0;
        let weightedProgress = 0;
        let totalWeight = 0;

        // If no leaves, return empty stats so group doesn't show confusing dates
        if (leafTasks.length === 0) {
            return {
                count: 0,
                minStartDate: '', // Clear dates if no children
                maxEndDate: '',
                minActualDate: null,
                maxActualDate: null,
                progress: 0,
                totalCost: 0
            };
        }

        leafTasks.forEach(task => {
            // Plan Dates
            if (task.planStartDate) {
                const d = parseISO(task.planStartDate);
                if (!minDate || isBefore(d, minDate)) minDate = d;
            }
            if (task.planEndDate) {
                const d = parseISO(task.planEndDate);
                if (!maxDate || isAfter(d, maxDate)) maxDate = d;
            }

            // Actual Dates
            if (task.actualStartDate) {
                const d = parseISO(task.actualStartDate);
                if (!minActualDate || isBefore(d, minActualDate)) minActualDate = d;

                // Effective Actual End Date Logic
                let effectiveEnd = d;
                if (task.actualEndDate) {
                    effectiveEnd = parseISO(task.actualEndDate);
                } else if ((task.progress || 0) > 0) {
                    // Calculate estimated end based on progress
                    const pStart = parseISO(task.planStartDate);
                    const pEnd = parseISO(task.planEndDate);
                    const plannedDuration = differenceInDays(pEnd, pStart) + 1;
                    const progressDays = Math.round(plannedDuration * (Number(task.progress) / 100));
                    effectiveEnd = addDays(d, Math.max(0, progressDays - 1));
                }

                if (!maxActualDate || isAfter(effectiveEnd, maxActualDate)) maxActualDate = effectiveEnd;
            }

            totalCost += task.cost || 0;
            // Use cost as weight for progress calculation
            const taskWeight = task.cost || 1;
            weightedProgress += (task.progress || 0) * taskWeight;
            totalWeight += taskWeight;
        });

        return {
            count: leafTasks.length,
            minStartDate: minDate ? format(minDate, 'yyyy-MM-dd') : groupTask.planStartDate,
            maxEndDate: maxDate ? format(maxDate, 'yyyy-MM-dd') : groupTask.planEndDate,
            minActualDate: minActualDate ? format(minActualDate, 'yyyy-MM-dd') : null,
            maxActualDate: maxActualDate ? format(maxActualDate, 'yyyy-MM-dd') : null,
            progress: totalWeight > 0 ? Math.round(weightedProgress / totalWeight) : 0,
            totalCost
        };
    };

    // Toggle collapsed state for parent tasks
    const toggleTaskCollapse = (taskId: string) => {
        setCollapsedTasks(prev => {
            const newSet = new Set(prev);
            if (newSet.has(taskId)) {
                newSet.delete(taskId);
            } else {
                newSet.add(taskId);
            }
            return newSet;
        });
    };

    // Row drag handlers for nesting
    const handleRowDragStart = (e: React.DragEvent, task: Task) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', task.id);
        setRowDragState({ taskId: task.id, taskName: task.name });
    };

    const handleRowDragOver = (e: React.DragEvent, targetTaskId: string) => {
        e.preventDefault();
        if (!rowDragState || rowDragState.taskId === targetTaskId) return;

        // Get mouse position relative to the row to determine drop position
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const relativeY = e.clientY - rect.top;
        const rowHeight = rect.height;

        // Determine position logic:
        // If target is a GROUP:
        // - Top 25%: Above
        // - Bottom 25%: Below
        // - Middle 50%: Child (Nest)
        // If target is TASK:
        // - Top 50%: Above
        // - Bottom 50%: Below

        let position: 'above' | 'below' | 'child';

        const targetTask = tasks.find(t => t.id === targetTaskId);
        const isTargetGroup = targetTask?.type === 'group';

        if (isTargetGroup) {
            if (relativeY < rowHeight * 0.25) position = 'above';
            else if (relativeY > rowHeight * 0.75) position = 'below';
            else position = 'child';
        } else {
            if (relativeY < rowHeight * 0.5) position = 'above';
            else position = 'below';
        }

        setDropTargetId(targetTaskId);
        setDropPosition(position);
    };

    const handleRowDragLeave = () => {
        setDropTargetId(null);
        setDropPosition(null);
    };

    const handleRowDrop = async (e: React.DragEvent, targetTaskId: string) => {
        e.preventDefault();
        if (!rowDragState || !onTaskUpdate || !dropPosition) return;

        const draggedTaskId = rowDragState.taskId;
        const draggedTask = tasks.find(t => t.id === draggedTaskId);
        const targetTask = tasks.find(t => t.id === targetTaskId);

        // Don't allow dropping onto itself
        if (draggedTaskId === targetTaskId || !draggedTask || !targetTask) {
            setRowDragState(null);
            setDropTargetId(null);
            setDropPosition(null);
            return;
        }

        // Check for circular reference
        const isDescendant = (parentId: string, childId: string): boolean => {
            const children = getChildTasks(parentId);
            if (children.some(c => c.id === childId)) return true;
            return children.some(c => isDescendant(c.id, childId));
        };

        if (dropPosition === 'child') {
            // Nesting into Group
            const maxOrder = Math.max(0, ...tasks
                .filter(t => t.parentTaskId === targetTaskId)
                .map(t => t.order || 0));

            await onTaskUpdate(draggedTaskId, {
                parentTaskId: targetTaskId,
                category: targetTask.category, // Adopt parent's category
                order: maxOrder + 1
            });

            // Expand the group
            setCollapsedTasks(prev => {
                const newSet = new Set(prev);
                newSet.delete(targetTaskId);
                return newSet;
            });

        } else {
            // Reorder - above or below target
            // Get all sibling tasks with same parent
            const siblingTasks = tasks
                .filter(t => t.parentTaskId === targetTask.parentTaskId && t.category === targetTask.category)
                .sort((a, b) => a.order - b.order);

            const targetIndex = siblingTasks.findIndex(t => t.id === targetTaskId);
            let newOrder: number;

            if (dropPosition === 'above') {
                // Insert above target
                if (targetIndex === 0) {
                    newOrder = targetTask.order - 1;
                } else {
                    const prevTask = siblingTasks[targetIndex - 1];
                    newOrder = (prevTask.order + targetTask.order) / 2;
                }
            } else {
                // Insert below target
                if (targetIndex === siblingTasks.length - 1) {
                    newOrder = targetTask.order + 1;
                } else {
                    const nextTask = siblingTasks[targetIndex + 1];
                    newOrder = (targetTask.order + nextTask.order) / 2;
                }
            }

            // Update with new order and same parent as target
            await onTaskUpdate(draggedTaskId, {
                order: newOrder,
                parentTaskId: targetTask.parentTaskId || null,
                category: targetTask.category
            });
        }

        setRowDragState(null);
        setDropTargetId(null);
        setDropPosition(null);
    };

    const handleRowDragEnd = () => {
        setRowDragState(null);
        setDropTargetId(null);
        setDropPosition(null);
    };

    // Remove from parent (make root task)
    const handleRemoveFromParent = async (taskId: string) => {
        if (!onTaskUpdate) return;
        await onTaskUpdate(taskId, { parentTaskId: null });
    };

    // Calculate category summary
    const getCategorySummary = (catTasks: Task[], category: string) => {
        // Get ALL tasks in this category (including children) for accurate date range
        const allCategoryTasks = tasks.filter(t => t.category === category);

        const totalCost = allCategoryTasks.reduce((sum, t) => sum + (t.cost || 0), 0);
        const totalWeight = allCategoryTasks.reduce((sum, t) => sum + getTaskWeight(t), 0);
        const avgProgress = allCategoryTasks.length > 0
            ? allCategoryTasks.reduce((sum, t) => sum + Number(t.progress || 0), 0) / allCategoryTasks.length
            : 0;

        // Calculate date range for category using ALL tasks
        let minDate: Date | null = null;
        let maxDate: Date | null = null;

        allCategoryTasks.filter(t => t.type !== 'group').forEach(t => {
            const start = parseISO(t.planStartDate);
            const end = parseISO(t.planEndDate);
            if (!minDate || isBefore(start, minDate)) minDate = start;
            if (!maxDate || isAfter(end, maxDate)) maxDate = end;
        });

        const dateRange = minDate && maxDate ? {
            start: minDate,
            end: maxDate,
            days: differenceInDays(maxDate, minDate) + 1
        } : null;

        return { totalCost, totalWeight, avgProgress, count: allCategoryTasks.length, dateRange };
    };

    // Get bar style for category summary (pixel-based like task bars)
    const getCategoryBarStyle = (dateRange: { start: Date; end: Date; days: number }) => {
        const chartStart = timeRange.start;

        const startOffsetDays = differenceInDays(dateRange.start, chartStart);
        const durationDays = dateRange.days;

        let leftPx = 0, widthPx = 0;

        if (viewMode === 'day') {
            leftPx = startOffsetDays * config.cellWidth;
            widthPx = durationDays * config.cellWidth;
        } else if (viewMode === 'week') {
            leftPx = (startOffsetDays / 7) * config.cellWidth;
            widthPx = (durationDays / 7) * config.cellWidth;
        } else if (viewMode === 'month') {
            leftPx = (startOffsetDays / 30.44) * config.cellWidth;
            widthPx = (durationDays / 30.44) * config.cellWidth;
        }

        return {
            left: `${leftPx}px`,
            width: `${Math.max(8, widthPx)}px`
        };
    };

    // Check if task is a descendant of another task
    const isTaskDescendant = (potentialDescendantId: string, potentialAncestorId: string): boolean => {
        const task = tasks.find(t => t.id === potentialDescendantId);
        if (!task || !task.parentTaskId) return false;
        if (task.parentTaskId === potentialAncestorId) return true;
        return isTaskDescendant(task.parentTaskId, potentialAncestorId);
    };

    const getActualDates = (task: Task) => {
        let actualStart: Date, actualEnd: Date;

        if (!isUpdating && dragState && dragState.taskId === task.id && dragState.barType === 'actual') {
            actualStart = dragState.currentStart || parseISO(task.actualStartDate || task.planStartDate);
            actualEnd = dragState.currentEnd || actualStart;
        } else {
            const hasActualStart = task.actualStartDate && task.actualStartDate.length > 0;
            const hasActualEnd = task.actualEndDate && task.actualEndDate.length > 0;
            const hasProgress = Number(task.progress) > 0;

            if (!hasActualStart && !hasProgress) return null;

            if (hasActualStart) {
                actualStart = parseISO(task.actualStartDate!);
            } else {
                actualStart = parseISO(task.planStartDate);
            }

            if (hasActualEnd) {
                actualEnd = parseISO(task.actualEndDate!);
            } else if (hasProgress) {
                const plannedDuration = differenceInDays(parseISO(task.planEndDate), parseISO(task.planStartDate)) + 1;
                const progressDays = Math.round(plannedDuration * (Number(task.progress) / 100));
                actualEnd = new Date(actualStart);
                actualEnd.setDate(actualEnd.getDate() + Math.max(0, progressDays - 1));
            } else {
                actualEnd = actualStart;
            }
        }
        return { start: actualStart, end: actualEnd };
    };

    const getBarStyle = (task: Task, type: 'plan' | 'actual') => {
        const chartStart = timeRange.start;
        const totalDays = differenceInDays(timeRange.end, chartStart);

        let taskStart, taskEnd;

        // Calculate drag delta if a parent is being dragged
        // Only apply drag visual if NOT updating
        let dragDeltaDays = 0;
        if (!isUpdating && dragState && dragState.type === 'move' && dragState.barType === type && dragState.taskId !== task.id) {
            // Check if this task is a descendant of the dragged task (Using Cached Set O(1))
            if (dragState.affectedTaskIds && dragState.affectedTaskIds.has(task.id)) {
                dragDeltaDays = differenceInDays(
                    dragState.currentStart || dragState.originalStart,
                    dragState.originalStart
                );
            }
        }

        // Use dragged values if this task is being dragged directly - ONLY if not updating
        if (!isUpdating && dragState && dragState.taskId === task.id && type === dragState.barType) {
            taskStart = dragState.currentStart || parseISO(task.planStartDate);
            taskEnd = dragState.currentEnd || parseISO(task.planEndDate);
        } else {
            if (type === 'plan') {
                taskStart = parseISO(task.planStartDate);
                taskEnd = parseISO(task.planEndDate);

                // Apply delta from parent drag
                if (dragDeltaDays !== 0) {
                    taskStart = addDays(taskStart, dragDeltaDays);
                    taskEnd = addDays(taskEnd, dragDeltaDays);
                }
            } else {
                // Actual bar logic handled below - but we need to init taskStart/End for shared logic or skip
            }
        }

        if (type === 'plan') {
            const startOffsetDays = differenceInDays(taskStart!, chartStart);
            const durationDays = differenceInDays(taskEnd!, taskStart!) + 1;

            let leftPx = 0;
            let widthPx = 0;

            if (viewMode === 'day') {
                leftPx = startOffsetDays * config.cellWidth;
                widthPx = durationDays * config.cellWidth;
            } else if (viewMode === 'week') {
                leftPx = (startOffsetDays / 7) * config.cellWidth;
                widthPx = (durationDays / 7) * config.cellWidth;
            } else if (viewMode === 'month') {
                leftPx = (startOffsetDays / 30.44) * config.cellWidth;
                widthPx = (durationDays / 30.44) * config.cellWidth;
            }

            if ((leftPx < 0 && leftPx + widthPx < 0) || (leftPx > totalDays * config.cellWidth)) {
                return { display: 'none' as const };
            }

            return {
                left: `${leftPx}px`,
                width: `${Math.max(4, widthPx)}px`
            };
        } else {
            // Actual Logic - support dragging
            const dates = getActualDates(task);
            if (!dates) return { display: 'none' as const };

            const startOffsetDays = differenceInDays(dates.start, chartStart);
            const durationDays = differenceInDays(dates.end, dates.start) + 1;

            let leftPx = 0;
            let widthPx = 0;

            if (viewMode === 'day') {
                leftPx = startOffsetDays * config.cellWidth;
                widthPx = durationDays * config.cellWidth;
            } else if (viewMode === 'week') {
                leftPx = (startOffsetDays / 7) * config.cellWidth;
                widthPx = (durationDays / 7) * config.cellWidth;
            } else if (viewMode === 'month') {
                leftPx = (startOffsetDays / 30.44) * config.cellWidth;
                widthPx = (durationDays / 30.44) * config.cellWidth;
            }

            if ((leftPx < 0 && leftPx + widthPx < 0) || (leftPx > totalDays * config.cellWidth)) {
                return { display: 'none' as const };
            }

            return {
                left: `${leftPx}px`,
                width: `${Math.max(4, widthPx)}px`
            };
        }
    };

    // Dynamic sticky width calculation
    const stickyWidth = useMemo(() => {
        let w = 250; // Base width for Task Name + hierarchy indent
        if (visibleColumns.cost) w += 80;
        if (visibleColumns.weight) w += 56;
        if (visibleColumns.quantity) w += 64;
        if (visibleColumns.period) w += 110;
        if (visibleColumns.progress) w += 80;
        return w + 30; // + Padding/Indent buffer
    }, [visibleColumns]);

    return (
        <div ref={chartContainerRef} className="relative flex flex-col h-[750px] bg-white rounded border border-gray-300 w-full max-w-full overflow-hidden font-sans">
            {/* Toolbar */}
            <GanttToolbar
                title={title}
                timeRange={timeRange}
                viewMode={viewMode}
                onViewModeChange={handleViewModeChange}
                showDates={showDates}
                onToggleDates={() => setShowDates(!showDates)}
                onNavigate={navigate}
                onJumpToToday={() => setCurrentDate(new Date())}
                onExport={handleExport}
                onExportPDF={handleExportPDF}
                budgetStats={budgetStats}
                progressStats={progressStats}
                visibleColumns={visibleColumns}
                onToggleColumn={(col) => setVisibleColumns((prev: any) => ({ ...prev, [col]: !prev[col] }))}
                showDependencies={showDependencies}
                onToggleDependencies={() => setShowDependencies(!showDependencies)}
                customDate={customDate}
                onCustomDateChange={setCustomDate}
            />

            {/* Main Content */}
            <div className="flex-1 min-h-0 w-full relative">
                <div ref={scrollContainerRef} className="absolute inset-0 overflow-auto custom-scrollbar">
                    <div className="min-w-max flex flex-col">

                        {/* Header Row (Sticky Top) */}
                        <TimelineHeader
                            viewMode={viewMode}
                            timeline={timeline}
                            config={config}
                            stickyWidth={stickyWidth}
                            showDates={showDates}
                            visibleColumns={visibleColumns}
                        />


                        {/* Task Rows */}
                        <div className="relative">
                            {/* Global Today Overlay */}
                            {(() => {
                                const targetDate = customDate || new Date();
                                const todayOffset = differenceInDays(targetDate, timeRange.start);
                                let leftPx = 0;
                                if (viewMode === 'day') leftPx = todayOffset * config.cellWidth;
                                else if (viewMode === 'week') leftPx = (todayOffset / 7) * config.cellWidth;
                                else leftPx = (todayOffset / 30.44) * config.cellWidth;

                                return (
                                    <div className="absolute top-0 bottom-0 z-25 pointer-events-none" style={{ left: `${stickyWidth + leftPx}px` }}>
                                        <div className="h-full w-px bg-orange-500"></div>
                                    </div>
                                );
                            })()}

                            {/* Dependency Lines SVG Layer - Raised to z-10 to sit ABOVE row background grids */}
                            {showDependencies && (
                                <svg className="absolute inset-0 pointer-events-none z-10" style={{ width: '100%', height: '100%', left: stickyWidth }}>
                                    {(() => {
                                        // 1. Calculate Visible Rows Map
                                        const visibleRowMap = new Map<string, number>();
                                        let currentRow = 0;

                                        Object.entries(groupedTasks).forEach(([category, catTasks]) => {
                                            // Category Row takes 1 slot
                                            currentRow++; // Category Header

                                            if (!collapsedCategories.has(category)) {
                                                const processTasks = (taskList: Task[]) => {
                                                    taskList.forEach(t => {
                                                        visibleRowMap.set(t.id, currentRow);
                                                        currentRow++;

                                                        if (hasChildren(t.id) && !collapsedTasks.has(t.id)) {
                                                            processTasks(getChildTasks(t.id));
                                                        }
                                                    });
                                                };
                                                // Start with root tasks of this category (those whose parents are NOT in this category or are null)
                                                processTasks(catTasks);
                                            }
                                        });

                                        // 2. Draw Lines
                                        const rowHeight = 32;
                                        const halfRow = rowHeight / 2;

                                        return tasks.flatMap(task => {
                                            if (!task.predecessors || task.predecessors.length === 0) return [];
                                            const targetRowIndex = visibleRowMap.get(task.id);
                                            if (targetRowIndex === undefined) return []; // Target hidden

                                            return task.predecessors.map(predId => {
                                                const predTask = tasks.find(t => t.id === predId);
                                                if (!predTask) return null;
                                                const sourceRowIndex = visibleRowMap.get(predId);
                                                if (sourceRowIndex === undefined) return null; // Source hidden

                                                // Calculate Coordinates
                                                const getX = (t: Task, side: 'start' | 'end') => {
                                                    const d = side === 'start' ? parseISO(t.planStartDate) : parseISO(t.planEndDate);
                                                    const diffDays = differenceInDays(d, timeRange.start) + (side === 'end' ? 1 : 0);

                                                    if (viewMode === 'day') return diffDays * config.cellWidth;
                                                    if (viewMode === 'week') return (diffDays / 7) * config.cellWidth;
                                                    return (diffDays / 30.44) * config.cellWidth;
                                                };

                                                const x1 = getX(predTask, 'end');
                                                const y1 = (sourceRowIndex * rowHeight) + halfRow;
                                                const x2 = getX(task, 'start');
                                                const y2 = (targetRowIndex * rowHeight) + halfRow;

                                                // Clean Orthogonal Routing
                                                let path = '';
                                                const buffer = 12; // Gap for initial straight line

                                                if (x2 >= x1 + (buffer * 2)) {
                                                    // Standard Forward "S" Shape
                                                    // Start -> Right to Mid -> Vertical to Target Y -> Right to Target
                                                    // Actually using "Step" logic: Out -> Down -> In
                                                    // Common Gantt style: Out a bit -> Vertical -> In a bit? 
                                                    // No, standard is: Out -> Vertical at Midpoint -> In
                                                    const midX = x1 + (x2 - x1) / 2;
                                                    path = `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
                                                } else {
                                                    // Backward or Close Loop
                                                    // Out Right -> Down -> Left -> Down -> In Right
                                                    // To avoid overlap, we go slightly further out
                                                    const loopX = x1 + buffer;
                                                    const loopEnterX = x2 - buffer;
                                                    const midY = y1 + (y2 - y1) / 2; // Not really safe if rows strictly stacked

                                                    // Simple fallback loop:
                                                    // 1. Right 10px
                                                    // 2. Down to Y2 - 10
                                                    // 3. Left to X2 - 10
                                                    // 4. Down to Y2
                                                    // 5. Right to X2
                                                    path = `M ${x1} ${y1} 
                                                            L ${x1 + buffer} ${y1} 
                                                            L ${x1 + buffer} ${y2 - (y1 < y2 ? 10 : -10)} 
                                                            L ${x2 - buffer} ${y2 - (y1 < y2 ? 10 : -10)} 
                                                            L ${x2 - buffer} ${y2} 
                                                            L ${x2} ${y2}`;
                                                }

                                                return (
                                                    <g key={`${predId}-${task.id}`} className="group/line">
                                                        {/* Invisible Hit Area (Thicker) */}
                                                        <path
                                                            d={path}
                                                            fill="none"
                                                            stroke="transparent"
                                                            strokeWidth="12"
                                                            className="cursor-pointer pointer-events-auto"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setModalConfig({
                                                                    isOpen: true,
                                                                    title: 'ลบการเชื่อมโยงงาน',
                                                                    message: 'คุณต้องการลบการเชื่อมโยงนี้ใช่หรือไม่?',
                                                                    type: 'confirm',
                                                                    onConfirm: () => {
                                                                        const newPredecessors = task.predecessors?.filter(p => p !== predId) || [];
                                                                        onTaskUpdate?.(task.id, { predecessors: newPredecessors });
                                                                    }
                                                                });
                                                            }}
                                                        >
                                                            <title>คลิกเพื่อลบการเชื่อมโยง</title>
                                                        </path>
                                                        {/* Visible Line */}
                                                        <path
                                                            d={path}
                                                            fill="none"
                                                            stroke="#9ca3af"
                                                            strokeWidth="1.5"
                                                            markerEnd="url(#arrowhead)"
                                                            className="pointer-events-none group-hover/line:stroke-red-500 group-hover/line:stroke-[2.5px] transition-all"
                                                        />
                                                    </g>
                                                );
                                            });
                                        });
                                    })()}
                                    <defs>
                                        <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                                            <polygon points="0 0, 6 2, 0 4" fill="#9ca3af" />
                                        </marker>
                                    </defs>
                                </svg>
                            )}

                            {Object.entries(groupedTasks).map(([category, catTasks]) => {
                                const isCollapsed = collapsedCategories.has(category);
                                const categorySummary = getCategorySummary(catTasks, category);

                                return (
                                    <div key={category}>
                                        {/* Category Header - Rendered as Level 0 Group Node */}
                                        <div
                                            className="flex bg-white border-b border-dashed border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors h-8 group"
                                            onClick={() => toggleCategory(category)}
                                        >
                                            <div className="sticky left-0 z-50 bg-white group-hover:bg-gray-50 border-r border-gray-300 px-4 shadow-[1px_0_0px_rgba(0,0,0,0.05)] flex items-center gap-2"
                                                style={{ width: `${stickyWidth}px`, minWidth: `${stickyWidth}px` }}>
                                                {/* Indent Level 0 (None) */}
                                                <div className="w-4 flex justify-center">
                                                    <button className="p-0.5 hover:bg-gray-200 rounded-sm transition-colors text-gray-500">
                                                        {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                                    </button>
                                                </div>

                                                {/* Color Picker for Category */}
                                                <button
                                                    className="w-3 h-3 rounded-full border border-gray-300 hover:scale-110 transition-transform shadow-sm flex-shrink-0"
                                                    style={{ backgroundColor: categoryColors[category] || '#3b82f6' }}
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
                                                    title="Change Category Color"
                                                />

                                                <div className="flex-1 truncate text-xs font-bold text-gray-900 uppercase tracking-wide group/cat-header flex items-center" title={category}>
                                                    {category}
                                                    <span className="ml-2 text-[9px] text-gray-500 font-normal bg-gray-100 px-1.5 rounded-full">{categorySummary.count}</span>
                                                    {onAddTaskToCategory && (
                                                        <button
                                                            className="ml-2 p-0.5 hover:bg-blue-100 rounded-sm transition-colors text-blue-500 opacity-0 group-hover/cat-header:opacity-100"
                                                            onClick={(e) => { e.stopPropagation(); onAddTaskToCategory(category); }}
                                                            title="Add Task to Category"
                                                        >
                                                            <Plus className="w-3 h-3" />
                                                        </button>
                                                    )}
                                                </div>

                                                {/* Columns aligned with Task Row */}
                                                {visibleColumns.cost && (
                                                    <div className="w-20 text-right text-xs text-gray-900 font-bold font-mono shrink-0">
                                                        {categorySummary.totalCost.toLocaleString()}
                                                    </div>
                                                )}
                                                {visibleColumns.weight && (
                                                    <div className="w-14 text-right text-xs text-gray-900 font-bold font-mono shrink-0">
                                                        {categorySummary.totalWeight.toFixed(2)}%
                                                    </div>
                                                )}
                                                {visibleColumns.quantity && (
                                                    <div className="w-16 shrink-0"></div> // Spacer
                                                )}
                                                {visibleColumns.period && (
                                                    <div className="w-[110px] text-right text-[10px] text-gray-600 font-mono shrink-0">
                                                        {categorySummary.dateRange ? (
                                                            <>
                                                                {format(categorySummary.dateRange.start, 'd/MM')} - {format(categorySummary.dateRange.end, 'd/MM')}
                                                                <span className="text-gray-400 ml-1">({categorySummary.dateRange.days}d)</span>
                                                            </>
                                                        ) : '-'}
                                                    </div>
                                                )}
                                                {visibleColumns.progress && (
                                                    <div className="w-20 flex items-center justify-end shrink-0 gap-1 pr-1">
                                                        <span className="w-[45px] text-right text-xs text-blue-700 font-bold font-mono">
                                                            {categorySummary.avgProgress.toFixed(0)}%
                                                        </span>
                                                        <div className="w-[22px]"></div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Category Summary Bar on Chart */}
                                            <div className="flex-1 bg-white relative" style={{ width: `${timeline.items.length * config.cellWidth}px` }}>
                                                {/* Grid lines background */}
                                                <div className="absolute inset-0 flex pointer-events-none">
                                                    {timeline.items.map((item, idx) => (
                                                        <div key={idx} className={`flex-shrink-0 border-r border-dashed border-gray-200 h-full ${viewMode === 'day' && isWeekend(item) ? 'bg-gray-50/50' : ''
                                                            }`}
                                                            style={{ width: config.cellWidth }} />
                                                    ))}
                                                </div>

                                                {/* Summary Bar */}
                                                {categorySummary.dateRange && (
                                                    <div
                                                        className="absolute h-3 top-[10px] rounded-full border border-gray-400/30"
                                                        style={{
                                                            ...getCategoryBarStyle(categorySummary.dateRange),
                                                            backgroundColor: categoryColors[category] ? `${categoryColors[category]}40` : 'rgba(209, 213, 219, 0.5)'
                                                        }}
                                                    >
                                                        {/* Progress overlay - Keep standard blue/dark but slightly tinted */}
                                                        <div
                                                            className="absolute left-0 top-0 bottom-0 rounded-full"
                                                            style={{
                                                                width: `${categorySummary.avgProgress}%`,
                                                                backgroundColor: categoryColors[category] || '#3b82f6',
                                                                opacity: 0.8
                                                            }}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Task Items - Hierarchical rendering */}
                                        {!isCollapsed && catTasks.map(task => {
                                            const weight = getTaskWeight(task);
                                            const taskHasChildren = hasChildren(task.id);
                                            const isTaskCollapsed = collapsedTasks.has(task.id);
                                            const isDropTarget = dropTargetId === task.id;
                                            const isDragging = rowDragState?.taskId === task.id;

                                            // Render a single task row
                                            const renderTaskRow = (t: Task, level: number = 0) => {
                                                const tWeight = getTaskWeight(t);
                                                const tHasChildren = hasChildren(t.id);
                                                const tIsCollapsed = collapsedTasks.has(t.id);
                                                const tIsDropTarget = dropTargetId === t.id;
                                                const tIsDragging = rowDragState?.taskId === t.id;
                                                const childTasks = getChildTasks(t.id);

                                                // Calculate group summary for group-type tasks
                                                const isGroup = t.type === 'group';
                                                const groupSummary = isGroup ? getGroupSummary(t) : null;

                                                // Use summary dates for groups, original dates for tasks
                                                const displayStartDate = isGroup && groupSummary ? groupSummary.minStartDate : t.planStartDate;
                                                const displayEndDate = isGroup && groupSummary ? groupSummary.maxEndDate : t.planEndDate;
                                                const displayProgress = isGroup && groupSummary ? groupSummary.progress : t.progress;
                                                const displayCost = isGroup && groupSummary ? groupSummary.totalCost : t.cost;

                                                return (
                                                    <React.Fragment key={t.id}>
                                                        {/* Drop indicator - Above */}
                                                        {tIsDropTarget && dropPosition === 'above' && (
                                                            <div className="h-0.5 bg-blue-500 w-full" />
                                                        )}
                                                        <div
                                                            className={`flex h-8 border-b border-dashed border-gray-200 transition-colors group relative
                                                                ${tIsDragging ? 'opacity-50 bg-gray-100' : 'hover:bg-blue-50/30'}
                                                                ${tIsDropTarget && dropPosition === 'child' ? 'bg-blue-100 ring-2 ring-inset ring-blue-400' : ''}
                                                            `}
                                                            draggable={!!onTaskUpdate}
                                                            onDragStart={(e) => handleRowDragStart(e, t)}
                                                            onDragOver={(e) => handleRowDragOver(e, t.id)}
                                                            onDragLeave={handleRowDragLeave}
                                                            onDrop={(e) => handleRowDrop(e, t.id)}
                                                            onDragEnd={handleRowDragEnd}
                                                        >
                                                            <div className="sticky left-0 z-50 bg-white group-hover:bg-gray-50 border-r border-gray-300 flex items-center px-4 shadow-[1px_0_0px_rgba(0,0,0,0.05)]"
                                                                style={{ width: `${stickyWidth}px`, minWidth: `${stickyWidth}px` }}>

                                                                {/* Indent + Collapse toggle */}
                                                                <div className="flex items-center" style={{ paddingLeft: `${level * 20}px` }}>
                                                                    {/* Tree connector line for sub-items */}
                                                                    {level > 0 && (
                                                                        <div className="flex items-center mr-1">
                                                                            <div className="w-3 h-[1px] bg-gray-300"></div>
                                                                        </div>
                                                                    )}
                                                                    {tHasChildren ? (
                                                                        <button
                                                                            className="p-0.5 hover:bg-gray-200 rounded-sm transition-colors text-gray-500"
                                                                            onClick={(e) => { e.stopPropagation(); toggleTaskCollapse(t.id); }}
                                                                        >
                                                                            {tIsCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                                                        </button>
                                                                    ) : (
                                                                        <div className="w-4" />
                                                                    )}

                                                                    {/* Color Picker for Groups */}
                                                                    {t.type === 'group' && (
                                                                        <button
                                                                            className="w-2.5 h-2.5 rounded-full border border-gray-300 hover:scale-110 transition-transform shadow-sm flex-shrink-0 mr-1.5"
                                                                            style={{ backgroundColor: t.color || '#3b82f6' }}
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                const rect = e.currentTarget.getBoundingClientRect();
                                                                                setActiveColorMenu({
                                                                                    id: t.id,
                                                                                    type: 'group',
                                                                                    top: rect.bottom + window.scrollY,
                                                                                    left: rect.left + window.scrollX
                                                                                });
                                                                            }}
                                                                            title="Change Group Color"
                                                                        />
                                                                    )}

                                                                    {/* Child count badge */}
                                                                    {tHasChildren && (
                                                                        <span className="text-[9px] text-gray-500 bg-gray-200 px-1 rounded-sm ml-0.5 mr-1">
                                                                            {childTasks.length}
                                                                        </span>
                                                                    )}
                                                                    {onAddSubTask && t.type === 'group' && (
                                                                        <button
                                                                            className="p-0.5 ml-1 hover:bg-blue-100 rounded-sm transition-colors text-blue-500 opacity-0 group-hover:opacity-100"
                                                                            onClick={(e) => { e.stopPropagation(); onAddSubTask(t.id); }}
                                                                            title="Add Sub-Group/Task"
                                                                        >
                                                                            <Plus className="w-3 h-3" />
                                                                        </button>
                                                                    )}
                                                                </div>

                                                                {/* Drag handle */}
                                                                {onTaskUpdate && (
                                                                    <div className="cursor-grab mr-1 text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                                                            <circle cx="5" cy="5" r="2" /><circle cx="12" cy="5" r="2" /><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="5" cy="19" r="2" /><circle cx="12" cy="19" r="2" />
                                                                        </svg>
                                                                    </div>
                                                                )}

                                                                <div className={`flex-1 truncate text-xs transition-colors 
                                                                    ${t.type === 'group' || hasChildren(t.id) ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}
                                                                    title={t.name}>
                                                                    {t.name}
                                                                    {t.parentTaskId && onTaskUpdate && (
                                                                        <button
                                                                            className="ml-1 text-[9px] text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100"
                                                                            onClick={(e) => { e.stopPropagation(); handleRemoveFromParent(t.id); }}
                                                                            title="Remove from parent"
                                                                        >
                                                                            ✕
                                                                        </button>
                                                                    )}
                                                                </div>

                                                                {visibleColumns.cost && (
                                                                    <div className="w-20 text-right text-xs text-gray-600 font-medium font-mono shrink-0">
                                                                        {isGroup ? (displayCost ? displayCost.toLocaleString() : '-') : (t.cost ? t.cost.toLocaleString() : '-')}
                                                                    </div>
                                                                )}
                                                                {visibleColumns.weight && (
                                                                    <div className="w-14 text-right text-xs text-gray-600 font-medium font-mono shrink-0">
                                                                        {tWeight.toFixed(2)}%
                                                                    </div>
                                                                )}
                                                                {visibleColumns.quantity && (
                                                                    <div className="w-16 text-right text-xs text-gray-600 font-medium font-mono shrink-0">
                                                                        {isGroup ? (groupSummary?.count ? `${groupSummary.count} งาน` : '-') : (t.quantity || '-')}
                                                                    </div>
                                                                )}
                                                                {visibleColumns.period && (
                                                                    <div className={`w-[110px] text-right text-[10px] font-mono shrink-0 ${isGroup ? 'text-gray-700 font-medium' : 'text-gray-500'}`}>
                                                                        {displayStartDate && displayEndDate ? (
                                                                            <>{formatDateTH(displayStartDate)} - {formatDateTH(displayEndDate)}</>
                                                                        ) : '-'}
                                                                    </div>
                                                                )}
                                                                {visibleColumns.progress && (
                                                                    <div className="w-20 flex items-center justify-end shrink-0 gap-1 pr-1">
                                                                        {isGroup ? (
                                                                            // Groups: Show calculated progress (read-only)
                                                                            <>
                                                                                <span className={`w-[45px] text-right text-xs font-bold font-mono ${displayProgress === 100 ? 'text-green-600' : displayProgress > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                                                                                    {displayProgress}%
                                                                                </span>
                                                                                <div className="w-[22px]"></div>
                                                                            </>
                                                                        ) : (
                                                                            // Tasks: Show interactive Start/Reset buttons
                                                                            <>
                                                                                {!t.actualStartDate && Number(t.progress) === 0 ? (
                                                                                    <>
                                                                                        <div className="w-[45px]"></div>
                                                                                        <button
                                                                                            onClick={(e) => {
                                                                                                e.stopPropagation();
                                                                                                const startD = t.planStartDate || format(new Date(), 'yyyy-MM-dd');
                                                                                                onTaskUpdate?.(t.id, {
                                                                                                    actualStartDate: startD,
                                                                                                    progress: 0,
                                                                                                    status: 'in-progress'
                                                                                                });
                                                                                            }}
                                                                                            className="flex items-center gap-0.5 px-1.5 py-0.5 bg-green-50 text-green-700 text-[9px] font-bold rounded border border-green-200 hover:bg-green-100 transition-colors w-[24px] justify-center"
                                                                                            title="เริ่มงาน"
                                                                                        >
                                                                                            <span className="hidden sm:inline">GO</span>
                                                                                            <svg className="sm:hidden" width="7" height="7" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                                                                                        </button>
                                                                                    </>
                                                                                ) : (
                                                                                    <div className="flex items-center justify-end w-full group/prog-cell gap-1">
                                                                                        <span className={`w-[45px] text-right text-xs font-bold font-mono ${Number(t.progress) === 100 ? 'text-green-600' : 'text-blue-600'}`}>
                                                                                            {Number(t.progress)}%
                                                                                        </span>
                                                                                        <button
                                                                                            onClick={(e) => {
                                                                                                e.stopPropagation();
                                                                                                setModalConfig({
                                                                                                    isOpen: true,
                                                                                                    title: 'รีเซ็ตความคืบหน้า',
                                                                                                    message: 'คุณต้องการรีเซ็ตความคืบหน้าของงานนี้ใช่หรือไม่?',
                                                                                                    type: 'confirm',
                                                                                                    onConfirm: () => {
                                                                                                        onTaskUpdate?.(t.id, {
                                                                                                            actualStartDate: '',
                                                                                                            actualEndDate: '',
                                                                                                            progress: 0,
                                                                                                            status: 'not-started'
                                                                                                        });
                                                                                                    }
                                                                                                });
                                                                                            }}
                                                                                            className="opacity-0 group-hover/prog-cell:opacity-100 w-[22px] flex justify-center text-gray-400 hover:text-red-500 transition-opacity"
                                                                                            title="Reset Progress"
                                                                                        >
                                                                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                                                                                        </button>
                                                                                    </div>
                                                                                )}
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>

                                                            <div className="relative overflow-hidden" style={{ width: `${timeline.items.length * config.cellWidth}px` }}>
                                                                <div className="absolute inset-0 flex pointer-events-none">
                                                                    {timeline.items.map((item, idx) => (
                                                                        <div key={idx} className={`flex-shrink-0 border-r border-dashed border-gray-200 h-full ${viewMode === 'day' && isWeekend(item) ? 'bg-gray-50' : ''
                                                                            } ${viewMode === 'day' && isToday(item) ? 'bg-blue-50/20' : ''}`}
                                                                            style={{ width: config.cellWidth }} />
                                                                    ))}
                                                                </div>

                                                                {/* Dependency Dots (Start/End) - Only if dependencies enabled */}
                                                                {showDependencies && !isGroup && (
                                                                    <>
                                                                        {/* Start Dot (Left) - Target for Finish-to-Start */}
                                                                        <div
                                                                            className={`absolute w-1.5 h-1.5 border rounded-full z-20 cursor-pointer transition-all
                                                                                ${dependencySource?.taskId === t.id && dependencySource?.side === 'start' ? 'bg-blue-600 border-white scale-125' : 'bg-white border-gray-400 hover:bg-blue-100'}
                                                                                ${dependencySource && dependencySource.side === 'end' && dependencySource.taskId !== t.id ? 'animate-pulse ring-2 ring-blue-300' : ''}
                                                                            `}
                                                                            style={{
                                                                                left: `${parseFloat(getBarStyle(t, 'plan').left || '0')}px`,
                                                                                top: '13px',
                                                                                transform: 'translateX(-120%)',
                                                                                opacity: 1
                                                                            }}
                                                                            onClick={(e) => { e.stopPropagation(); handleDependencyClick(t.id, 'start'); }}
                                                                            title="Link Target (Start)"
                                                                        />
                                                                        {/* End Dot (Right) - Source for Finish-to-Start */}
                                                                        <div
                                                                            className={`absolute w-1.5 h-1.5 border rounded-full z-20 cursor-pointer transition-all
                                                                                ${dependencySource?.taskId === t.id && dependencySource?.side === 'end' ? 'bg-blue-600 border-white scale-125' : 'bg-white border-gray-400 hover:bg-blue-500 hover:border-blue-600'}
                                                                            `}
                                                                            style={{
                                                                                left: `${parseFloat(getBarStyle(t, 'plan').left || '0') + parseFloat(getBarStyle(t, 'plan').width || '0')}px`,
                                                                                top: '13px',
                                                                                transform: 'translateX(20%)',
                                                                                opacity: 1
                                                                            }}
                                                                            onClick={(e) => { e.stopPropagation(); handleDependencyClick(t.id, 'end'); }}
                                                                            title="Link Source (End)"
                                                                        />
                                                                    </>
                                                                )}

                                                                {(() => {
                                                                    const isGroup = t.type === 'group';
                                                                    if (isGroup) {
                                                                        if (!displayStartDate || !displayEndDate) return null;

                                                                        // Create a mock task with calculated dates for bar rendering
                                                                        const groupBarTask = {
                                                                            ...t,
                                                                            planStartDate: displayStartDate,
                                                                            planEndDate: displayEndDate
                                                                        };
                                                                        return (
                                                                            <div
                                                                                className="absolute h-3 top-[10px] rounded-full border border-gray-500/30"
                                                                                style={{
                                                                                    ...getBarStyle(groupBarTask, 'plan'),
                                                                                    backgroundColor: t.color ? `${t.color}40` : 'rgba(156, 163, 175, 0.4)'
                                                                                }}
                                                                            >
                                                                                <div
                                                                                    className="absolute left-0 top-0 bottom-0 rounded-full"
                                                                                    style={{
                                                                                        width: `${displayProgress}%`,
                                                                                        backgroundColor: t.color || '#3b82f6',
                                                                                        opacity: 0.8
                                                                                    }}
                                                                                />
                                                                            </div>
                                                                        );
                                                                    }

                                                                    return (
                                                                        <div
                                                                            className={`absolute h-4 top-[8px] rounded-[2px] border group/bar z-20
                                                                                ${dragState?.taskId === t.id && dragState?.barType === 'plan' ? 'z-50 cursor-grabbing' : 'cursor-grab'}
                                                                                ${isUpdating && (dragState?.taskId === t.id || (dragState?.affectedTaskIds && dragState.affectedTaskIds.has(t.id)))
                                                                                    ? 'bg-[linear-gradient(45deg,rgba(255,255,255,0.15)25%,transparent_25%,transparent_50%,rgba(255,255,255,0.15)50%,rgba(255,255,255,0.15)75%,transparent_75%,transparent)] bg-[length:10px_10px] animate-pulse'
                                                                                    : 'hover:brightness-95'} 
                                                                                transition-colors
                                                                            `}
                                                                            style={{
                                                                                ...getBarStyle(t, 'plan'),
                                                                                backgroundColor: t.color || '#3b82f6',
                                                                                borderColor: t.color || '#2563eb'
                                                                            }}
                                                                            onMouseDown={(e) => startDrag(e, t, 'move')}
                                                                        >
                                                                            <div
                                                                                className="absolute left-0 top-0 bottom-0 w-1.5 cursor-w-resize hover:bg-white/30"
                                                                                onMouseDown={(e) => startDrag(e, t, 'resize-left')}
                                                                            />
                                                                            <div
                                                                                className="absolute right-0 top-0 bottom-0 w-1.5 cursor-e-resize hover:bg-white/30"
                                                                                onMouseDown={(e) => startDrag(e, t, 'resize-right')}
                                                                            />
                                                                        </div>
                                                                    );
                                                                })()}

                                                                {(() => {
                                                                    const actualDates = getActualDates(t);
                                                                    const isGroup = t.type === 'group';

                                                                    // For groups, determine effective actual dates from summary
                                                                    const groupActualDates = isGroup && groupSummary && groupSummary.minActualDate ? {
                                                                        start: parseISO(groupSummary.minActualDate),
                                                                        end: groupSummary.maxActualDate ? parseISO(groupSummary.maxActualDate) : parseISO(groupSummary.minActualDate)
                                                                    } : null;

                                                                    const finalActualDates = isGroup ? groupActualDates : actualDates;

                                                                    if (isGroup) return null; // Don't render actual bars for groups

                                                                    const isStartMarker = !isGroup && Number(t.progress) === 0; // Groups never just start marker

                                                                    return finalActualDates && (
                                                                        <div
                                                                            className={`absolute h-2 top-[12px] z-[25] rounded-[1px] group/actual-bar
                                                                                ${!isGroup && (dragState?.taskId === t.id && dragState?.barType === 'actual')
                                                                                    ? 'z-50 border-white cursor-grabbing shadow-md'
                                                                                    : isGroup ? 'pointer-events-none opacity-80' : 'cursor-grab border-white shadow-sm'}
                                                                                ${isUpdating && (dragState?.taskId === t.id)
                                                                                    ? `bg-[linear-gradient(45deg,rgba(255,255,255,0.3)25%,transparent_25%,transparent_50%,rgba(255,255,255,0.3)50%,rgba(255,255,255,0.3)75%,transparent_75%,transparent)] bg-[length:10px_10px] animate-pulse ${isStartMarker ? 'bg-orange-500' : 'bg-green-400'}`
                                                                                    : isStartMarker ? 'bg-orange-500 hover:bg-orange-600' : 'bg-green-400 hover:bg-green-500'} 
                                                                                transition-all
                                                                            `}
                                                                            style={{
                                                                                // Manual getBarStyle logic because getBarStyle expects Task properties
                                                                                ...(isGroup ? (() => {
                                                                                    const startDiff = differenceInDays(finalActualDates.start, timeRange.start);
                                                                                    const duration = differenceInDays(finalActualDates.end, finalActualDates.start) + 1;
                                                                                    let left = 0, width = 0;
                                                                                    if (viewMode === 'day') { left = startDiff * config.cellWidth; width = duration * config.cellWidth; }
                                                                                    else if (viewMode === 'week') { left = (startDiff / 7) * config.cellWidth; width = (duration / 7) * config.cellWidth; }
                                                                                    else { left = (startDiff / 30.44) * config.cellWidth; width = (duration / 30.44) * config.cellWidth; }
                                                                                    return { left: `${left}px`, width: `${Math.max(4, width)}px` };
                                                                                })() : getBarStyle(t, 'actual')),
                                                                                ...(isStartMarker ? { width: '10px' } : {})
                                                                            }}
                                                                            onMouseDown={(e) => !isGroup && startDrag(e, t, 'move', 'actual')}
                                                                        >
                                                                            <div
                                                                                className="absolute left-0 top-0 bottom-0 w-1 cursor-w-resize hover:bg-white/40"
                                                                                onMouseDown={(e) => startDrag(e, t, 'resize-left', 'actual')}
                                                                            />
                                                                            <div
                                                                                className="absolute right-0 top-0 bottom-0 w-1 cursor-e-resize hover:bg-white/40"
                                                                                onMouseDown={(e) => startDrag(e, t, 'resize-right', 'actual')}
                                                                            />
                                                                        </div>
                                                                    );
                                                                })()}
                                                            </div>
                                                        </div>

                                                        {/* Drop indicator - Below */}
                                                        {tIsDropTarget && dropPosition === 'below' && (
                                                            <div className="h-0.5 bg-blue-500 w-full" />
                                                        )}

                                                        {/* Render children recursively */}
                                                        {!tIsCollapsed && childTasks.map(child => renderTaskRow(child, level + 1))}
                                                    </React.Fragment>
                                                );
                                            };

                                            // Render a single task row
                                            // Start explicit task rendering at Level 1 (since Category is Level 0)
                                            return renderTaskRow(task, 1);
                                        })}
                                    </div>
                                );
                            })}
                        </div>


                    </div>
                </div>
            </div>

            {/* Footer Summary - Moved Outside */}
            <div className="flex-shrink-0 z-30 flex bg-white border-t border-gray-300">
                <div className="bg-gray-50 border-r border-gray-300 px-4 py-2 shadow-[1px_0_0px_rgba(0,0,0,0.05)]"
                    style={{ width: `${stickyWidth}px`, minWidth: `${stickyWidth}px` }}>
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-gray-800 uppercase">Total</span>
                        {showDates && (
                            <>
                                <span className="text-[11px] font-bold text-gray-900 font-mono">
                                    {budgetStats.totalCost.toLocaleString()} THB
                                </span>
                                <span className="text-[11px] font-bold text-gray-700 font-mono">
                                    100.00%
                                </span>
                            </>
                        )}
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-gray-500 uppercase font-semibold">Aktual:</span>
                            <span className="text-sm font-bold text-green-700 font-mono">{progressStats.totalActual.toFixed(2)}%</span>
                        </div>
                    </div>
                </div>
                <div className="flex-1 bg-white"></div>
            </div>


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

            {/* Custom Modal */}
            {modalConfig.isOpen && (
                <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-full ${modalConfig.type === 'alert' ? 'bg-blue-100 text-blue-600' : 'bg-red-100 text-red-600'}`}>
                                    {modalConfig.type === 'alert' ? <AlertTriangle className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                                </div>
                                <h3 className="font-semibold text-gray-900">{modalConfig.title}</h3>
                            </div>
                            <button
                                onClick={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
                                className="text-gray-400 hover:text-gray-500 hover:bg-gray-100 p-1 rounded-full transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="px-6 py-6">
                            <p className="text-gray-600 leading-relaxed">
                                {modalConfig.message}
                            </p>
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
                            <button
                                onClick={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
                                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-gray-200 transition-colors"
                            >
                                {modalConfig.type === 'confirm' ? 'ยกเลิก' : 'ปิด'}
                            </button>
                            {modalConfig.type === 'confirm' && (
                                <button
                                    onClick={() => {
                                        if (modalConfig.onConfirm) modalConfig.onConfirm();
                                        setModalConfig(prev => ({ ...prev, isOpen: false }));
                                    }}
                                    className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-red-500 shadow-sm transition-colors"
                                >
                                    ยืนยัน
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar {
                    height: 10px;
                    width: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: #f8fafc;
                    border-top: 1px solid #e2e8f0;
                    border-left: 1px solid #e2e8f0;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #cbd5e1;
                    border-radius: 2px;
                    border: 1px solid #f1f5f9;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #94a3b8;
                }
            `}</style>
        </div>
    );
}
