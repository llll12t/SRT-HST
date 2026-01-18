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
    type?: 'task' | 'group';
    name: string;
    description?: string;
    responsible?: string;
    color?: string; // Custom color for the task/group bar
    // weight removed
    cost?: number; // Cost in Baht
    quantity?: string; // Q'ty with unit (e.g. "20 m.")
    planStartDate: string;
    planEndDate: string;
    planDuration: number;
    actualStartDate?: string;
    actualEndDate?: string;
    actualDuration?: number;
    progress: number; // 0-100
    progressUpdatedAt?: string; // Date when progress was last updated by user
    status: 'not-started' | 'in-progress' | 'completed' | 'delayed';
    parentTaskId?: string | null;
    order: number;
    predecessors?: string[];
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
    bucketStart?: Date;
    bucketEnd?: Date;
    rawId?: string;
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
    cost?: number;
    quantity?: string;
    isCategory?: boolean;
    children?: GanttTask[];
}

// Team member
export interface Member {
    id: string;
    name: string;
    email: string;
    phone?: string;
    role: 'admin' | 'project_manager' | 'engineer' | 'viewer';
    position?: string;
    department?: string;
    username?: string;
    avatar?: string;
    createdAt?: string;
    updatedAt?: string;
}
