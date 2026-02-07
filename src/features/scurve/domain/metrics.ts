import { Task } from '@/types/construction';

export type SCurveMode = 'physical' | 'financial';

export interface SCurvePoint {
  date: Date;
  plan: number;
  actual: number;
}

export interface SCurveComputationInput {
  tasks: Task[];
  timeRange: { start: Date; end: Date };
  mode: SCurveMode;
}

export interface SCurveComputationResult {
  points: SCurvePoint[];
  maxActualDate: Date;
  totalScope: number;
}
