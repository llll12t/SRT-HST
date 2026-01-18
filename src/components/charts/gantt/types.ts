import { Task } from '@/types/construction';

export type ViewMode = 'day' | 'week' | 'month';

export interface GanttConfig {
    cellWidth: number;
    label: string;
}

export interface DragState {
    taskId: string;
    type: 'move' | 'resize-left' | 'resize-right';
    barType: 'plan' | 'actual';
    startX: number;
    originalStart: Date;
    originalEnd: Date;
    currentStart?: Date;
    currentEnd?: Date;
    affectedTaskIds?: Set<string>;
}

export interface RowDragState {
    taskId: string;
    taskName: string;
}

export interface DateRange {
    start: Date;
    end: Date;
}
