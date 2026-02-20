import { Task } from '@/types/construction';
import { differenceInDays, format, isAfter, isBefore, addDays } from 'date-fns';
import { parseDate } from './dates';
import { getAllDescendants } from './relations';

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
    const start = parseDate(t.planStartDate)!;
    const end = parseDate(t.planEndDate)!;
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
    if (task.planStartDate) {
      const d = parseDate(task.planStartDate)!;
      if (!minDate || isBefore(d, minDate)) minDate = d;
    }
    if (task.planEndDate) {
      const d = parseDate(task.planEndDate)!;
      if (!maxDate || isAfter(d, maxDate)) maxDate = d;
    }

    if (task.actualStartDate) {
      const d = parseDate(task.actualStartDate)!;
      if (!minActualDate || isBefore(d, minActualDate)) minActualDate = d;

      let effectiveEnd = d;
      if (task.actualEndDate) {
        effectiveEnd = parseDate(task.actualEndDate)!;
      } else if ((task.progress || 0) > 0) {
        const pStart = parseDate(task.planStartDate)!;
        const pEnd = parseDate(task.planEndDate)!;
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
    totalWeight
  };
};
