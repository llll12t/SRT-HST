import { useMemo } from 'react';
import { Task } from '@/types/construction';
import { parseDate } from '../../gantt/utils';
import { addDays, differenceInDays, format, isAfter, isBefore, isValid, parseISO, eachDayOfInterval } from 'date-fns';

export interface SCurveDataPoint {
    date: Date;
    plan: number;
    actual: number;
}


export type SCurveMode = 'physical' | 'financial';


export function useSCurveData(tasks: Task[], timeRange: { start: Date, end: Date }, mode: SCurveMode) {

    return useMemo(() => {
        const rawDays = differenceInDays(timeRange.end, timeRange.start) + 1;
        const totalProjectDays = Math.max(1, rawDays); // Ensure at least 1 day to prevent negative array length

        // Use Float32Array for better memory/performance on large arrays
        const planDaily = new Float32Array(totalProjectDays);
        const actualDaily = new Float32Array(totalProjectDays);

        // Use only LEAF tasks for calculation
        // Optimization: Filter once
        const leafTasks = tasks.filter(t => !tasks.some(child => child.parentTaskId === t.id));

        // Calculate Total Scope
        let totalScope = 0;
        if (mode === 'financial') {
            totalScope = leafTasks.reduce((sum, t) => sum + (Number(t.cost) || 0), 0);
        } else {
            // Physical: Use Duration weighting
            leafTasks.forEach(t => {
                const duration = differenceInDays(parseDate(t.planEndDate), parseDate(t.planStartDate)) + 1;
                totalScope += Math.max(0, duration);
            });
        }

        const projectStart = timeRange.start;

        leafTasks.forEach(task => {
            // Calculate Task Weight
            let weight = 0;
            if (mode === 'financial') {
                weight = Number(task.cost) || 0;
            } else {
                const duration = differenceInDays(parseDate(task.planEndDate), parseDate(task.planStartDate)) + 1;
                weight = Math.max(0, duration);
            }

            if (totalScope <= 0 || weight <= 0) return;

            // Normalized to % of Total Project
            const weightPercent = (weight / totalScope) * 100;

            // --- PLAN Distribution ---
            const pStart = parseDate(task.planStartDate);
            const pEnd = parseDate(task.planEndDate);

            if (isValid(pStart) && isValid(pEnd) && !isAfter(pStart, pEnd)) {
                const pDuration = differenceInDays(pEnd, pStart) + 1;
                const dailyWeight = weightPercent / Math.max(1, pDuration);

                // Start index relative to project start
                const startIdx = differenceInDays(pStart, projectStart);

                // Distribute weight
                for (let i = 0; i < pDuration; i++) {
                    const idx = startIdx + i;
                    if (idx >= 0 && idx < totalProjectDays) {
                        planDaily[idx] += dailyWeight;
                    }
                }
            }

            // --- ACTUAL Distribution ---
            const progress = Number(task.progress) || 0;
            if (progress > 0) {
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

                // Actual achieved weight
                const actualWeightTotal = weightPercent * (progress / 100);
                const aDays = differenceInDays(aEnd, aStart) + 1;
                const dailyActual = actualWeightTotal / Math.max(1, aDays);

                const startIdx = differenceInDays(aStart, projectStart);

                for (let i = 0; i < aDays; i++) {
                    const idx = startIdx + i;
                    if (idx >= 0 && idx < totalProjectDays) {
                        actualDaily[idx] += dailyActual;
                    }
                }
            }
        });

        // Determine Max Actual Date
        let maxActualDate = new Date(0);
        const today = new Date();
        leafTasks.forEach(t => {
            if (t.actualEndDate) {
                const d = parseDate(t.actualEndDate);
                if (isValid(d) && isAfter(d, maxActualDate)) maxActualDate = d;
            }
        });
        if (leafTasks.some(t => t.status === 'in-progress')) {
            if (isAfter(today, maxActualDate)) maxActualDate = today;
        }

        // Generate Final Points
        // Generate Final Points
        const points: SCurveDataPoint[] = [];

        // Add Initial Point (Start Date, 0%)
        points.push({
            date: projectStart,
            plan: 0,
            actual: 0
        });

        let cumPlan = 0;
        let cumActual = 0;

        for (let i = 0; i < totalProjectDays; i++) {
            cumPlan += planDaily[i];
            cumActual += actualDaily[i];

            points.push({
                date: addDays(projectStart, i + 1), // Plot at End of Day (Start of Next Day)
                plan: Math.min(100, cumPlan),
                actual: Math.min(100, cumActual)
            });
        }

        return { points, maxActualDate, totalScope };

    }, [tasks, timeRange, mode]);
}
