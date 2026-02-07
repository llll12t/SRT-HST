import { addDays, differenceInDays, isAfter, isBefore, isValid } from 'date-fns';
import { parseDate } from '@/shared/utils/date';
import type { SCurveComputationInput, SCurveComputationResult } from './metrics';
import { getLeafTasks, getTaskScope, getTotalScope } from './weighting';

export function computeSCurveData(input: SCurveComputationInput): SCurveComputationResult {
  const { tasks, timeRange, mode } = input;

  const rawDays = differenceInDays(timeRange.end, timeRange.start) + 1;
  const totalProjectDays = Math.max(1, rawDays);

  const planDaily = new Float32Array(totalProjectDays);
  const actualDaily = new Float32Array(totalProjectDays);

  const leafTasks = getLeafTasks(tasks);
  const totalScope = getTotalScope(leafTasks, mode);
  const projectStart = timeRange.start;

  leafTasks.forEach(task => {
    const weight = getTaskScope(task, mode);
    if (totalScope <= 0 || weight <= 0) return;

    const weightPercent = (weight / totalScope) * 100;

    const pStart = parseDate(task.planStartDate);
    const pEnd = parseDate(task.planEndDate);

    if (isValid(pStart) && isValid(pEnd) && !isAfter(pStart, pEnd)) {
      const pDuration = differenceInDays(pEnd, pStart) + 1;
      const dailyWeight = weightPercent / Math.max(1, pDuration);
      const startIdx = differenceInDays(pStart, projectStart);

      for (let i = 0; i < pDuration; i++) {
        const idx = startIdx + i;
        if (idx >= 0 && idx < totalProjectDays) {
          planDaily[idx] += dailyWeight;
        }
      }
    }

    const progress = Number(task.progress) || 0;
    if (progress <= 0) return;

    let aStart = task.actualStartDate ? parseDate(task.actualStartDate) : pStart;
    const today = new Date();
    let aEnd: Date;

    if (task.actualEndDate && isValid(parseDate(task.actualEndDate))) {
      aEnd = parseDate(task.actualEndDate);
    } else {
      aEnd = today;
    }

    if (!isValid(aStart)) aStart = pStart;
    if (!isValid(aEnd)) aEnd = today;
    if (isBefore(aEnd, aStart)) aEnd = aStart;

    const actualWeightTotal = weightPercent * (progress / 100);
    const aDays = differenceInDays(aEnd, aStart) + 1;
    const dailyActual = actualWeightTotal / Math.max(1, aDays);
    const startIdx = differenceInDays(aStart, projectStart);

    for (let i = 0; i < aDays; i++) {
      const idx = startIdx + i;
      if (idx >= 0 && idx < totalProjectDays) {
        actualDaily[idx] += dailyActual;
      } else if (idx < 0 && totalProjectDays > 0) {
        actualDaily[0] += dailyActual;
      }
    }
  });

  let maxActualDate = new Date(0);
  const today = new Date();

  leafTasks.forEach(task => {
    if (task.actualEndDate) {
      const d = parseDate(task.actualEndDate);
      if (isValid(d) && isAfter(d, maxActualDate)) maxActualDate = d;
    } else if (task.status === 'completed' && task.actualStartDate) {
      const d = parseDate(task.actualStartDate);
      if (isValid(d) && isAfter(d, maxActualDate)) maxActualDate = d;
    }
  });

  maxActualDate = addDays(maxActualDate, 1);

  if (leafTasks.some(task => task.status === 'in-progress')) {
    if (isAfter(today, maxActualDate)) maxActualDate = today;
  }

  const points = [{ date: projectStart, plan: 0, actual: 0 }];

  let cumPlan = 0;
  let cumActual = 0;

  for (let i = 0; i < totalProjectDays; i++) {
    cumPlan += planDaily[i];
    cumActual += actualDaily[i];

    points.push({
      date: addDays(projectStart, i + 1),
      plan: Math.min(100, cumPlan),
      actual: Math.min(100, cumActual)
    });
  }

  return { points, maxActualDate, totalScope };
}
