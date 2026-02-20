import { Task } from '@/types/construction';
import { addDays, differenceInDays } from 'date-fns';
import type { DateRange, DragState, GanttConfig, ViewMode } from '@/shared/chart-kernel/types';
import { parseDate } from './dates';

export const getCoordinateX = (
  date: Date,
  chartStart: Date,
  config: { cellWidth: number },
  viewMode: ViewMode
) => {
  const diff = differenceInDays(date, chartStart);
  if (viewMode === 'day') return diff * config.cellWidth;
  if (viewMode === 'week') return (diff / 7) * config.cellWidth;
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
  const totalDays = Math.max(1, differenceInDays(timeRange.end, chartStart) + 1);

  const leftPx = getCoordinateX(dateRange.start, chartStart, config, viewMode);
  let widthPx = 0;
  let chartWidthPx = 0;

  if (viewMode === 'day') {
    widthPx = durationDays * config.cellWidth;
    chartWidthPx = totalDays * config.cellWidth;
  } else if (viewMode === 'week') {
    widthPx = (durationDays / 7) * config.cellWidth;
    chartWidthPx = (totalDays / 7) * config.cellWidth;
  } else if (viewMode === 'month') {
    widthPx = (durationDays / 30.44) * config.cellWidth;
    chartWidthPx = (totalDays / 30.44) * config.cellWidth;
  }

  const rawEndPx = leftPx + widthPx;
  const clampedLeftPx = Math.max(0, leftPx);
  const clampedEndPx = Math.min(chartWidthPx, rawEndPx);
  const clampedWidthPx = clampedEndPx - clampedLeftPx;

  if (clampedWidthPx <= 0) {
    return { display: 'none' as const };
  }

  return {
    left: `${clampedLeftPx}px`,
    width: `${Math.max(1, clampedWidthPx)}px`
  };
};

export const getActualDates = (
  task: Task,
  dragState: DragState | null,
  isUpdating: boolean
) => {
  let actualStart: Date, actualEnd: Date;

  if (!isUpdating && dragState && dragState.taskId === task.id && dragState.barType === 'actual') {
    actualStart = dragState.currentStart || parseDate(task.actualStartDate || task.planStartDate)!;
    actualEnd = dragState.currentEnd || actualStart;
  } else {
    const hasActualStart = task.actualStartDate && task.actualStartDate.length > 0;
    const hasActualEnd = task.actualEndDate && task.actualEndDate.length > 0;
    const hasProgress = Number(task.progress) > 0;

    if (!hasActualStart && !hasProgress) return null;

    if (hasActualStart) {
      actualStart = parseDate(task.actualStartDate!)!;
    } else {
      actualStart = parseDate(task.planStartDate)!;
    }

    if (hasActualEnd) {
      actualEnd = parseDate(task.actualEndDate!)!;
    } else if (hasProgress) {
      const plannedDuration = differenceInDays(parseDate(task.planEndDate)!, parseDate(task.planStartDate)!) + 1;
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
    taskStart = dragState.currentStart || parseDate(task.planStartDate)!;
    taskEnd = dragState.currentEnd || parseDate(task.planEndDate)!;
  } else {
    if (type === 'plan') {
      taskStart = parseDate(task.planStartDate)!;
      taskEnd = parseDate(task.planEndDate)!;

      if (dragDeltaDays !== 0) {
        taskStart = addDays(taskStart, dragDeltaDays);
        taskEnd = addDays(taskEnd, dragDeltaDays);
      }
    } else {
      const dates = getActualDates(task, dragState, isUpdating);
      if (!dates) return { display: 'none' as const };
      taskStart = dates.start;
      taskEnd = dates.end;
    }
  }

  const durationDays = differenceInDays(taskEnd, taskStart) + 1;
  const leftPx = getCoordinateX(taskStart, chartStart, config, viewMode);
  let widthPx = 0;
  let chartWidthPx = 0;

  if (viewMode === 'day') {
    widthPx = durationDays * config.cellWidth;
    chartWidthPx = (totalDays + 1) * config.cellWidth;
  } else if (viewMode === 'week') {
    widthPx = (durationDays / 7) * config.cellWidth;
    chartWidthPx = ((totalDays + 1) / 7) * config.cellWidth;
  } else if (viewMode === 'month') {
    widthPx = (durationDays / 30.44) * config.cellWidth;
    chartWidthPx = ((totalDays + 1) / 30.44) * config.cellWidth;
  }

  if ((leftPx < 0 && leftPx + widthPx < 0) || (leftPx > chartWidthPx)) {
    return { display: 'none' as const };
  }

  const rawEndPx = leftPx + widthPx;
  const clampedLeftPx = Math.max(0, leftPx);
  const clampedEndPx = Math.min(chartWidthPx, rawEndPx);
  const clampedWidthPx = clampedEndPx - clampedLeftPx;

  if (clampedWidthPx <= 0) {
    return { display: 'none' as const };
  }

  return {
    left: `${clampedLeftPx}px`,
    width: `${Math.max(1, clampedWidthPx)}px`
  };
};

