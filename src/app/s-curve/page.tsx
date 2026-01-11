'use client';

import React, { useState, useEffect, useMemo } from 'react';
import SCurveChart from '@/components/charts/SCurveChart';
import { Download, BarChart3, TrendingUp, TrendingDown, Loader2, Calendar, CalendarDays, CalendarRange } from 'lucide-react';
import { Project, Task, SCurveDataPoint, WeeklyLog } from '@/types/construction';
import { getProjects, getTasks, getWeeklyLogs } from '@/lib/firestore';
import { differenceInDays, addDays, startOfWeek, endOfWeek, parseISO, isWithinInterval, isAfter, isBefore, format, startOfMonth, endOfMonth, addMonths, isSameMonth, isSameDay } from 'date-fns';
import { th } from 'date-fns/locale';

type ViewMode = 'day' | 'week' | 'month';

export default function SCurvePage() {
    const [projects, setProjects] = useState<Project[]>([]);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [weeklyLogs, setWeeklyLogs] = useState<WeeklyLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedProjectId, setSelectedProjectId] = useState<string>('');
    const [viewMode, setViewMode] = useState<ViewMode>('week');

    useEffect(() => {
        fetchProjects();
    }, []);

    useEffect(() => {
        if (selectedProjectId) {
            fetchProjectData();
        }
    }, [selectedProjectId]);

    const fetchProjects = async () => {
        try {
            setLoading(true);
            const projectsData = await getProjects();
            setProjects(projectsData);

            if (projectsData.length > 0) {
                setSelectedProjectId(projectsData[0].id);
            }
        } catch (error) {
            console.error('Error fetching projects:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchProjectData = async () => {
        try {
            const [tasksData, logsData] = await Promise.all([
                getTasks(selectedProjectId),
                getWeeklyLogs(selectedProjectId)
            ]);
            setTasks(tasksData);
            setWeeklyLogs(logsData);
        } catch (error) {
            console.error('Error fetching project data:', error);
        }
    };

    const selectedProject = projects.find(p => p.id === selectedProjectId);

    // --- Core Calculation Logic ---
    const scurveData = useMemo((): SCurveDataPoint[] => {
        if (!selectedProject || tasks.length === 0) return [];

        const projectStart = parseISO(selectedProject.startDate);
        const projectEnd = parseISO(selectedProject.endDate);
        const totalDurationDays = differenceInDays(projectEnd, projectStart) + 1;

        if (totalDurationDays <= 0) return [];

        const buckets: SCurveDataPoint[] = [];
        let currentIterDate = new Date(projectStart);
        let index = 1;

        // 1. Generate Buckets based on ViewMode
        while (isBefore(currentIterDate, addDays(projectEnd, viewMode === 'month' ? 32 : 7))) {
            let bucketEnd;
            let label = '';
            let bucketId = '';

            if (viewMode === 'day') {
                bucketEnd = currentIterDate;
                label = format(bucketEnd, 'd MMM', { locale: th });
                bucketId = format(bucketEnd, 'yyyy-MM-dd');
                currentIterDate = addDays(currentIterDate, 1);
            } else if (viewMode === 'week') {
                const weekStart = currentIterDate;
                bucketEnd = addDays(currentIterDate, 6);
                // Show date range like "1-7 ม.ค."
                label = `${format(weekStart, 'd', { locale: th })}-${format(bucketEnd, 'd MMM', { locale: th })}`;
                bucketId = index.toString();
                currentIterDate = addDays(currentIterDate, 7);
            } else { // Month
                // Ensure we start at month start if iterating loosely, but here we just take current range
                // For simpler logic: Last day of month is the bucket end
                bucketEnd = endOfMonth(currentIterDate);
                label = format(bucketEnd, 'MMM yy', { locale: th });
                bucketId = format(bucketEnd, 'yyyy-MM');
                currentIterDate = addMonths(currentIterDate, 1);
                // Reset to start of next month to avoid skipping
                currentIterDate = startOfMonth(currentIterDate);
            }

            // Stop if we went way too far past project end
            if (isAfter(addDays(bucketEnd, -25), projectEnd)) break;

            buckets.push({
                week: index, // Acts as ID/Index
                date: label,
                plannedProgress: 0,
                actualProgress: 0,
                cumulativePlanned: 0,
                cumulativeActual: 0,
                // @ts-ignore
                bucketStart: viewMode === 'month' ? startOfMonth(bucketEnd) : viewMode === 'week' ? addDays(bucketEnd, -6) : bucketEnd,
                // @ts-ignore
                bucketEnd: bucketEnd,
                // @ts-ignore
                rawId: bucketId
            });
            index++;
        }

        // 2. Calculate Total Duration for weight distribution (since explicit weight was removed)
        const totalDuration = tasks.reduce((sum, task) => {
            const tStart = parseISO(task.planStartDate);
            const tEnd = parseISO(task.planEndDate);
            const duration = differenceInDays(tEnd, tStart) + 1;
            return sum + Math.max(0, duration);
        }, 0);

        // 3. Distribute Planned Progress based on Duration
        tasks.forEach(task => {
            const tStart = parseISO(task.planStartDate);
            const tEnd = parseISO(task.planEndDate);
            const duration = differenceInDays(tEnd, tStart) + 1;
            if (duration <= 0 || totalDuration <= 0) return;

            // Task's contribution to overall project = its duration / total duration * 100%
            const taskWeight = (duration / totalDuration) * 100;
            const weightPerDay = taskWeight / duration;

            // Distribute across buckets
            buckets.forEach(bucket => {
                // @ts-ignore
                const bStart = bucket.bucketStart;
                // @ts-ignore
                const bEnd = bucket.bucketEnd;

                // Find overlap
                const overlapStart = isAfter(tStart, bStart) ? tStart : bStart;
                const overlapEnd = isBefore(tEnd, bEnd) ? tEnd : bEnd;

                if (isAfter(overlapStart, overlapEnd)) return; // No overlap

                const overlapDays = differenceInDays(overlapEnd, overlapStart) + 1;
                bucket.plannedProgress += (overlapDays * weightPerDay);
            });
        });

        // 4. Calculate ACTUAL Progress using actualStartDate and actualEndDate
        // Reset running actual calculation
        buckets.forEach(bucket => {
            // @ts-ignore
            bucket.actualProgress = 0;
        });

        // Distribute actual progress based on actual dates
        tasks.forEach(task => {
            const hasActualStart = task.actualStartDate && task.actualStartDate.length > 0;
            const hasActualEnd = task.actualEndDate && task.actualEndDate.length > 0;
            const progress = Number(task.progress) || 0;

            if (progress === 0) return; // No progress, skip

            // Calculate task weight based on duration
            const plannedDuration = differenceInDays(parseISO(task.planEndDate), parseISO(task.planStartDate)) + 1;
            const taskWeight = (plannedDuration / totalDuration) * 100;
            const actualWeight = taskWeight * (progress / 100); // Actual contribution to project

            // Determine actual date range
            let actualStart, actualEnd;

            if (hasActualStart) {
                actualStart = parseISO(task.actualStartDate!);
            } else {
                actualStart = parseISO(task.planStartDate);
            }

            if (hasActualEnd) {
                actualEnd = parseISO(task.actualEndDate!);
            } else {
                // If in progress but no end date, use current date or progress-based estimate
                const today = new Date();
                if (progress === 100) {
                    actualEnd = today;
                } else {
                    const progressDays = Math.round(plannedDuration * (progress / 100));
                    actualEnd = new Date(actualStart);
                    actualEnd.setDate(actualEnd.getDate() + Math.max(0, progressDays - 1));
                }
            }

            const actualDuration = differenceInDays(actualEnd, actualStart) + 1;
            if (actualDuration <= 0) return;

            const weightPerDay = actualWeight / actualDuration;

            // Distribute across buckets
            buckets.forEach(bucket => {
                // @ts-ignore
                const bStart = bucket.bucketStart;
                // @ts-ignore
                const bEnd = bucket.bucketEnd;

                // Only add to past/current buckets
                if (isAfter(bStart, new Date())) return;

                // Find overlap
                const overlapStart = isAfter(actualStart, bStart) ? actualStart : bStart;
                const overlapEnd = isBefore(actualEnd, bEnd) ? actualEnd : bEnd;

                if (isAfter(overlapStart, overlapEnd)) return; // No overlap

                const overlapDays = differenceInDays(overlapEnd, overlapStart) + 1;
                // @ts-ignore
                bucket.actualProgress += (overlapDays * weightPerDay);
            });
        });

        // 5. Calculate cumulative values
        let runningPlan = 0;
        let runningActual = 0;

        buckets.forEach((b, i) => {
            // Cumulative Plan
            runningPlan += b.plannedProgress;
            if (runningPlan > 100) runningPlan = 100;
            b.cumulativePlanned = runningPlan;

            // Cumulative Actual
            runningActual += b.actualProgress;
            if (runningActual > 100) runningActual = 100;
            b.cumulativeActual = runningActual;
        });

        return buckets;
    }, [selectedProject, tasks, weeklyLogs, viewMode]);

    // Derived stats - Duration-based current actual
    const currentActual = (() => {
        const totalDur = tasks.reduce((sum, t) => {
            const d = differenceInDays(parseISO(t.planEndDate), parseISO(t.planStartDate)) + 1;
            return sum + Math.max(0, d);
        }, 0);
        if (totalDur <= 0) return 0;
        return tasks.reduce((sum, t) => {
            const d = differenceInDays(parseISO(t.planEndDate), parseISO(t.planStartDate)) + 1;
            const w = (d / totalDur) * 100;
            return sum + (w * (Number(t.progress) || 0) / 100);
        }, 0);
    })();
    // Find Plan value at "Now"
    const now = new Date();
    // @ts-ignore
    const currentBucket = scurveData.find(b => isAfter(b.bucketEnd, now)) || scurveData[scurveData.length - 1];
    const currentPlanned = currentBucket?.cumulativePlanned || 0;
    const variance = currentPlanned - currentActual;

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                <span className="ml-2 text-gray-500">กำลังโหลดข้อมูล...</span>
            </div>
        );
    }

    if (projects.length === 0) {
        return (
            <div className="space-y-6">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900">S-Curve Analysis</h1>
                    <p className="text-gray-500 text-sm mt-0.5">ไม่พบโครงการ กรุณาสร้างโครงการก่อน</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 w-full max-w-full">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
                        <BarChart3 className="w-6 h-6 text-blue-600" />
                        S-Curve Analysis
                    </h1>
                    <p className="text-gray-500 text-sm mt-0.5">วิเคราะห์ความคืบหน้าโครงการแบบ Cumulative</p>
                </div>

                <div className="flex items-center gap-3">
                    {/* View Toggles */}
                    <div className="flex items-center bg-gray-100 p-1 rounded-lg">
                        <button onClick={() => setViewMode('day')}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${viewMode === 'day' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>
                            <CalendarDays className="w-3.5 h-3.5" /> วัน
                        </button>
                        <button onClick={() => setViewMode('week')}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${viewMode === 'week' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>
                            <CalendarRange className="w-3.5 h-3.5" /> สัปดาห์
                        </button>
                        <button onClick={() => setViewMode('month')}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${viewMode === 'month' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>
                            <Calendar className="w-3.5 h-3.5" /> เดือน
                        </button>
                    </div>

                    <div className="h-6 w-px bg-gray-200"></div>

                    <select
                        value={selectedProjectId}
                        onChange={(e) => setSelectedProjectId(e.target.value)}
                        className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:border-blue-500 transition-colors"
                    >
                        {projects.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <p className="text-gray-500 text-xs font-medium uppercase">Planned (To Date)</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">
                        {currentPlanned.toFixed(2)}%
                    </p>
                    <div className="flex items-center gap-1 mt-1">
                        <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                        <span className="text-gray-400 text-xs">เป้าหมาย ณ วันนี้</span>
                    </div>
                </div>

                <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <p className="text-gray-500 text-xs font-medium uppercase">Actual (Current)</p>
                    <p className={`text-2xl font-bold mt-1 ${currentActual >= currentPlanned ? 'text-green-600' : 'text-amber-600'}`}>
                        {currentActual.toFixed(2)}%
                    </p>
                    <div className="flex items-center gap-1 mt-1">
                        <div className="w-2 h-2 rounded-full bg-green-500"></div>
                        <span className="text-gray-400 text-xs">ผลงานจริง</span>
                    </div>
                </div>

                <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <p className="text-gray-500 text-xs font-medium uppercase">Variance</p>
                    <p className={`text-2xl font-bold mt-1 ${currentActual - currentPlanned < 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {(currentActual - currentPlanned).toFixed(2)}%
                    </p>
                    <div className="flex items-center gap-1 mt-1">
                        {currentActual < currentPlanned ? (
                            <>
                                <TrendingDown className="w-3 h-3 text-red-500" />
                                <span className="text-xs text-red-600">ล่าช้ากว่าแผน</span>
                            </>
                        ) : (
                            <>
                                <TrendingUp className="w-3 h-3 text-green-500" />
                                <span className="text-xs text-green-600">เร็วกว่าแผน</span>
                            </>
                        )}
                    </div>
                </div>

                <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <p className="text-gray-500 text-xs font-medium uppercase">Time Elapsed</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">
                        {viewMode === 'week' ? `W${currentBucket?.week || '-'}` : currentBucket?.date}
                    </p>
                    <p className="text-gray-400 text-xs mt-1">Timeline ปัจจุบัน</p>
                </div>
            </div>

            {/* S-Curve Chart */}
            {scurveData.length > 0 && (
                <SCurveChart
                    data={scurveData}
                    currentProgress={currentActual}
                    title={`${selectedProject?.name} (${viewMode === 'day' ? 'รายวัน' : viewMode === 'week' ? 'รายสัปดาห์' : 'รายเดือน'})`}
                />
            )}

            {/* Data Table */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b border-gray-200 flex justify-between items-center">
                    <div>
                        <h3 className="font-semibold text-gray-900">ตารางข้อมูล{viewMode === 'day' ? 'รายวัน' : viewMode === 'week' ? 'รายสัปดาห์' : 'รายเดือน'}</h3>
                        <p className="text-gray-500 text-sm mt-0.5">Progress Data Table</p>
                    </div>
                    {(viewMode === 'day' && scurveData.length > 30) && (
                        <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">แสดงข้อมูลเยอะอาจทำให้โหลดช้า</span>
                    )}
                </div>

                <div className="overflow-x-auto max-h-[500px]">
                    <table className="w-full relative">
                        <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase border-b border-gray-200">
                                    {viewMode === 'day' ? 'วันที่' : viewMode === 'week' ? 'สัปดาห์' : 'เดือน'}
                                </th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-blue-600 uppercase border-b border-gray-200">แผนงาน (%)</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-green-600 uppercase border-b border-gray-200">ผลงาน (%)</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-blue-700 uppercase border-b border-gray-200 bg-blue-50/30">แผนสะสม (%)</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-green-700 uppercase border-b border-gray-200 bg-green-50/30">ผลงานสะสม (%)</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase border-b border-gray-200">ผลต่าง (%)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {scurveData.map((data, idx) => {
                                const gap = data.cumulativeActual - data.cumulativePlanned;
                                // Hide very minimal increments/rows in Day mode if 0 progress to save space? Prefer full data.
                                const isFuture = data.cumulativeActual === 0 && idx > scurveData.indexOf(currentBucket);

                                return (
                                    <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-4 py-2.5 text-sm font-medium text-gray-900">
                                            {data.date}
                                        </td>
                                        <td className="px-4 py-2.5 text-sm text-right text-gray-500">
                                            {data.plannedProgress > 0 ? `+${data.plannedProgress.toFixed(2)}` : '-'}
                                        </td>
                                        <td className="px-4 py-2.5 text-sm text-right text-gray-500">
                                            {(!isFuture && data.actualProgress > 0) ? `+${data.actualProgress.toFixed(2)}` : '-'}
                                        </td>
                                        <td className="px-4 py-2.5 text-sm text-right font-bold text-blue-700 bg-blue-50/10">
                                            {data.cumulativePlanned.toFixed(2)}%
                                        </td>
                                        <td className="px-4 py-2.5 text-sm text-right font-bold text-green-700 bg-green-50/10">
                                            {(!isFuture || data.cumulativeActual > 0) ? `${data.cumulativeActual.toFixed(2)}%` : '-'}
                                        </td>
                                        <td className={`px-4 py-2.5 text-sm text-right font-medium ${gap < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                            {(!isFuture || data.cumulativeActual > 0) ? (
                                                <>
                                                    {gap > 0 ? '+' : ''}{gap.toFixed(2)}%
                                                </>
                                            ) : '-'}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
