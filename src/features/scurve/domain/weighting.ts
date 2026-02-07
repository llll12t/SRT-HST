import { differenceInDays } from 'date-fns';
import { Task } from '@/types/construction';
import { parseDate } from '@/shared/utils/date';
import type { SCurveMode } from './metrics';

export const getLeafTasks = (tasks: Task[]): Task[] => {
  return tasks.filter(t => !tasks.some(child => child.parentTaskId === t.id));
};

export const getTaskScope = (task: Task, mode: SCurveMode): number => {
  if (mode === 'financial') {
    return Number(task.cost) || 0;
  }
  const duration = differenceInDays(parseDate(task.planEndDate), parseDate(task.planStartDate)) + 1;
  return Math.max(0, duration);
};

export const getTotalScope = (tasks: Task[], mode: SCurveMode): number => {
  return tasks.reduce((sum, task) => sum + getTaskScope(task, mode), 0);
};
