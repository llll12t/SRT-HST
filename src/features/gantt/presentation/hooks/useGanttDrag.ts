import { useState, useEffect, useRef } from 'react';
import { Task } from '@/types/construction';
import { DragState, GanttConfig, ViewMode } from '../types';
import { addDays, differenceInDays, format, isAfter, isBefore, parseISO } from 'date-fns';

interface UseGanttDragProps {
    tasksRef: React.MutableRefObject<Task[]>;
    viewMode: ViewMode;
    config: GanttConfig;
    onTaskUpdate?: (taskId: string, updates: Partial<Task>) => Promise<void>;
    setOptimisticTasks: React.Dispatch<React.SetStateAction<Task[]>>;
}

export function useGanttDrag({
    tasksRef,
    viewMode,
    config,
    onTaskUpdate,
    setOptimisticTasks
}: UseGanttDragProps) {
    const [dragState, setDragState] = useState<DragState | null>(null);
    const [isUpdating, setIsUpdating] = useState(false);

    // Global Event Listeners for Dragging (Mouse & Touch)
    useEffect(() => {
        if (!dragState) return;

        // Prevent text selection during drag
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'grabbing';
        document.body.style.touchAction = 'none'; // Prevent scrolling on touch

        let animationFrameId: number | null = null;

        const getClientX = (e: MouseEvent | TouchEvent) => {
            if ('touches' in e) {
                return e.touches[0].clientX;
            }
            return (e as MouseEvent).clientX;
        };

        const handleMove = (e: MouseEvent | TouchEvent) => {
            const clientX = getClientX(e);

            // Throttle with requestAnimationFrame
            if (animationFrameId) return;

            animationFrameId = requestAnimationFrame(() => {
                animationFrameId = null;

                const deltaX = clientX - dragState.startX;
                let daysDelta = 0;

                if (viewMode === 'day') {
                    daysDelta = deltaX / config.cellWidth;
                } else if (viewMode === 'week') {
                    daysDelta = (deltaX / config.cellWidth) * 7;
                } else {
                    daysDelta = (deltaX / config.cellWidth) * 30.44;
                }

                // Round to nearest day
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

        const handleUp = async () => {
            // Restore body styles
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
            document.body.style.touchAction = '';

            const hasMoved = dragState.currentStart?.getTime() !== dragState.originalStart.getTime() ||
                dragState.currentEnd?.getTime() !== dragState.originalEnd.getTime();

            if (dragState && onTaskUpdate && hasMoved) {
                setIsUpdating(true);

                try {
                    const currentStart = dragState.currentStart || dragState.originalStart;
                    const currentEnd = dragState.currentEnd || dragState.originalEnd;

                    if (dragState.barType === 'actual') {
                        await handleActualUpdate(dragState, tasksRef.current, currentStart, currentEnd, setOptimisticTasks, onTaskUpdate);
                    } else {
                        await handlePlanUpdate(dragState, tasksRef.current, currentStart, currentEnd, setOptimisticTasks, onTaskUpdate);
                    }
                } catch (error) {
                    console.error("Error updating tasks:", error);
                } finally {
                    setIsUpdating(false);
                    setDragState(null);
                }
            } else {
                setDragState(null);
            }
        };

        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
        window.addEventListener('touchmove', handleMove, { passive: false });
        window.addEventListener('touchend', handleUp);

        return () => {
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
            }
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
            window.removeEventListener('touchmove', handleMove);
            window.removeEventListener('touchend', handleUp);
        };
    }, [dragState, viewMode, config.cellWidth, onTaskUpdate, tasksRef, setOptimisticTasks]);

    const startDrag = (e: React.MouseEvent | React.TouchEvent, task: Task, type: DragState['type'], barType: 'plan' | 'actual' = 'plan') => {
        if (!onTaskUpdate) return;
        // e.preventDefault(); // Do not prevent default immediately on touch start to allow potential click recognition if not dragging? 
        // Actually for custom drag, we usually want to prevent default scrolling.
        // But for Mouse, preventDefault stops text selection.
        if (e.type === 'mousedown') e.preventDefault();
        e.stopPropagation();

        let clientX = 0;
        if ('touches' in e) {
            clientX = e.touches[0].clientX;
        } else {
            clientX = (e as React.MouseEvent).clientX;
        }

        let startDate: Date;
        let endDate: Date;

        if (barType === 'actual') {
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
                    const plannedDuration = differenceInDays(parseISO(task.planEndDate), parseISO(task.planStartDate)) + 1;
                    const progressDays = Math.round(plannedDuration * (Number(task.progress) / 100));
                    endDate = addDays(startDate, Math.max(0, progressDays - 1));
                }
            } else {
                endDate = startDate;
            }
        } else {
            startDate = parseISO(task.planStartDate);
            endDate = parseISO(task.planEndDate);
        }

        const affectedTaskIds = new Set<string>();
        if (type === 'move' && barType === 'plan') {
            const getAllDescendantIds = (parentId: string) => {
                const currentTasks = tasksRef.current;
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
            startX: clientX,
            originalStart: startDate,
            originalEnd: endDate,
            currentStart: startDate,
            currentEnd: endDate,
            affectedTaskIds
        });
    };

    return {
        dragState,
        startDrag,
        isUpdating
    };
}

// --- Helper Functions ---

const formatDate = (d: Date) => format(d, 'yyyy-MM-dd');

async function handleActualUpdate(
    dragState: DragState,
    tasks: Task[],
    currentStart: Date,
    currentEnd: Date,
    setOptimisticTasks: React.Dispatch<React.SetStateAction<Task[]>>,
    onTaskUpdate: (taskId: string, updates: Partial<Task>) => Promise<void>
) {
    // Calculate Progress based on Duration Ratio
    let newProgress = undefined;
    const taskToCheck = tasks.find(t => t.id === dragState.taskId);
    if (taskToCheck) {
        const pStart = parseISO(taskToCheck.planStartDate);
        const pEnd = parseISO(taskToCheck.planEndDate);
        const planDuration = differenceInDays(pEnd, pStart) + 1;

        if (planDuration > 0) {
            const actualDuration = differenceInDays(currentEnd, currentStart) + 1;
            newProgress = Math.round((actualDuration / planDuration) * 100);
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
}

async function handlePlanUpdate(
    dragState: DragState,
    tasks: Task[],
    currentStart: Date,
    currentEnd: Date,
    setOptimisticTasks: React.Dispatch<React.SetStateAction<Task[]>>,
    onTaskUpdate: (taskId: string, updates: Partial<Task>) => Promise<void>
) {
    const newPlanStart = formatDate(currentStart);
    const newPlanEnd = formatDate(currentEnd);

    setOptimisticTasks(prev => prev.map(t => {
        if (t.id === dragState.taskId) {
            return { ...t, planStartDate: newPlanStart, planEndDate: newPlanEnd };
        }
        return t;
    }));

    const mainUpdatePromise = onTaskUpdate(dragState.taskId, {
        planStartDate: newPlanStart,
        planEndDate: newPlanEnd
    });

    // Recursive Updates (Cascading)
    const updatesToApply: Array<{ id: string, start: string, end: string }> = [];
    let hasDependencyTableUpdates = false;

    // 1. Parent-Child Hierarchy (Moves only)
    if (dragState.type === 'move') {
        const daysDifference = differenceInDays(
            currentStart,
            dragState.originalStart
        );

        if (daysDifference !== 0) {
            const getAllDescendantIds = (parentId: string): string[] => {
                const children = tasks.filter(t => t.parentTaskId === parentId);
                let descendants: string[] = children.map(c => c.id);
                children.forEach(child => {
                    descendants = [...descendants, ...getAllDescendantIds(child.id)];
                });
                return descendants;
            };

            const descendantIds = getAllDescendantIds(dragState.taskId);
            const validDescendants = tasks.filter(t => descendantIds.includes(t.id));

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

    // 2. Cascade Dependencies (Moves & Resize Right)
    let effectiveShift = 0;
    if (dragState.type === 'move') {
        effectiveShift = differenceInDays(
            currentStart,
            dragState.originalStart
        );
    } else if (dragState.type === 'resize-right') {
        const newEnd = currentEnd;
        effectiveShift = differenceInDays(newEnd, dragState.originalEnd);
    }

    if (effectiveShift !== 0) {
        const queue: { id: string, shift: number }[] = [{ id: dragState.taskId, shift: effectiveShift }];
        const processed = new Set<string>();

        while (queue.length > 0) {
            const { id: currentId, shift } = queue.shift()!;
            if (processed.has(currentId)) continue;
            processed.add(currentId);

            const successors = tasks.filter(t => t.predecessors?.includes(currentId));

            for (const succ of successors) {
                const succStart = parseISO(succ.planStartDate);
                const succEnd = parseISO(succ.planEndDate);

                const newStart = addDays(succStart, shift);
                const newEnd = addDays(succEnd, shift);

                updatesToApply.push({
                    id: succ.id,
                    start: formatDate(newStart),
                    end: formatDate(newEnd)
                });

                hasDependencyTableUpdates = true;
                queue.push({ id: succ.id, shift: shift });
            }
        }
    }

    if (updatesToApply.length > 0) {
        setOptimisticTasks(prev => prev.map(t => {
            const update = updatesToApply.find(u => u.id === t.id);
            if (update) {
                return { ...t, planStartDate: update.start, planEndDate: update.end };
            }
            return t;
        }));

        if (hasDependencyTableUpdates) {
            // Visual effect pause
            await new Promise(r => setTimeout(r, 600));
        }

        await Promise.all([
            mainUpdatePromise,
            ...updatesToApply.map(u => onTaskUpdate(u.id, {
                planStartDate: u.start,
                planEndDate: u.end
            }))
        ]);
    } else {
        await mainUpdatePromise;
    }
}
