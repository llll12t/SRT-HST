import { useMemo } from 'react';
import { Task } from '@/types/construction';
import { computeSCurveData } from '@/features/scurve/domain/accumulation';
import type { SCurveMode, SCurvePoint } from '@/features/scurve/domain/metrics';

export type { SCurveMode };

export interface SCurveDataPoint extends SCurvePoint {}

export function useSCurveData(tasks: Task[], timeRange: { start: Date; end: Date }, mode: SCurveMode) {
  return useMemo(() => computeSCurveData({ tasks, timeRange, mode }), [tasks, timeRange, mode]);
}
