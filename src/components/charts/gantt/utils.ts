import { Task } from '@/types/construction';
import { differenceInDays, parseISO, isBefore, isAfter, addDays, isSameDay, format, isValid } from 'date-fns';
import { ViewMode, GanttConfig, DragState, DateRange } from './types';

export const parseDate = (dateStr: string): Date => {
    if (!dateStr) return new Date(NaN);
    const parts = dateStr.split('/');
    if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);
        return new Date(year, month, day);
    }
    return parseISO(dateStr);
};

export const isWeekend = (date: Date) => {
    const day = date.getDay();
    return day === 0 || day === 6;
};

export const isToday = (date: Date) => {
    return isSameDay(date, new Date());
};

export const isTaskDescendant = (
    potentialDescendantId: string,
    potentialAncestorId: string,
    tasks: Task[]
): boolean => {
    const task = tasks.find(t => t.id === potentialDescendantId);
    if (!task || !task.parentTaskId) return false;
    if (task.parentTaskId === potentialAncestorId) return true;
    return isTaskDescendant(task.parentTaskId, potentialAncestorId, tasks);
};

export const getCategorySummary = (catTasks: Task[], getTaskWeight?: (t: Task) => number) => {
    const totalCost = catTasks.reduce((sum, t) => sum + (t.cost || 0), 0);
    const totalWeight = getTaskWeight
        ? catTasks.reduce((sum, t) => sum + getTaskWeight(t), 0)
        : 0;

    const avgProgress = catTasks.length > 0
        ? catTasks.reduce((sum, t) => sum + Number(t.progress || 0), 0) / catTasks.length
        : 0;

    let minDate: Date | null = null;
    let maxDate: Date | null = null;

    catTasks.filter(t => t.type !== 'group').forEach(t => {
        if (!t.planStartDate || !t.planEndDate) return;
        const start = parseDate(t.planStartDate);
        const end = parseDate(t.planEndDate);
        if (!minDate || isBefore(start, minDate)) minDate = start;
        if (!maxDate || isAfter(end, maxDate)) maxDate = end;
    });

    const dateRange = minDate && maxDate ? {
        start: minDate,
        end: maxDate,
        days: differenceInDays(maxDate, minDate) + 1
    } : null;

    return { totalCost, totalWeight, avgProgress, count: catTasks.length, dateRange };
};


export const getCoordinateX = (
    date: Date,
    chartStart: Date,
    config: { cellWidth: number },
    viewMode: ViewMode
) => {
    const diff = differenceInDays(date, chartStart);
    if (viewMode === 'day') return diff * config.cellWidth;
    if (viewMode === 'week') return (diff / 7) * config.cellWidth;
    // Month approximate
    return (diff / 30.44) * config.cellWidth;
};

export const getCategoryBarStyle = (
    dateRange: { start: Date; end: Date; days: number },
    viewMode: ViewMode,
    config: GanttConfig,
    timeRange: DateRange
) => {
    const chartStart = timeRange.start;
    const durationDays = dateRange.days;

    const leftPx = getCoordinateX(dateRange.start, chartStart, config, viewMode);
    let widthPx = 0;

    if (viewMode === 'day') {
        widthPx = durationDays * config.cellWidth;
    } else if (viewMode === 'week') {
        widthPx = (durationDays / 7) * config.cellWidth;
    } else if (viewMode === 'month') {
        widthPx = (durationDays / 30.44) * config.cellWidth;
    }

    return {
        left: `${leftPx}px`,
        width: `${Math.max(8, widthPx)}px`
    };
};

export const getActualDates = (
    task: Task,
    dragState: DragState | null,
    isUpdating: boolean
) => {
    let actualStart: Date, actualEnd: Date;

    if (!isUpdating && dragState && dragState.taskId === task.id && dragState.barType === 'actual') {
        actualStart = dragState.currentStart || parseDate(task.actualStartDate || task.planStartDate);
        actualEnd = dragState.currentEnd || actualStart;
    } else {
        const hasActualStart = task.actualStartDate && task.actualStartDate.length > 0;
        const hasActualEnd = task.actualEndDate && task.actualEndDate.length > 0;
        const hasProgress = Number(task.progress) > 0;

        if (!hasActualStart && !hasProgress) return null;

        if (hasActualStart) {
            actualStart = parseDate(task.actualStartDate!);
        } else {
            actualStart = parseDate(task.planStartDate);
        }

        if (hasActualEnd) {
            actualEnd = parseDate(task.actualEndDate!);
        } else if (hasProgress) {
            const plannedDuration = differenceInDays(parseDate(task.planEndDate), parseDate(task.planStartDate)) + 1;
            const progressDays = Math.round(plannedDuration * (Number(task.progress) / 100));
            actualEnd = new Date(actualStart);
            actualEnd.setDate(actualEnd.getDate() + Math.max(0, progressDays - 1));
        } else {
            actualEnd = actualStart;
        }
    }
    return { start: actualStart, end: actualEnd };
};

export const getBarStyle = (
    task: Task,
    type: 'plan' | 'actual',
    viewMode: ViewMode,
    config: GanttConfig,
    timeRange: DateRange,
    dragState: DragState | null,
    isUpdating: boolean
) => {
    const chartStart = timeRange.start;
    const totalDays = differenceInDays(timeRange.end, chartStart);

    let taskStart: Date, taskEnd: Date;

    // Calculate drag delta if a parent is being dragged and not updating
    let dragDeltaDays = 0;
    if (!isUpdating && dragState && dragState.type === 'move' && dragState.barType === type && dragState.taskId !== task.id) {
        if (dragState.affectedTaskIds && dragState.affectedTaskIds.has(task.id)) {
            dragDeltaDays = differenceInDays(
                dragState.currentStart || dragState.originalStart,
                dragState.originalStart
            );
        }
    }

    if (!isUpdating && dragState && dragState.taskId === task.id && type === dragState.barType) {
        // Dragging this specific bar
        taskStart = dragState.currentStart || parseDate(task.planStartDate);
        taskEnd = dragState.currentEnd || parseDate(task.planEndDate);
    } else {
        if (type === 'plan') {
            taskStart = parseDate(task.planStartDate);
            taskEnd = parseDate(task.planEndDate);

            if (dragDeltaDays !== 0) {
                taskStart = addDays(taskStart, dragDeltaDays);
                taskEnd = addDays(taskEnd, dragDeltaDays);
            }
        } else {
            // Actual Logic
            const dates = getActualDates(task, dragState, isUpdating);
            if (!dates) return { display: 'none' as const };
            taskStart = dates.start;
            taskEnd = dates.end;
        }
    }

    const durationDays = differenceInDays(taskEnd, taskStart) + 1;
    const leftPx = getCoordinateX(taskStart, chartStart, config, viewMode);
    let widthPx = 0;

    if (viewMode === 'day') {
        widthPx = durationDays * config.cellWidth;
    } else if (viewMode === 'week') {
        widthPx = (durationDays / 7) * config.cellWidth;
    } else if (viewMode === 'month') {
        widthPx = (durationDays / 30.44) * config.cellWidth;
    }

    if ((leftPx < 0 && leftPx + widthPx < 0) || (leftPx > totalDays * config.cellWidth)) {
        return { display: 'none' as const };
    }

    return {
        left: `${leftPx}px`,
        width: `${Math.max(4, widthPx)}px`
    };
};

export const formatDateTH = (dateStr: string | Date | undefined | null) => {
    if (!dateStr) return '-';
    const date = typeof dateStr === 'string' ? parseDate(dateStr) : dateStr;
    if (isNaN(date.getTime())) return '-';
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    // As per user request: "24/01" format (no year)
    return `${day}/${month}`;
};

export const formatDateRange = (startStr: string | Date | undefined | null, endStr: string | Date | undefined | null) => {
    if (!startStr || !endStr) return '-';

    const start = typeof startStr === 'string' ? parseDate(startStr) : startStr;
    const end = typeof endStr === 'string' ? parseDate(endStr) : endStr;

    if (isNaN(start.getTime()) || isNaN(end.getTime())) return '-';

    const diff = differenceInDays(end, start) + 1;
    return `${formatDateTH(start)} - ${formatDateTH(end)} (${diff}d)`;
};

export const getAllDescendants = (taskId: string, tasks: Task[]): Task[] => {
    const children = tasks.filter(t => t.parentTaskId && String(t.parentTaskId) === String(taskId));
    let descendants: Task[] = [];
    children.forEach(child => {
        if (child.type === 'group') {
            descendants = [...descendants, ...getAllDescendants(child.id, tasks)];
        } else {
            descendants.push(child);
        }
    });
    return descendants;
};

export const getGroupSummary = (groupTask: Task, tasks: Task[], getTaskWeight: (t: Task) => number) => {
    const descendants = getAllDescendants(groupTask.id, tasks);
    const leafTasks = descendants.filter(t => t.type !== 'group');

    let minDate: Date | null = null;
    let maxDate: Date | null = null;
    let minActualDate: Date | null = null;
    let maxActualDate: Date | null = null;

    let totalCost = 0;
    let weightedProgress = 0;
    let totalWeight = 0;

    if (leafTasks.length === 0) {
        return {
            count: 0,
            minStartDate: '',
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
            const d = parseDate(task.planStartDate);
            if (!minDate || isBefore(d, minDate)) minDate = d;
        }
        if (task.planEndDate) {
            const d = parseDate(task.planEndDate);
            if (!maxDate || isAfter(d, maxDate)) maxDate = d;
        }

        // Actual Dates
        if (task.actualStartDate) {
            const d = parseDate(task.actualStartDate);
            if (!minActualDate || isBefore(d, minActualDate)) minActualDate = d;

            let effectiveEnd = d;
            if (task.actualEndDate) {
                effectiveEnd = parseDate(task.actualEndDate);
            } else if ((task.progress || 0) > 0) {
                const pStart = parseDate(task.planStartDate);
                const pEnd = parseDate(task.planEndDate);
                const plannedDuration = differenceInDays(pEnd, pStart) + 1;
                const progressDays = Math.round(plannedDuration * (Number(task.progress) / 100));
                effectiveEnd = addDays(d, Math.max(0, progressDays - 1));
            }

            if (!maxActualDate || isAfter(effectiveEnd, maxActualDate)) maxActualDate = effectiveEnd;
        }

        totalCost += task.cost || 0;
        const taskWeight = task.cost || 1;
        weightedProgress += (task.progress || 0) * taskWeight;
        totalWeight += taskWeight;
    });

    return {
        count: leafTasks.length,
        minStartDate: minDate ? format(minDate, 'dd/MM/yyyy') : groupTask.planStartDate,
        maxEndDate: maxDate ? format(maxDate, 'dd/MM/yyyy') : groupTask.planEndDate,
        minActualDate: minActualDate ? format(minActualDate, 'dd/MM/yyyy') : null,
        maxActualDate: maxActualDate ? format(maxActualDate, 'dd/MM/yyyy') : null,
        progress: totalWeight > 0 ? Math.round(weightedProgress / totalWeight) : 0,
        totalCost,
        totalWeight // Export logic relies on this?
    };
};
