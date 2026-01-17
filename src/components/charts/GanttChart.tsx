'use client';

import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Task } from '@/types/construction';
import { format, parseISO, differenceInDays, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval, eachYearOfInterval, startOfMonth, endOfMonth, startOfYear, endOfYear, addMonths, subMonths, isSameDay, isToday, isWeekend, differenceInMonths, isBefore, isAfter, addDays } from 'date-fns';
import { th } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, SlidersHorizontal, Eye, EyeOff, Download, ChevronDown, ChevronUp, TrendingUp, Wallet } from 'lucide-react';

interface GanttChartProps {
    tasks: Task[];
    startDate?: string;
    endDate?: string;
    title?: string;
    viewMode?: ViewMode;
    onViewModeChange?: (mode: ViewMode) => void;
    onTaskUpdate?: (taskId: string, updates: Partial<Task>) => Promise<void>;
    onOpenProgressModal?: (taskId: string) => void;
}

interface DragState {
    taskId: string;
    type: 'move' | 'resize-left' | 'resize-right';
    barType: 'plan' | 'actual'; // Which bar is being dragged
    startX: number;
    originalStart: Date;
    originalEnd: Date;
    currentStart?: Date;
    currentEnd?: Date;
    affectedTaskIds?: Set<string>; // Optimization: Cache descendants
}

// Row drag for reordering / nesting
interface RowDragState {
    taskId: string;
    taskName: string;
}

type ViewMode = 'day' | 'week' | 'month';

export default function GanttChart({ tasks, startDate = '2024-09-01', endDate = '2025-04-30', title, viewMode: controlledViewMode, onViewModeChange, onTaskUpdate, onOpenProgressModal }: GanttChartProps) {
    const [internalViewMode, setInternalViewMode] = useState<ViewMode>('week');
    const viewMode = controlledViewMode || internalViewMode;

    const handleViewModeChange = (mode: ViewMode) => {
        if (onViewModeChange) {
            onViewModeChange(mode);
        } else {
            setInternalViewMode(mode);
        }
    };

    // Configuration
    const config = useMemo(() => {
        switch (viewMode) {
            case 'day': return { cellWidth: 30, label: 'วัน' };
            case 'week': return { cellWidth: 40, label: 'สัปดาห์' };
            case 'month': return { cellWidth: 100, label: 'เดือน' };
        }
    }, [viewMode]);

    const [showDates, setShowDates] = useState(true);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
    const [collapsedTasks, setCollapsedTasks] = useState<Set<string>>(new Set()); // For parent tasks
    const [showSCurve, setShowSCurve] = useState(true);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Drag & Drop State for bars
    const [dragState, setDragState] = useState<DragState | null>(null);

    // Row Drag & Drop State for nesting/reordering
    const [rowDragState, setRowDragState] = useState<RowDragState | null>(null);
    const [dropTargetId, setDropTargetId] = useState<string | null>(null);
    const [dropPosition, setDropPosition] = useState<'above' | 'below' | 'child' | null>(null);
    const [isUpdating, setIsUpdating] = useState(false);

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
                try {
                    // Apply changes
                    const formatDate = (d: Date) => format(d, 'yyyy-MM-dd');

                    // Update based on which bar was being dragged
                    if (dragState.barType === 'actual') {
                        await onTaskUpdate(dragState.taskId, {
                            actualStartDate: formatDate(dragState.currentStart || dragState.originalStart),
                            actualEndDate: formatDate(dragState.currentEnd || dragState.originalEnd)
                        });
                    } else {
                        // Update Plan Dates
                        const newPlanStart = formatDate(dragState.currentStart || dragState.originalStart);
                        const newPlanEnd = formatDate(dragState.currentEnd || dragState.originalEnd);

                        await onTaskUpdate(dragState.taskId, {
                            planStartDate: newPlanStart,
                            planEndDate: newPlanEnd
                        });

                        // If it was a MOVE operation (not resize), update descendants too
                        if (dragState.type === 'move') {
                            const daysDifference = differenceInDays(
                                dragState.currentStart || dragState.originalStart,
                                dragState.originalStart
                            );

                            if (daysDifference !== 0) {
                                // Helper to Recursively calculate descendants
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

                                // Valid descendant tasks
                                const currentTasks = tasksRef.current;
                                const validDescendants = currentTasks.filter(t => descendantIds.includes(t.id));

                                // Update each descendant
                                // Use Promise.all for parallel updates (faster)
                                await Promise.all(validDescendants.map(child => {
                                    // Calculate new dates for child
                                    const childStart = parseISO(child.planStartDate);
                                    const childEnd = parseISO(child.planEndDate);
                                    const newChildStart = addDays(childStart, daysDifference);
                                    const newChildEnd = addDays(childEnd, daysDifference);

                                    return onTaskUpdate(child.id, {
                                        planStartDate: formatDate(newChildStart),
                                        planEndDate: formatDate(newChildEnd)
                                    });
                                }));
                            }
                        }
                    }
                } finally {
                    setIsUpdating(false); // Stop loading
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

            if (hasActualEnd) {
                endDate = parseISO(task.actualEndDate!);
            } else if (Number(task.progress) > 0) {
                // Calculate based on progress
                const plannedDuration = differenceInDays(parseISO(task.planEndDate), parseISO(task.planStartDate)) + 1;
                const progressDays = Math.round(plannedDuration * (Number(task.progress) / 100));
                endDate = addDays(startDate, Math.max(0, progressDays - 1));
            } else {
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

    // Calculate dynamic range
    const timeRange = useMemo(() => {
        let start, end;
        if (viewMode === 'day') {
            start = startOfMonth(subMonths(currentDate, 1));
            end = endOfMonth(addMonths(currentDate, 1));
        } else if (viewMode === 'week') {
            start = startOfMonth(subMonths(currentDate, 2));
            end = endOfMonth(addMonths(currentDate, 4));
        } else {
            start = startOfYear(subMonths(currentDate, 6));
            end = endOfYear(addMonths(currentDate, 6));
        }
        return { start, end };
    }, [currentDate, viewMode]);

    // Generate timeline headers
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

    // Calculate S-Curve data for overlay
    const scurveData = useMemo(() => {
        if (tasks.length === 0 || !showSCurve) return [];

        const buckets: { date: Date; cumulativePlan: number; cumulativeActual: number }[] = [];

        timeline.items.forEach((item, idx) => {
            let bucketEnd: Date;
            if (viewMode === 'day') {
                bucketEnd = item;
            } else if (viewMode === 'week') {
                bucketEnd = new Date(item);
                bucketEnd.setDate(bucketEnd.getDate() + 6);
            } else {
                bucketEnd = endOfMonth(item);
            }

            let runningPlan = 0;
            let runningActual = 0;

            tasks.forEach(task => {
                const tStart = parseISO(task.planStartDate);
                const tEnd = parseISO(task.planEndDate);
                const duration = differenceInDays(tEnd, tStart) + 1;
                if (duration <= 0 || budgetStats.totalWeight <= 0) return;

                const taskWeight = getTaskWeight(task);
                const weightPerDay = taskWeight / duration;

                // Calculate Plan contribution up to bucketEnd
                if (isBefore(bucketEnd, tStart)) {
                    // Not started yet
                } else if (isAfter(bucketEnd, tEnd)) {
                    // Task fully planned by this bucket
                    runningPlan += taskWeight;
                } else {
                    // Partial overlap
                    const daysInBucket = differenceInDays(bucketEnd, tStart) + 1;
                    runningPlan += Math.min(taskWeight, daysInBucket * weightPerDay);
                }

                // Calculate Actual contribution
                const progress = Number(task.progress) || 0;
                const actualContribution = taskWeight * (progress / 100);

                // For actual, we attribute it progressively
                let actualStart = task.actualStartDate ? parseISO(task.actualStartDate) : tStart;
                let actualEnd = task.actualEndDate ? parseISO(task.actualEndDate) :
                    (progress > 0 ? new Date() : null);

                if (actualEnd && isBefore(bucketEnd, actualStart)) {
                    // Work hasn't started
                } else if (actualEnd && isAfter(bucketEnd, actualEnd)) {
                    // Work complete in this bucket
                    runningActual += actualContribution;
                } else if (actualEnd && progress > 0) {
                    // Work in progress
                    const actualDuration = differenceInDays(actualEnd, actualStart) + 1;
                    const actualWeightPerDay = actualDuration > 0 ? actualContribution / actualDuration : actualContribution;
                    const daysToNow = differenceInDays(bucketEnd, actualStart) + 1;
                    runningActual += Math.min(actualContribution, Math.max(0, daysToNow) * actualWeightPerDay);
                }
            });

            buckets.push({
                date: bucketEnd,
                cumulativePlan: Math.min(100, runningPlan),
                cumulativeActual: Math.min(100, runningActual)
            });
        });

        return buckets;
    }, [tasks, timeline.items, viewMode, showSCurve, budgetStats]);

    // Calculate current progress stats
    const progressStats = useMemo(() => {
        let totalWeight = 0;
        let actualWeighted = 0;

        tasks.forEach(task => {
            const weight = getTaskWeight(task);
            totalWeight += weight;
            actualWeighted += weight * (Number(task.progress) || 0) / 100;
        });

        return {
            totalActual: actualWeighted,
            totalPlan: scurveData.find(d => isAfter(d.date, new Date()))?.cumulativePlan || 100
        };
    }, [tasks, scurveData]);

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

        // Top 25% = above, Bottom 25% = below, Middle 50% = child
        let position: 'above' | 'below' | 'child';
        if (relativeY < rowHeight * 0.25) {
            position = 'above';
        } else if (relativeY > rowHeight * 0.75) {
            position = 'below';
        } else {
            position = 'child';
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
            // Make as child - check circular reference
            if (isDescendant(draggedTaskId, targetTaskId)) {
                setRowDragState(null);
                setDropTargetId(null);
                setDropPosition(null);
                return;
            }
            await onTaskUpdate(draggedTaskId, { parentTaskId: targetTaskId });
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

        allCategoryTasks.forEach(t => {
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
            let actualStart, actualEnd;

            // Use dragged values if this task is being dragged with actual bar - ONLY if not updating
            if (!isUpdating && dragState && dragState.taskId === task.id && dragState.barType === 'actual') {
                actualStart = dragState.currentStart || parseISO(task.actualStartDate || task.planStartDate);
                actualEnd = dragState.currentEnd || actualStart;
            } else {
                const hasActualStart = task.actualStartDate && task.actualStartDate.length > 0;
                const hasActualEnd = task.actualEndDate && task.actualEndDate.length > 0;

                if (hasActualStart) {
                    actualStart = parseISO(task.actualStartDate!);
                } else {
                    actualStart = parseISO(task.planStartDate);
                }

                if (hasActualEnd) {
                    actualEnd = parseISO(task.actualEndDate!);
                } else if (Number(task.progress) > 0) {
                    const plannedDuration = differenceInDays(parseISO(task.planEndDate), parseISO(task.planStartDate)) + 1;
                    const progressDays = Math.round(plannedDuration * (Number(task.progress) / 100));
                    actualEnd = new Date(actualStart);
                    actualEnd.setDate(actualEnd.getDate() + Math.max(0, progressDays - 1));
                } else {
                    return { display: 'none' as const };
                }
            }

            const startOffsetDays = differenceInDays(actualStart, chartStart);
            const durationDays = differenceInDays(actualEnd, actualStart) + 1;

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

    // Get S-Curve point position
    const getSCurvePosition = (value: number, idx: number) => {
        const x = idx * config.cellWidth + config.cellWidth / 2;
        const y = 60 - (value / 100) * 55; // Scale to fit in 60px height area
        return { x, y };
    };

    // Generate SVG path for S-Curve
    const generateSCurvePath = (type: 'plan' | 'actual'): string => {
        if (scurveData.length < 2) return '';

        const points = scurveData.map((d, idx) => {
            const value = type === 'plan' ? d.cumulativePlan : d.cumulativeActual;
            return getSCurvePosition(value, idx);
        });

        return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    };

    const stickyWidth = showDates ? 552 : 322;

    return (
        <div className="relative flex flex-col h-[750px] bg-white rounded border border-gray-300 w-full max-w-full overflow-hidden font-sans">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row items-center justify-between p-3 border-b border-gray-200 bg-white gap-4 flex-shrink-0">
                <div className="flex items-center gap-3">
                    <div className="p-1.5 bg-gray-100 text-gray-700 rounded-sm border border-gray-200">
                        <SlidersHorizontal className="w-4 h-4" />
                    </div>
                    <div>
                        <h3 className="font-bold text-gray-800 text-sm">{title || 'Project Schedule'}</h3>
                        <p className="text-xs text-gray-500 font-medium">
                            {format(timeRange.start, 'MMM yyyy', { locale: th })} - {format(timeRange.end, 'MMM yyyy', { locale: th })}
                        </p>
                    </div>
                </div>

                {/* Budget Summary */}
                <div className="flex items-center gap-4 px-3 py-1.5 bg-white rounded-sm border border-gray-300">
                    <div className="flex items-center gap-2">
                        <Wallet className="w-3.5 h-3.5 text-gray-600" />
                        <div>
                            <p className="text-[10px] text-gray-500 uppercase font-semibold tracking-wider">Budget</p>
                            <p className="text-xs font-bold text-gray-900">{budgetStats.totalCost.toLocaleString()} <span className="text-[10px] font-normal text-gray-500">THB</span></p>
                        </div>
                    </div>
                    <div className="w-px h-6 bg-gray-200"></div>
                    <div className="flex items-center gap-2">
                        <TrendingUp className="w-3.5 h-3.5 text-gray-600" />
                        <div>
                            <p className="text-[10px] text-gray-500 uppercase font-semibold tracking-wider">Actual</p>
                            <p className="text-xs font-bold text-gray-900">{progressStats.totalActual.toFixed(2)}%</p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-1 bg-gray-100 p-0.5 rounded-sm border border-gray-200">
                    {(['day', 'week', 'month'] as ViewMode[]).map((mode) => (
                        <button key={mode} onClick={() => handleViewModeChange(mode)}
                            className={`px-3 py-1 text-[11px] font-medium rounded-[2px] transition-all capitalize ${viewMode === mode ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-900'
                                }`}>
                            {mode === 'day' ? 'วัน' : mode === 'week' ? 'สัปดาห์' : 'เดือน'}
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-1">
                    <button onClick={() => setShowSCurve(!showSCurve)}
                        title={showSCurve ? 'ซ่อน S-Curve' : 'แสดง S-Curve'}
                        className={`p-1.5 rounded-sm border transition-colors ${showSCurve ? 'bg-gray-100 border-gray-300 text-gray-800' : 'bg-white border-gray-300 text-gray-500'}`}>
                        <TrendingUp className="w-4 h-4" />
                    </button>
                    <button onClick={() => setShowDates(!showDates)}
                        className={`p-1.5 rounded-sm border transition-colors ${showDates ? 'bg-gray-100 border-gray-300 text-gray-800' : 'bg-white border-gray-300 text-gray-500'}`}>
                        {showDates ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                    <div className="h-5 w-px bg-gray-300 mx-1"></div>
                    <button onClick={() => navigate('prev')} className="p-1.5 hover:bg-gray-50 rounded-sm text-gray-600 border border-gray-300">
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 rounded-sm border border-gray-300">
                        วันนี้
                    </button>
                    <button onClick={() => navigate('next')} className="p-1.5 hover:bg-gray-50 rounded-sm text-gray-600 border border-gray-300">
                        <ChevronRight className="w-4 h-4" />
                    </button>
                    <button onClick={handleExport} className="p-1.5 hover:bg-gray-50 rounded-sm text-gray-600 border border-gray-300" title="Export CSV">
                        <Download className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 min-h-0 w-full relative">
                <div ref={scrollContainerRef} className="absolute inset-0 overflow-auto custom-scrollbar">
                    <div className="min-w-max flex flex-col">

                        {/* Header Row (Sticky Top) */}
                        <div className="sticky top-0 z-30 flex bg-white border-b border-gray-300">
                            {/* Sticky Left Corner */}
                            <div className="sticky left-0 z-40 bg-gray-50 border-r border-gray-300 flex items-end pb-2 px-4 shadow-[1px_0_0px_rgba(0,0,0,0.05)] h-12"
                                style={{ width: `${stickyWidth}px`, minWidth: `${stickyWidth}px` }}>
                                <div className="flex-1 text-[11px] font-bold text-gray-800 uppercase tracking-wide">Task Name</div>
                                {showDates && (
                                    <>
                                        <div className="w-20 text-right text-[11px] font-bold text-gray-800 uppercase tracking-wide">Cost</div>
                                        <div className="w-14 text-right text-[11px] font-bold text-gray-800 uppercase tracking-wide">Weight</div>
                                        <div className="w-16 text-right text-[11px] font-bold text-gray-800 uppercase tracking-wide">Q'ty</div>
                                        <div className="w-24 text-right text-[11px] font-bold text-gray-800 uppercase tracking-wide">Period</div>
                                    </>
                                )}
                                <div className="w-20 text-right text-[11px] font-bold text-gray-800 uppercase tracking-wide">%Prog</div>
                            </div>

                            {/* Timeline Headers */}
                            <div className="flex flex-col h-12 bg-white relative">
                                <div className="flex h-6 border-b border-gray-300">
                                    {timeline.groups.map((group, idx) => {
                                        let width = 0;
                                        if (viewMode === 'day') {
                                            width = eachDayOfInterval({ start: startOfMonth(group), end: endOfMonth(group) }).length * config.cellWidth;
                                        } else if (viewMode === 'week') {
                                            width = 4.35 * config.cellWidth;
                                        } else {
                                            width = 12 * config.cellWidth;
                                            if (viewMode === 'month') {
                                                const monthsInYear = timeline.items.filter(m => m.getFullYear() === group.getFullYear()).length;
                                                width = monthsInYear * config.cellWidth;
                                            }
                                        }

                                        return (
                                            <div key={idx} className="flex items-center justify-center px-1 text-[10px] font-bold text-gray-700 bg-gray-100 border-r border-gray-300 truncate"
                                                style={{ width: `${width}px`, minWidth: `${width}px` }}>
                                                {format(group, timeline.groupFormat, { locale: th })}
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="flex h-6">
                                    {timeline.items.map((item, idx) => {
                                        const isTodayDay = viewMode === 'day' && isToday(item);
                                        const isWeekendDay = viewMode === 'day' && isWeekend(item);

                                        let label = '';
                                        if (viewMode === 'day') label = format(item, 'd');
                                        else if (viewMode === 'week') label = format(item, 'w');
                                        else label = format(item, 'MMM', { locale: th });

                                        return (
                                            <div key={idx} className={`flex-shrink-0 border-r border-gray-200 flex items-center justify-center text-[10px] ${isTodayDay ? 'bg-blue-600 text-white font-bold' : isWeekendDay ? 'bg-gray-50 text-gray-500' : 'text-gray-600'
                                                }`} style={{ width: config.cellWidth }}>
                                                {label}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* S-Curve Overlay Area */}
                        {showSCurve && scurveData.length > 0 && (
                            <div className="flex border-b border-gray-300 bg-gray-50">
                                <div className="sticky left-0 z-20 bg-gray-50 border-r border-gray-300 px-4 py-1 shadow-[1px_0_0px_rgba(0,0,0,0.05)]"
                                    style={{ width: `${stickyWidth}px`, minWidth: `${stickyWidth}px` }}>
                                    <div className="flex items-center justify-between h-full">
                                        <div className="text-xs font-bold text-gray-700 flex items-center gap-2">
                                            <TrendingUp className="w-4 h-4 text-blue-500" />
                                            S-Curve
                                        </div>
                                        <div className="flex items-center gap-3 text-[10px]">
                                            <div className="flex items-center gap-1">
                                                <div className="w-3 h-0.5 bg-blue-500"></div>
                                                <span className="text-gray-600">Plan</span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <div className="w-3 h-0.5 bg-green-500"></div>
                                                <span className="text-gray-600">Actual</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="relative h-16" style={{ width: `${timeline.items.length * config.cellWidth}px` }}>
                                    <svg className="absolute inset-0 w-full h-full overflow-visible" preserveAspectRatio="none">
                                        {/* Plan line */}
                                        <path
                                            d={generateSCurvePath('plan')}
                                            fill="none"
                                            stroke="#3b82f6"
                                            strokeWidth="2"
                                            strokeDasharray="4 2"
                                            opacity="0.7"
                                        />
                                        {/* Actual line */}
                                        <path
                                            d={generateSCurvePath('actual')}
                                            fill="none"
                                            stroke="#22c55e"
                                            strokeWidth="2.5"
                                        />
                                    </svg>
                                    {/* Y-axis labels */}
                                    <div className="absolute left-2 top-1 text-xs text-gray-500">100%</div>
                                    <div className="absolute left-2 bottom-1 text-xs text-gray-500">0%</div>
                                </div>
                            </div>
                        )}

                        {/* Task Rows */}
                        <div className="relative">
                            {/* Global Today Overlay */}
                            {(() => {
                                const todayOffset = differenceInDays(new Date(), timeRange.start);
                                let leftPx = 0;
                                if (viewMode === 'day') leftPx = todayOffset * config.cellWidth;
                                else if (viewMode === 'week') leftPx = (todayOffset / 7) * config.cellWidth;
                                else leftPx = (todayOffset / 30.44) * config.cellWidth;

                                return (
                                    <div className="absolute top-0 bottom-0 z-10 pointer-events-none" style={{ left: `${stickyWidth + leftPx}px` }}>
                                        <div className="h-full w-px bg-orange-500"></div>
                                    </div>
                                );
                            })()}
                            {Object.entries(groupedTasks).map(([category, catTasks]) => {
                                const isCollapsed = collapsedCategories.has(category);
                                const categorySummary = getCategorySummary(catTasks, category);

                                return (
                                    <div key={category}>
                                        {/* Category Header - Collapsible */}
                                        <div
                                            className="flex bg-gray-100 border-b border-gray-300 cursor-pointer hover:bg-gray-200/70 transition-colors h-8"
                                            onClick={() => toggleCategory(category)}
                                        >
                                            <div className="sticky left-0 z-20 bg-gray-100 border-r border-gray-300 px-4 shadow-[1px_0_0px_rgba(0,0,0,0.05)] flex items-center gap-2"
                                                style={{ width: `${stickyWidth}px`, minWidth: `${stickyWidth}px` }}>
                                                <button className="p-0.5 hover:bg-gray-300 rounded-sm transition-colors text-gray-600">
                                                    {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                                </button>
                                                <span className="flex-1 text-[11px] font-bold text-gray-800 uppercase tracking-wide">{category}</span>
                                                <span className="text-[10px] text-gray-600 bg-gray-200 px-1.5 rounded-sm">{categorySummary.count}</span>
                                                {showDates && (
                                                    <>
                                                        <span className="w-20 text-right text-[11px] font-semibold text-gray-900 font-mono">
                                                            {categorySummary.totalCost.toLocaleString()}
                                                        </span>
                                                        <span className="w-14 text-right text-[11px] font-bold text-gray-900 font-mono">
                                                            {categorySummary.totalWeight.toFixed(1)}%
                                                        </span>
                                                        <span className="w-16"></span>
                                                        <span className="w-24 text-right text-[10px] text-gray-600 font-mono">
                                                            {categorySummary.dateRange ? (
                                                                <>
                                                                    {format(categorySummary.dateRange.start, 'd/MM')} - {format(categorySummary.dateRange.end, 'd/MM')}
                                                                    <span className="text-gray-500 ml-1">({categorySummary.dateRange.days}d)</span>
                                                                </>
                                                            ) : '-'}
                                                        </span>
                                                    </>
                                                )}
                                                <span className="w-20 text-right text-[11px] font-bold text-blue-700 font-mono">
                                                    {categorySummary.avgProgress.toFixed(0)}%
                                                </span>
                                            </div>
                                            {/* Category Summary Bar on Chart */}
                                            <div className="flex-1 bg-gray-50/30 relative" style={{ width: `${timeline.items.length * config.cellWidth}px` }}>
                                                {categorySummary.dateRange && (
                                                    <div
                                                        className="absolute h-3 top-[10px] rounded-sm bg-gray-400/60 border border-gray-500/50"
                                                        style={getCategoryBarStyle(categorySummary.dateRange)}
                                                    >
                                                        {/* Progress overlay */}
                                                        <div
                                                            className="absolute left-0 top-0 bottom-0 bg-blue-500/50 rounded-sm"
                                                            style={{ width: `${categorySummary.avgProgress}%` }}
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
                                                            <div className="sticky left-0 z-20 bg-white group-hover:bg-gray-50 border-r border-gray-300 flex items-center px-4 shadow-[1px_0_0px_rgba(0,0,0,0.05)]"
                                                                style={{ width: `${stickyWidth}px`, minWidth: `${stickyWidth}px` }}>

                                                                {/* Indent + Collapse toggle */}
                                                                <div className="flex items-center" style={{ paddingLeft: `${level * 16}px` }}>
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

                                                                    {/* Child count badge */}
                                                                    {tHasChildren && (
                                                                        <span className="text-[9px] text-gray-500 bg-gray-200 px-1 rounded-sm ml-0.5 mr-1">
                                                                            {childTasks.length}
                                                                        </span>
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

                                                                <div className={`flex-1 truncate text-xs font-medium transition-colors ${level > 0 ? 'text-gray-600 pl-1 border-l border-gray-300' : 'text-gray-700'}`} title={t.name}>
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

                                                                {showDates && (
                                                                    <>
                                                                        <div className="w-20 text-right text-xs text-gray-600 font-medium font-mono">
                                                                            {t.cost ? t.cost.toLocaleString() : '-'}
                                                                        </div>
                                                                        <div className="w-14 text-right text-xs text-gray-600 font-medium font-mono">
                                                                            {tWeight.toFixed(2)}%
                                                                        </div>
                                                                        <div className="w-16 text-right text-xs text-gray-600 font-medium font-mono">
                                                                            {t.quantity || '-'}
                                                                        </div>
                                                                        <div className="w-24 text-right text-[10px] text-gray-500 font-mono">
                                                                            {format(parseISO(t.planStartDate), 'd/MM')} - {format(parseISO(t.planEndDate), 'd/MM')}
                                                                        </div>
                                                                    </>
                                                                )}
                                                                <div className="w-20 flex items-center justify-end gap-2 px-2">
                                                                    <span className={`text-xs font-bold font-mono ${Number(t.progress) === 100 ? 'text-green-600' : Number(t.progress) > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                                                                        {Number(t.progress)}%
                                                                    </span>
                                                                    {onOpenProgressModal && (
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.preventDefault();
                                                                                e.stopPropagation();
                                                                                onOpenProgressModal(t.id);
                                                                            }}
                                                                            className="p-1 hover:bg-blue-100 bg-white border border-gray-200 rounded text-blue-600 transition-colors shadow-sm"
                                                                            title="Update Progress"
                                                                        >
                                                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                                <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
                                                                            </svg>
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            <div className="relative" style={{ width: `${timeline.items.length * config.cellWidth}px` }}>
                                                                <div className="absolute inset-0 flex pointer-events-none">
                                                                    {timeline.items.map((item, idx) => (
                                                                        <div key={idx} className={`flex-shrink-0 border-r border-dashed border-gray-200 h-full ${viewMode === 'day' && isWeekend(item) ? 'bg-gray-50' : ''
                                                                            } ${viewMode === 'day' && isToday(item) ? 'bg-blue-50/20' : ''}`}
                                                                            style={{ width: config.cellWidth }} />
                                                                    ))}

                                                                </div>

                                                                <div
                                                                    className={`absolute h-4 top-[8px] rounded-[2px] border group/bar
                                                                        ${dragState?.taskId === t.id && dragState?.barType === 'plan' ? 'z-50 border-blue-600 cursor-grabbing' : 'cursor-grab border-blue-600'}
                                                                        ${isUpdating && (dragState?.taskId === t.id || (dragState?.affectedTaskIds && dragState.affectedTaskIds.has(t.id)))
                                                                            ? 'bg-[linear-gradient(45deg,rgba(255,255,255,0.15)25%,transparent_25%,transparent_50%,rgba(255,255,255,0.15)50%,rgba(255,255,255,0.15)75%,transparent_75%,transparent)] bg-[length:10px_10px] bg-blue-500 animate-pulse'
                                                                            : 'bg-blue-500 hover:bg-blue-600'} 
                                                                        transition-colors
                                                                    `}
                                                                    style={getBarStyle(t, 'plan')}
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

                                                                {Number(t.progress) > 0 && (
                                                                    <div
                                                                        className={`absolute h-2 top-[12px] z-10 rounded-[1px] group/actual-bar
                                                                            ${dragState?.taskId === t.id && dragState?.barType === 'actual'
                                                                                ? 'z-50 cursor-grabbing bg-green-500'
                                                                                : 'cursor-grab bg-green-400 hover:bg-green-500'}
                                                                            ${isUpdating && dragState?.taskId === t.id && dragState?.barType === 'actual'
                                                                                ? 'bg-[linear-gradient(45deg,rgba(255,255,255,0.15)25%,transparent_25%,transparent_50%,rgba(255,255,255,0.15)50%,rgba(255,255,255,0.15)75%,transparent_75%,transparent)] bg-[length:10px_10px] bg-green-500 animate-pulse'
                                                                                : ''}
                                                                            transition-colors
                                                                        `}
                                                                        style={getBarStyle(t, 'actual')}
                                                                        onMouseDown={(e) => startDrag(e, t, 'move', 'actual')}
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
                                                                )}
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

                                            return renderTaskRow(task, 0);
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
