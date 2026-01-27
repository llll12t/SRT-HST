'use client';

import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Task } from '@/types/construction';
import { format, parseISO, differenceInDays, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval, eachYearOfInterval, startOfMonth, endOfMonth, startOfYear, endOfYear, addMonths, subMonths, isSameDay, differenceInMonths, isBefore, isAfter, addDays } from 'date-fns';

import { ViewMode, DragState, RowDragState, VisibleColumns, GanttConfig, DateRange, ColorMenuConfig } from './types';
import { ChevronRight, ChevronDown, Plus, AlertTriangle, X, CornerDownRight, Folder, GripVertical } from 'lucide-react';
import { DependencyLines } from './DependencyLines';
import { CategoryRow } from './CategoryRow';
import { TaskRow } from './TaskRow';
import { getCategorySummary, getCategoryBarStyle, getActualDates, getBarStyle, isTaskDescendant, isWeekend, isToday, formatDateRange } from './utils';
import GanttToolbar from './GanttToolbar';
import TimelineHeader from './TimelineHeader';
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
    onAddTaskToCategory?: (category: string, subcategory?: string, subsubcategory?: string) => void;
    updatingTaskIds?: Set<string>;
}

export default function GanttChart({ tasks: propTasks, startDate = '2024-09-01', endDate = '2025-04-30', title, viewMode: controlledViewMode, onViewModeChange, onTaskUpdate, onOpenProgressModal, onAddSubTask, onAddTaskToCategory, updatingTaskIds }: GanttChartProps) {
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
    const [collapsedSubcategories, setCollapsedSubcategories] = useState<Set<string>>(new Set());
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
    // Track specific IDs being updated for granular loading state
    // Use props if provided, otherwise internal (though page provides it now)
    const effectiveLoadingIds = updatingTaskIds || new Set<string>();

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

    const toggleSubcategory = (id: string) => {
        setCollapsedSubcategories(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
    };

    // Category/Subcategory Drag & Drop State
    const [categoryOrder, setCategoryOrder] = useState<string[]>([]);
    const [categoryDragState, setCategoryDragState] = useState<{ id: string; type: 'category' | 'subcategory' | 'subsubcategory' | 'task' } | null>(null);

    // Category Drag Handlers
    const handleCategoryDragStart = (e: React.DragEvent, category: string) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', category);
        setCategoryDragState({ id: category, type: 'category' });
    };

    const handleCategoryDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleCategoryDrop = async (e: React.DragEvent, targetCategory: string) => {
        e.preventDefault();
        const sourceId = categoryDragState?.id;
        const dragType = categoryDragState?.type;
        setCategoryDragState(null);

        if (!sourceId) return;

        // Handle Category Reordering
        if (dragType === 'category') {
            if (sourceId === targetCategory) return;

            const allCats = Object.keys(groupedTasks);
            let currentOrder = categoryOrder.length > 0 ? [...categoryOrder] : [...allCats];

            allCats.forEach(c => {
                if (!currentOrder.includes(c)) currentOrder.push(c);
            });

            const sourceIndex = currentOrder.indexOf(sourceId);
            const targetIndex = currentOrder.indexOf(targetCategory);

            if (sourceIndex > -1 && targetIndex > -1) {
                currentOrder.splice(sourceIndex, 1);
                currentOrder.splice(targetIndex, 0, sourceId);
                setCategoryOrder(currentOrder);
            }
            return;
        }

        // Handle Task -> Category Drop (Move task to target category)
        if (dragType === 'task' && onTaskUpdate) {
            const sourceTask = tasks.find(t => t.id === sourceId);
            if (!sourceTask) return;

            // Move task to target category (clearing subcategory/subsubcategory)
            if (sourceTask.category !== targetCategory) {
                await onTaskUpdate(sourceId, {
                    category: targetCategory,
                    subcategory: '',
                    subsubcategory: '',
                    order: 999999
                });
            }
        }

        // Handle Subcategory/Subsubcategory -> Category Drop (Promote or Move)
        if ((dragType === 'subcategory' || dragType === 'subsubcategory') && onTaskUpdate) {
            const parts = sourceId.split('::');
            const sourceCat = parts[0];
            const sourceSub = parts[1] || '';
            const sourceSubSub = parts[2] || '';

            // 1. Move "Subcategory" to another "Category"
            if (dragType === 'subcategory' && sourceSub) {
                if (sourceCat === targetCategory) return; // Same category, do nothing

                // Find all tasks in this subcategory
                const tasksToMove = tasks.filter(t => t.category === sourceCat && t.subcategory === sourceSub);

                // Update all tasks
                await Promise.all(tasksToMove.map(t => onTaskUpdate(t.id, {
                    category: targetCategory,
                    // subcategory remains the same
                    // subsubcategory remains the same
                })));
            }

            // 2. Promote "Subsubcategory" to "Subcategory" (Level 3 -> Level 2)
            if (dragType === 'subsubcategory' && sourceSubSub) {
                // If dropped on same category or different one, it is promoted to Subcategory of that target
                // Logic: subcategory -> sourceSubSub, subsubcategory -> '' (cleared)

                const tasksToMove = tasks.filter(t =>
                    t.category === sourceCat &&
                    t.subcategory === sourceSub &&
                    t.subsubcategory === sourceSubSub
                );

                await Promise.all(tasksToMove.map(t => onTaskUpdate(t.id, {
                    category: targetCategory,
                    subcategory: sourceSubSub, // Promote name to Level 2
                    subsubcategory: ''
                })));
            }
        }
    };

    // Subcategory Drag Handlers (reuse similar pattern)
    const handleSubcategoryDragStart = (e: React.DragEvent, subcatKey: string, type: 'subcategory' | 'subsubcategory') => {
        e.stopPropagation();
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', subcatKey);
        setCategoryDragState({ id: subcatKey, type });
    };

    const handleSubcategoryDrop = async (e: React.DragEvent, targetKey: string) => {
        e.preventDefault();
        e.stopPropagation();
        const sourceId = categoryDragState?.id;
        const dragType = categoryDragState?.type;
        setCategoryDragState(null);

        if (!sourceId || !onTaskUpdate) return;

        // Handle Task -> Subcategory Drop
        if (dragType === 'task') {
            const sourceTask = tasks.find(t => t.id === sourceId);
            if (!sourceTask) return;

            // Parse targetKey "Category::Subcategory" or "Category::Subcategory::SubSubcategory"
            const parts = targetKey.split('::');
            const targetCat = parts[0];
            const targetSubcat = parts.length > 1 ? parts[1] : '';
            const targetSubSubcat = parts.length > 2 ? parts[2] : '';

            // Don't update if nothing changed
            if (sourceTask.category === targetCat &&
                (sourceTask.subcategory || '') === targetSubcat &&
                (sourceTask.subsubcategory || '') === targetSubSubcat) {
                return;
            }

            await onTaskUpdate(sourceId, {
                category: targetCat,
                subcategory: targetSubcat,
                subsubcategory: targetSubSubcat,
                order: 999999
            });
        }

        // Handle Subsubcategory -> Subcategory Drop (Move L3 to new L2 parent)
        if (dragType === 'subsubcategory' && onTaskUpdate) {
            const parts = sourceId.split('::');
            const sourceCat = parts[0];
            const sourceSub = parts[1] || '';
            const sourceSubSub = parts[2] || '';

            // Target
            const targetParts = targetKey.split('::');
            const targetCat = targetParts[0];
            const targetSub = targetParts[1];

            // If dropped on same parent, do nothing
            if (sourceCat === targetCat && sourceSub === targetSub) return;

            // Find tasks
            const tasksToMove = tasks.filter(t =>
                t.category === sourceCat &&
                t.subcategory === sourceSub &&
                t.subsubcategory === sourceSubSub
            );

            await Promise.all(tasksToMove.map(t => onTaskUpdate(t.id, {
                category: targetCat,
                subcategory: targetSub,
                subsubcategory: sourceSubSub // Keep name, just change parent
            })));
        }

        // Handle Subcategory -> Subcategory Drop (Demote L2 to L3 under new parent)
        if (dragType === 'subcategory' && onTaskUpdate) {
            const parts = sourceId.split('::');
            const sourceCat = parts[0];
            const sourceSub = parts[1] || '';

            // Target
            const targetParts = targetKey.split('::');
            const targetCat = targetParts[0];
            // If dropping onto a subsubcategory header, we use its parent sub as target
            // But usually this handler is for droppable headers. The key tells us.
            // If targetKey is "Cat::Sub", then targetSub is "Sub".
            const targetSub = targetParts[1];

            // Avoid self-drop or logical circle if needed (though drag disabled usually prevents)
            // If accidentally dropped on itself
            if (sourceCat === targetCat && sourceSub === targetSub) return;

            // Check if dropped onto a level 3 item (targetParts length > 2)?
            // Usually we drop onto the subcategory header "Cat::Sub". 
            // If we drop onto "Cat::Sub", we want SourceSub to become a child of "Sub".

            const tasksToMove = tasks.filter(t => t.category === sourceCat && t.subcategory === sourceSub);

            await Promise.all(tasksToMove.map(t => onTaskUpdate(t.id, {
                category: targetCat,
                subcategory: targetSub,
                subsubcategory: sourceSub // Previous Sub name becomes Level 3 name
            })));
        }
    };

    // Track if task is being dragged (for row drag)
    const handleTaskRowDragStart = (e: React.DragEvent, task: Task) => {
        handleRowDragStart(e, task);
        setCategoryDragState({ id: task.id, type: 'task' });
    };

    const handleTaskRowDragEnd = () => {
        handleRowDragEnd();
        setCategoryDragState(null);
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
        const structure: Record<string, {
            tasks: Task[]; // Direct tasks in Category
            subcategories: Record<string, {
                tasks: Task[]; // Direct tasks in Subcategory
                subsubcategories: Record<string, Task[]>; // Level 3
            }>;
        }> = {};

        // Get all ROOT tasks (no parent - null or undefined) first
        const rootTasks = tasks.filter(t => !t.parentTaskId || t.parentTaskId === null);

        rootTasks.forEach(task => {
            const cat = task.category || 'Uncategorized';
            const subcat = task.subcategory || '';
            const subsubcat = task.subsubcategory || '';

            // Init Category
            if (!structure[cat]) {
                structure[cat] = {
                    tasks: [],
                    subcategories: {}
                };
            }

            if (subcat) {
                // Init Subcategory
                if (!structure[cat].subcategories[subcat]) {
                    structure[cat].subcategories[subcat] = {
                        tasks: [],
                        subsubcategories: {}
                    };
                }

                if (subsubcat) {
                    // Level 3
                    if (!structure[cat].subcategories[subcat].subsubcategories[subsubcat]) {
                        structure[cat].subcategories[subcat].subsubcategories[subsubcat] = [];
                    }
                    structure[cat].subcategories[subcat].subsubcategories[subsubcat].push(task);
                } else {
                    // Level 2 direct task
                    structure[cat].subcategories[subcat].tasks.push(task);
                }
            } else {
                // Level 1 direct task
                structure[cat].tasks.push(task);
            }
        });

        return structure;
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
                subcategory: targetTask.subcategory || '',
                subsubcategory: targetTask.subsubcategory || '',
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
                category: targetTask.category,
                subcategory: targetTask.subcategory || '',
                subsubcategory: targetTask.subsubcategory || ''
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



    // Compute visibleRowMap for DependencyLines
    const visibleRowMap = useMemo(() => {
        const map = new Map<string, number>();
        let currentRow = 0;

        Object.entries(groupedTasks).forEach(([category, catData]) => {
            currentRow++; // Category Header
            if (!collapsedCategories.has(category)) {

                const processTaskList = (list: Task[]) => {
                    list.forEach(t => {
                        map.set(t.id, currentRow);
                        currentRow++;

                        // Check for expanded children
                        const hasChildren = tasks.some(child => child.parentTaskId === t.id);
                        if (hasChildren && !collapsedTasks.has(t.id)) {
                            const children = tasks.filter(child => child.parentTaskId === t.id);
                            processTaskList(children);
                        }
                    });
                };

                // Subcategories
                Object.entries(catData.subcategories).forEach(([subcat, subData]) => {
                    const uniqueSubcatId = `${category}::${subcat}`;
                    currentRow++; // Subcategory Header

                    if (!collapsedSubcategories.has(uniqueSubcatId)) {
                        // Sub-subcategories
                        Object.entries(subData.subsubcategories).forEach(([subsub, subsubTasks]) => {
                            const uniqueSubSubId = `${uniqueSubcatId}::${subsub}`;
                            currentRow++; // Sub-subcategory Header

                            if (!collapsedSubcategories.has(uniqueSubSubId)) {
                                processTaskList(subsubTasks);
                            }
                        });

                        // Direct Tasks
                        processTaskList(subData.tasks);
                    }
                });

                // Direct Tasks
                processTaskList(catData.tasks);
            }
        });
        return map;
    }, [groupedTasks, collapsedCategories, collapsedSubcategories, collapsedTasks, tasks]);

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
                                    <div className="absolute top-0 bottom-0 z-10 pointer-events-none" style={{ left: `${stickyWidth + leftPx}px` }}>
                                        <div className="h-full w-px bg-orange-500"></div>
                                    </div>
                                );
                            })()}

                            {/* Dependency Lines SVG Layer */}
                            {showDependencies && (
                                <DependencyLines
                                    tasks={tasks}
                                    visibleRowMap={visibleRowMap}
                                    config={config}
                                    viewMode={viewMode}
                                    timeRange={timeRange}
                                    stickyWidth={stickyWidth}
                                    onDeleteDependency={(taskId, predId) => {
                                        setModalConfig({
                                            isOpen: true,
                                            title: 'ลบการเชื่อมโยงงาน',
                                            message: 'คุณต้องการลบการเชื่อมโยงนี้ใช่หรือไม่?',
                                            type: 'confirm',
                                            onConfirm: () => {
                                                const t = tasks.find(x => x.id === taskId);
                                                if (t && onTaskUpdate) {
                                                    const newPredecessors = t.predecessors?.filter(p => p !== predId) || [];
                                                    onTaskUpdate(t.id, { predecessors: newPredecessors });
                                                }
                                            }
                                        });
                                    }}
                                />
                            )}

                            {Object.keys(groupedTasks)
                                .sort((a, b) => {
                                    if (categoryOrder.length === 0) return 0;
                                    const ia = categoryOrder.indexOf(a);
                                    const ib = categoryOrder.indexOf(b);
                                    if (ia === -1) return 1;
                                    if (ib === -1) return -1;
                                    return ia - ib;
                                })
                                .map((category) => {
                                    const catData = groupedTasks[category];
                                    const isCollapsed = collapsedCategories.has(category);
                                    // Combine all tasks for summary


                                    return (
                                        <div key={category}>
                                            {/* Category Header - Rendered as Level 0 Group Node */}
                                            <CategoryRow
                                                category={category}
                                                catData={catData}
                                                collapsedCategories={collapsedCategories}
                                                toggleCategory={toggleCategory}
                                                categoryColors={categoryColors}
                                                setActiveColorMenu={setActiveColorMenu}
                                                onAddTaskToCategory={onAddTaskToCategory}
                                                visibleColumns={visibleColumns}
                                                stickyWidth={stickyWidth}
                                                timeline={timeline}
                                                config={config}
                                                viewMode={viewMode}
                                                timeRange={timeRange}
                                                getTaskWeight={getTaskWeight}
                                                onCategoryDragStart={handleCategoryDragStart}
                                                onCategoryDragOver={handleCategoryDragOver}
                                                isDragging={categoryDragState?.id === category && categoryDragState?.type === 'category'}
                                                loadingIds={effectiveLoadingIds} // Pass loading state
                                            />

                                            {/* Spacer to replace original div wrapper if needed or just nothing since CategoryRow returns a div */}



                                            {/* Task Items - Hierarchical rendering */}
                                            {
                                                !isCollapsed && (() => {

                                                    // Recursively render task and its children
                                                    const renderTaskTree = (t: Task, level: number) => {
                                                        const children = getChildTasks(t.id);
                                                        // Check if this task is collapsed (visual state for children)
                                                        const isExpanded = !collapsedTasks.has(t.id);

                                                        return (
                                                            <React.Fragment key={t.id}>
                                                                <TaskRow
                                                                    task={t}
                                                                    level={level}
                                                                    tasks={tasks}
                                                                    config={config}
                                                                    viewMode={viewMode}
                                                                    timeRange={timeRange}
                                                                    visibleColumns={visibleColumns}
                                                                    stickyWidth={stickyWidth}
                                                                    timeline={timeline}
                                                                    collapsedTasks={collapsedTasks}
                                                                    dragState={dragState}
                                                                    rowDragState={rowDragState}
                                                                    dropTargetId={dropTargetId}
                                                                    dropPosition={dropPosition}
                                                                    isUpdating={isUpdating}
                                                                    showDependencies={showDependencies}
                                                                    dependencySource={dependencySource}
                                                                    getTaskWeight={getTaskWeight}
                                                                    hasChildren={hasChildren}
                                                                    getChildTasks={getChildTasks}
                                                                    onTaskUpdate={onTaskUpdate}
                                                                    onAddSubTask={onAddSubTask}
                                                                    toggleTaskCollapse={toggleTaskCollapse}
                                                                    handleRowDragStart={handleRowDragStart}
                                                                    handleRowDragOver={handleRowDragOver}
                                                                    handleRowDragLeave={handleRowDragLeave}
                                                                    handleRowDrop={handleRowDrop}
                                                                    handleRowDragEnd={handleRowDragEnd}
                                                                    handleRemoveFromParent={handleRemoveFromParent}
                                                                    setActiveColorMenu={setActiveColorMenu}
                                                                    handleDependencyClick={handleDependencyClick}
                                                                    setModalConfig={setModalConfig}
                                                                    startDrag={startDrag}
                                                                    loadingIds={effectiveLoadingIds}
                                                                />
                                                                {/* Render Children if Expanded */}
                                                                {isExpanded && children.length > 0 && (
                                                                    children.map(child => renderTaskTree(child, level + 1))
                                                                )}
                                                            </React.Fragment>
                                                        );
                                                    };

                                                    return (
                                                        <>
                                                            {/* Subcategories (Level 1 Header, Level 2 Contents) */}
                                                            {Object.entries(catData.subcategories).map(([subcat, subData]) => {
                                                                const uniqueSubcatId = `${category}::${subcat}`;
                                                                const isSubCollapsed = collapsedSubcategories.has(uniqueSubcatId);
                                                                const subcatColor = categoryColors[uniqueSubcatId] || '#f59e0b'; // Default Amber

                                                                // Combine tasks for summary (include sub-sub tasks)
                                                                const summaryTasks = [...subData.tasks, ...Object.values(subData.subsubcategories).flat()];

                                                                return (
                                                                    <div key={uniqueSubcatId}>
                                                                        {/* Subcategory Header */}
                                                                        <div
                                                                            className={`flex bg-gray-50/50 border-b border-dashed border-gray-200 h-8 group cursor-pointer hover:bg-gray-100/50 transition-colors ${categoryDragState?.id === uniqueSubcatId && categoryDragState?.type === 'subcategory' ? 'opacity-40 bg-blue-50' : ''}`}
                                                                            onClick={() => toggleSubcategory(uniqueSubcatId)}
                                                                            draggable
                                                                            onDragStart={(e) => handleSubcategoryDragStart(e, uniqueSubcatId, 'subcategory')}
                                                                            onDragOver={handleCategoryDragOver}
                                                                            onDrop={(e) => handleSubcategoryDrop(e, uniqueSubcatId)}
                                                                        >
                                                                            <div className="sticky left-0 z-[60] bg-gray-50 group-hover:bg-gray-100 border-r border-gray-300 px-2 flex items-center gap-1"
                                                                                style={{ width: `${stickyWidth}px`, minWidth: `${stickyWidth}px`, paddingLeft: '24px' }}>

                                                                                {/* Drag Handle */}
                                                                                <div
                                                                                    className="cursor-move text-gray-300 hover:text-gray-500 p-0.5"
                                                                                    onClick={(e) => e.stopPropagation()}
                                                                                >
                                                                                    <GripVertical className="w-3 h-3" />
                                                                                </div>

                                                                                {/* Collapse Button */}
                                                                                <div className="w-4 flex justify-center shrink-0">
                                                                                    <button className="p-0.5 hover:bg-gray-200 rounded-sm transition-colors text-gray-400">
                                                                                        {isSubCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                                                                    </button>
                                                                                </div>

                                                                                {/* Color Dot for Subcat */}
                                                                                <button
                                                                                    className="w-2.5 h-2.5 rounded-full border border-gray-300 hover:scale-110 transition-transform shadow-sm flex-shrink-0"
                                                                                    style={{ backgroundColor: subcatColor }}
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        const rect = e.currentTarget.getBoundingClientRect();
                                                                                        setActiveColorMenu({
                                                                                            id: uniqueSubcatId,
                                                                                            type: 'category',
                                                                                            top: rect.bottom + window.scrollY,
                                                                                            left: rect.left + window.scrollX
                                                                                        });
                                                                                    }}
                                                                                    title="Change Subcategory Color"
                                                                                />

                                                                                <div className="flex-1 truncate text-xs font-bold text-gray-700 flex items-center group/subcat-header">
                                                                                    {subcat}
                                                                                    <span className="ml-2 text-[9px] text-gray-500 font-normal bg-gray-200 px-1.5 rounded-full">{summaryTasks.length}</span>
                                                                                    {onAddTaskToCategory && (
                                                                                        <button
                                                                                            className="ml-2 p-0.5 hover:bg-amber-100 rounded-sm transition-colors text-amber-500 opacity-0 group-hover/subcat-header:opacity-100"
                                                                                            onClick={(e) => { e.stopPropagation(); onAddTaskToCategory(category, subcat); }}
                                                                                            title="Add Task to Subcategory"
                                                                                        >
                                                                                            <Plus className="w-3 h-3" />
                                                                                        </button>
                                                                                    )}
                                                                                </div>

                                                                                {/* Subcategory Summary Columns */}
                                                                                {visibleColumns.cost && (
                                                                                    <div className="w-20 text-right text-xs text-gray-600 font-medium font-mono shrink-0">
                                                                                        {getCategorySummary(summaryTasks, getTaskWeight).totalCost.toLocaleString()}
                                                                                    </div>
                                                                                )}
                                                                                {visibleColumns.weight && (
                                                                                    <div className="w-14 text-right text-xs text-gray-600 font-medium font-mono shrink-0">
                                                                                        {getCategorySummary(summaryTasks, getTaskWeight).totalWeight.toFixed(2)}%
                                                                                    </div>
                                                                                )}
                                                                                {visibleColumns.quantity && (
                                                                                    <div className="w-16 shrink-0"></div>
                                                                                )}
                                                                                {visibleColumns.period && (
                                                                                    <div className="w-[110px] text-right text-[10px] text-gray-500 font-mono shrink-0">
                                                                                        {getCategorySummary(summaryTasks, getTaskWeight).dateRange ? (
                                                                                            formatDateRange(
                                                                                                getCategorySummary(summaryTasks, getTaskWeight).dateRange!.start,
                                                                                                getCategorySummary(summaryTasks, getTaskWeight).dateRange!.end
                                                                                            )
                                                                                        ) : '-'}
                                                                                    </div>
                                                                                )}
                                                                                {visibleColumns.progress && (
                                                                                    <div className="w-20 flex items-center justify-end shrink-0 gap-1 pr-1">
                                                                                        <span className="w-[45px] text-right text-xs text-amber-600 font-bold font-mono">
                                                                                            {getCategorySummary(summaryTasks, getTaskWeight).avgProgress.toFixed(0)}%
                                                                                        </span>
                                                                                        <div className="w-[22px]"></div>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                            {/* Subcategory Summary Chart Area */}
                                                                            <div className="flex-1 relative" style={{ width: `${timeline.items.length * config.cellWidth}px` }}>
                                                                                <div className="absolute inset-0 flex pointer-events-none">
                                                                                    {timeline.items.map((item, idx) => (
                                                                                        <div key={idx} className={`flex-shrink-0 border-r border-dashed border-gray-200 h-full ${viewMode === 'day' && isWeekend(item) ? 'bg-gray-50/50' : ''}`} style={{ width: config.cellWidth }} />
                                                                                    ))}
                                                                                </div>

                                                                                {/* Render Subcategory Summary Bar */}
                                                                                {(() => {
                                                                                    const subcatSummary = getCategorySummary(summaryTasks, getTaskWeight); // Reuse existing helper since logic is same
                                                                                    if (!subcatSummary.dateRange) return null;

                                                                                    return (
                                                                                        <div
                                                                                            className="absolute h-2.5 top-[11px] rounded-full border border-gray-400/30"
                                                                                            style={{
                                                                                                ...getCategoryBarStyle(subcatSummary.dateRange, viewMode, config, timeRange),
                                                                                                backgroundColor: `${subcatColor}33`,
                                                                                                zIndex: 30
                                                                                            }}
                                                                                        >
                                                                                            <div
                                                                                                className="absolute left-0 top-0 bottom-0 rounded-full"
                                                                                                style={{
                                                                                                    width: `${subcatSummary.avgProgress}%`,
                                                                                                    backgroundColor: subcatColor,
                                                                                                    opacity: 0.8
                                                                                                }}
                                                                                            />
                                                                                        </div>
                                                                                    );
                                                                                })()}
                                                                            </div>
                                                                        </div>

                                                                        {!isSubCollapsed && (
                                                                            <>
                                                                                {/* Sub-Subcategories (Level 2 Header, Level 3 Contents) */}
                                                                                {Object.entries(subData.subsubcategories).map(([subsubcat, subsubTasks]) => {
                                                                                    const uniqueSubSubId = `${uniqueSubcatId}::${subsubcat}`;
                                                                                    const isSubSubCollapsed = collapsedSubcategories.has(uniqueSubSubId);
                                                                                    const subSubColor = categoryColors[uniqueSubSubId] || '#9ca3af'; // Default Gray

                                                                                    return (
                                                                                        <div key={uniqueSubSubId}>
                                                                                            {/* Sub-Subcategory Header */}
                                                                                            <div
                                                                                                className={`flex bg-gray-50/30 border-b border-dashed border-gray-100 h-8 group cursor-pointer hover:bg-gray-100/30 transition-colors ${categoryDragState?.id === uniqueSubSubId && categoryDragState?.type === 'subsubcategory' ? 'opacity-40 bg-blue-50' : ''}`}
                                                                                                onClick={() => toggleSubcategory(uniqueSubSubId)}
                                                                                                draggable
                                                                                                onDragStart={(e) => handleSubcategoryDragStart(e, uniqueSubSubId, 'subsubcategory')}
                                                                                                onDragOver={handleCategoryDragOver}
                                                                                                onDrop={(e) => handleSubcategoryDrop(e, uniqueSubSubId)}
                                                                                            >
                                                                                                <div className="sticky left-0 z-[60] bg-gray-50 group-hover:bg-gray-100 border-r border-gray-300 px-2 flex items-center gap-1"
                                                                                                    style={{ width: `${stickyWidth}px`, minWidth: `${stickyWidth}px`, paddingLeft: '44px' }}>

                                                                                                    {/* Drag Handle */}
                                                                                                    <div
                                                                                                        className="cursor-move text-gray-300 hover:text-gray-500 p-0.5"
                                                                                                        onClick={(e) => e.stopPropagation()}
                                                                                                    >
                                                                                                        <GripVertical className="w-3 h-3" />
                                                                                                    </div>

                                                                                                    {/* Collapse Button */}
                                                                                                    <div className="w-4 flex justify-center shrink-0">
                                                                                                        <button className="p-0.5 hover:bg-gray-200 rounded-sm transition-colors text-gray-400">
                                                                                                            {isSubSubCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                                                                                        </button>
                                                                                                    </div>

                                                                                                    {/* Color Dot for Sub-Subcat */}
                                                                                                    <button
                                                                                                        className="w-2.5 h-2.5 rounded-full border border-gray-300 hover:scale-110 transition-transform shadow-sm flex-shrink-0 mr-2"
                                                                                                        style={{ backgroundColor: subSubColor }}
                                                                                                        onClick={(e) => {
                                                                                                            e.stopPropagation();
                                                                                                            const rect = e.currentTarget.getBoundingClientRect();
                                                                                                            setActiveColorMenu({
                                                                                                                id: uniqueSubSubId,
                                                                                                                type: 'category',
                                                                                                                top: rect.bottom + window.scrollY,
                                                                                                                left: rect.left + window.scrollX
                                                                                                            });
                                                                                                        }}
                                                                                                        title="Change Sub-Subcategory Color"
                                                                                                    />

                                                                                                    <div className="flex-1 truncate text-xs font-semibold text-gray-600 flex items-center">
                                                                                                        {subsubcat}
                                                                                                        <span className="ml-2 text-[8px] text-gray-400 font-normal bg-gray-100 px-1.5 rounded-full">{subsubTasks.length}</span>
                                                                                                        {onAddTaskToCategory && (
                                                                                                            <button
                                                                                                                className="ml-2 p-0.5 hover:bg-amber-100 rounded-sm transition-colors text-amber-500 opacity-0 group-hover:opacity-100"
                                                                                                                onClick={(e) => { e.stopPropagation(); onAddTaskToCategory(category, subcat, subsubcat); }}
                                                                                                                title="Add Task to Sub-Subcategory"
                                                                                                            >
                                                                                                                <Plus className="w-3 h-3" />
                                                                                                            </button>
                                                                                                        )}
                                                                                                    </div>

                                                                                                    {/* Sub-subcat Summary Columns */}
                                                                                                    {visibleColumns.cost && (
                                                                                                        <div className="w-20 text-right text-xs text-gray-500 font-medium font-mono shrink-0">
                                                                                                            {getCategorySummary(subsubTasks, getTaskWeight).totalCost.toLocaleString()}
                                                                                                        </div>
                                                                                                    )}
                                                                                                    {visibleColumns.weight && (
                                                                                                        <div className="w-14 text-right text-xs text-gray-500 font-medium font-mono shrink-0">
                                                                                                            {getCategorySummary(subsubTasks, getTaskWeight).totalWeight.toFixed(2)}%
                                                                                                        </div>
                                                                                                    )}
                                                                                                    {visibleColumns.quantity && (
                                                                                                        <div className="w-16 shrink-0"></div>
                                                                                                    )}
                                                                                                    {visibleColumns.period && (
                                                                                                        <div className="w-[110px] text-right text-[10px] text-gray-400 font-mono shrink-0">
                                                                                                            {getCategorySummary(subsubTasks, getTaskWeight).dateRange ? (
                                                                                                                formatDateRange(
                                                                                                                    getCategorySummary(subsubTasks, getTaskWeight).dateRange!.start,
                                                                                                                    getCategorySummary(subsubTasks, getTaskWeight).dateRange!.end
                                                                                                                )
                                                                                                            ) : '-'}
                                                                                                        </div>
                                                                                                    )}
                                                                                                    {visibleColumns.progress && (
                                                                                                        <div className="w-20 flex items-center justify-end shrink-0 gap-1 pr-1">
                                                                                                            <span className="w-[45px] text-right text-xs text-amber-600/70 font-bold font-mono">
                                                                                                                {getCategorySummary(subsubTasks, getTaskWeight).avgProgress.toFixed(0)}%
                                                                                                            </span>
                                                                                                            <div className="w-[22px]"></div>
                                                                                                        </div>
                                                                                                    )}
                                                                                                </div>
                                                                                                {/* Chart placeholder with summary bar possibility */}
                                                                                                <div className="flex-1 relative" style={{ width: `${timeline.items.length * config.cellWidth}px` }}>
                                                                                                    <div className="absolute inset-0 flex pointer-events-none">
                                                                                                        {timeline.items.map((item, idx) => (
                                                                                                            <div key={idx} className={`flex-shrink-0 border-r border-dashed border-gray-100 h-full ${viewMode === 'day' && isWeekend(item) ? 'bg-gray-50/30' : ''}`} style={{ width: config.cellWidth }} />
                                                                                                        ))}
                                                                                                    </div>

                                                                                                    {/* Render Sub-Subcategory Summary Bar */}
                                                                                                    {(() => {
                                                                                                        const subSubSummary = getCategorySummary(subsubTasks, getTaskWeight);
                                                                                                        if (!subSubSummary.dateRange) return null;

                                                                                                        return (
                                                                                                            <div
                                                                                                                className="absolute h-2 top-[12px] rounded-full border border-gray-400/20"
                                                                                                                style={{
                                                                                                                    ...getCategoryBarStyle(subSubSummary.dateRange, viewMode, config, timeRange),
                                                                                                                    // backgroundColor: 'rgba(156, 163, 175, 0.2)', // Old fixed gray
                                                                                                                    backgroundColor: `${subSubColor}33`, // Dynamic color with opacity
                                                                                                                    zIndex: 30
                                                                                                                }}
                                                                                                            >
                                                                                                                <div
                                                                                                                    className="absolute left-0 top-0 bottom-0 rounded-full"
                                                                                                                    style={{
                                                                                                                        width: `${subSubSummary.avgProgress}%`,
                                                                                                                        backgroundColor: subSubColor,
                                                                                                                        opacity: 0.7
                                                                                                                    }}
                                                                                                                />
                                                                                                            </div>
                                                                                                        );
                                                                                                    })()}
                                                                                                </div>
                                                                                            </div>

                                                                                            {/* Sub-Subcategory Tasks */}
                                                                                            {!isSubSubCollapsed && subsubTasks.map(t => renderTaskTree(t, 3))}
                                                                                        </div>
                                                                                    );
                                                                                })}

                                                                                {/* Direct Subcategory Tasks */}
                                                                                {subData.tasks.map(t => renderTaskTree(t, 2))}
                                                                            </>
                                                                        )}
                                                                    </div >
                                                                );
                                                            })}

                                                            {/* Direct Tasks (No subcategory) - Level 1 to indent from Category */}
                                                            {catData.tasks.map(t => renderTaskTree(t, 1))}
                                                        </>
                                                    );
                                                })()
                                            }
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

            {/* Custom Modal */}
            {
                modalConfig.isOpen && (
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
                )
            }

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
        </div >
    );
}
