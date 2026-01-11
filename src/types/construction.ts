// Type definitions for Construction Management System

export interface Project {
    id: string;
    name: string;
    owner: string;
    description?: string;
    startDate: string;
    endDate: string;
    overallProgress: number;
    status: 'planning' | 'in-progress' | 'completed' | 'on-hold';
    createdAt: string;
    updatedAt: string;
}

export interface Task {
    id: string;
    projectId: string;
    category: string;
    name: string;
    description?: string;
    responsible?: string;
    weight: number; // % of work (น้ำหนักงาน)
    planStartDate: string;
    planEndDate: string;
    planDuration: number;
    actualStartDate?: string;
    actualEndDate?: string;
    actualDuration?: number;
    progress: number; // 0-100
    status: 'not-started' | 'in-progress' | 'completed' | 'delayed';
    parentTaskId?: string;
    order: number;
    remarks?: string;
    createdAt: string;
    updatedAt: string;
}

export interface WeeklyLog {
    id: string;
    projectId: string;
    weekNumber: number;
    year: number;
    startDate: string;
    endDate: string;
    plannedCumulativeProgress: number;
    actualCumulativeProgress: number;
    gap: number; // Variance between plan and actual
    notes?: string;
    createdAt: string;
}

export interface Media {
    id: string;
    taskId: string;
    projectId: string;
    url: string;
    type: 'image' | 'document';
    caption?: string;
    uploadedBy: string;
    uploadedAt: string;
}

export interface TaskProgressUpdate {
    id: string;
    taskId: string;
    previousProgress: number;
    newProgress: number;
    updatedBy: string;
    notes?: string;
    mediaIds?: string[];
    createdAt: string;
}

// S-Curve data point
export interface SCurveDataPoint {
    week: number;
    date: string;
    plannedProgress: number;
    actualProgress: number;
    cumulativePlanned: number;
    cumulativeActual: number;
}

// Gantt Chart data
export interface GanttTask {
    id: string;
    name: string;
    category: string;
    planStart: Date;
    planEnd: Date;
    actualStart?: Date;
    actualEnd?: Date;
    progress: number;
    weight: number;
    isCategory?: boolean;
    children?: GanttTask[];
}
