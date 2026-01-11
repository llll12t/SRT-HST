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
    const [viewMode, setViewMode] = useState<ViewMode>('week'); // Default to Week

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
                label = format(bucketEnd, 'd MMM');
                bucketId = format(bucketEnd, 'yyyy-MM-dd');
                currentIterDate = addDays(currentIterDate, 1);
            } else if (viewMode === 'week') {
                bucketEnd = addDays(currentIterDate, 6);
                label = `W${index}`;
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

        // 2. Distribute Planned Weight
        tasks.forEach(task => {
            const weight = Number(task.weight) || 0;
            if (weight <= 0) return;

            const tStart = parseISO(task.planStartDate);
            const tEnd = parseISO(task.planEndDate);
            const duration = differenceInDays(tEnd, tStart) + 1;
            if (duration <= 0) return;
            const weightPerDay = weight / duration;

            // Optimize: Instead of iterating days, iterate buckets and check overlap
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

        // 3. Cumulative & Actuals
        let runningPlan = 0;
        let runningActual = 0; // Not used directly if we interpolate logs, but useful fallback

        const now = new Date();
        const currentRealtimeProgress = tasks.reduce((sum, t) =>
            sum + ((Number(t.weight) || 0) * (Number(t.progress) || 0) / 100), 0
        );

        buckets.forEach((b, i) => {
            // -- Plan --
            runningPlan += b.plannedProgress;
            if (runningPlan > 100) runningPlan = 100;
            b.cumulativePlanned = runningPlan;

            // -- Actual --
            // @ts-ignore
            const bEnd = b.bucketEnd;

            // If future, stop Actuals
            if (isAfter(bEnd, now)) {
                b.cumulativeActual = 0;
                // Special case: if "now" is inside this bucket, we might show current progress?
                // Visual preference: show line up to last COMPLETED bucket or interpolate to Now?
                // Let's show 0 for future buckets so line stops.
                return;
            }

            // Logic: Find the WeeklyLog closest to or exactly at this bucket end
            // This is tricky for "Day" view because logs are only weekly.
            // So we INTERPOLATE linearly between logs.

            // Find Log matching this specific time or latest before this time
            // Simplified: Use currentRealtimeProgress if it's the latest bucket before Now.
            // Or linear interpolation from 0 to CurrentProgress across ProjectStart to Now.

            // Robust Method: Linear Interpolation based on Total Project Progress vs Time
            // (Assuming linear progress is a poor assumption, but better than nothing if no weekly logs).
            // BETTER: Use Weekly Logs as keyframes.

            // 1. Find log immediately before or at bEnd
            const pastLogs = weeklyLogs.filter(l => {
                // Assuming we can convert weekNumber to date?? No, weekNumber is abstract.
                // We need date-based logs roughly. 
                // If we only have 'Week 1, Week 2', we assume they map to project weeks.
                return true;
            }).sort((a, b) => a.weekNumber - b.weekNumber);

            // Calculate "Week Number" of this bucket relative to project start for Log lookup
            const daysFromStart = differenceInDays(bEnd, projectStart);
            const projectWeekNum = Math.ceil((daysFromStart + 1) / 7);

            const exactLog = pastLogs.find(l => l.weekNumber === projectWeekNum);

            if (exactLog) {
                b.cumulativeActual = exactLog.actualCumulativeProgress;
            } else {
                // Interpolation or Fallback
                if (isSameDay(bEnd, now) || isWithinInterval(now, { start: addDays(bEnd, -6), end: addDays(bEnd, 6) })) {
                    // Close to now? Use realtime
                    // Actually, if we are purely "Day" view, we want specific day value.
                    // Simple Approach: Linear Ramp up to Current Progress
                    const totalDaysPassed = differenceInDays(now, projectStart);
                    const currentDays = differenceInDays(bEnd, projectStart);
                    if (totalDaysPassed > 0) {
                        b.cumulativeActual = currentRealtimeProgress * (Math.max(0, currentDays) / totalDaysPassed);
                        // Clamp to current
                        if (currentDays >= totalDaysPassed) b.cumulativeActual = currentRealtimeProgress;
                    }
                } else {
                    // Past day with no log? Linear ramp
                    const totalDaysPassed = differenceInDays(now, projectStart);
                    const currentDays = differenceInDays(bEnd, projectStart);
                    if (totalDaysPassed > 0) {
                        b.cumulativeActual = currentRealtimeProgress * (Math.max(0, currentDays) / totalDaysPassed);
                    }
                }
            }
        });

        // Post-calcs for incremental consistency display
        buckets.forEach((b, i) => {
            const prev = i > 0 ? buckets[i - 1].cumulativeActual : 0;
            // only calc incremental if both are valid (non-zero or start)
            if (b.cumulativeActual > 0 || i === 0) {
                b.actualProgress = Math.max(0, b.cumulativeActual - prev);
            } else {
                b.actualProgress = 0;
            }
        });

        return buckets;
    }, [selectedProject, tasks, weeklyLogs, viewMode]);

    // Derived stats
    const currentActual = tasks.reduce((sum, t) =>
        sum + ((Number(t.weight) || 0) * (Number(t.progress) || 0) / 100), 0
    );
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
                                <th className="px-4 py-3 text-right text-xs font-semibold text-blue-600 uppercase border-b border-gray-200">Plan %</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-green-600 uppercase border-b border-gray-200">Actual %</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-blue-700 uppercase border-b border-gray-200 bg-blue-50/30">Cum. Plan</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-green-700 uppercase border-b border-gray-200 bg-green-50/30">Cum. Actual</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase border-b border-gray-200">Gap</th>
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
                                            {viewMode === 'week' ? `Week ${data.week} (${data.date})` : data.date}
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
