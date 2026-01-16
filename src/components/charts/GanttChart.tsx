'use client';

import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Task } from '@/types/construction';
import { format, parseISO, differenceInDays, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval, eachYearOfInterval, startOfMonth, endOfMonth, startOfYear, endOfYear, addMonths, subMonths, isSameDay, isToday, isWeekend, differenceInMonths, isBefore, isAfter } from 'date-fns';
import { th } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, SlidersHorizontal, Eye, EyeOff, Download, ChevronDown, ChevronUp, TrendingUp, Wallet } from 'lucide-react';

interface GanttChartProps {
    tasks: Task[];
    startDate?: string;
    endDate?: string;
    title?: string;
    viewMode?: ViewMode;
    onViewModeChange?: (mode: ViewMode) => void;
}

type ViewMode = 'day' | 'week' | 'month';

export default function GanttChart({ tasks, startDate = '2024-09-01', endDate = '2025-04-30', title, viewMode: controlledViewMode, onViewModeChange }: GanttChartProps) {
    const [internalViewMode, setInternalViewMode] = useState<ViewMode>('week');
    const viewMode = controlledViewMode || internalViewMode;

    const handleViewModeChange = (mode: ViewMode) => {
        if (onViewModeChange) {
            onViewModeChange(mode);
        } else {
            setInternalViewMode(mode);
        }
    };

    const [showDates, setShowDates] = useState(true);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
    const [showSCurve, setShowSCurve] = useState(true);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Toggle category collapse
    const toggleCategory = (category: string) => {
        setCollapsedCategories(prev => {
            const newSet = new Set(prev);
            if (newSet.has(category)) {
                newSet.delete(category);
            } else {
                newSet.add(category);
            }
            return newSet;
        });
    };

    // Configuration
    const config = useMemo(() => {
        switch (viewMode) {
            case 'day': return { cellWidth: 30, label: 'วัน' };
            case 'week': return { cellWidth: 40, label: 'สัปดาห์' };
            case 'month': return { cellWidth: 100, label: 'เดือน' };
        }
    }, [viewMode]);

    // Calculate dynamic range
    const timeRange = useMemo(() => {
        let start, end;
        if (viewMode === 'day') {
            start = startOfMonth(subMonths(currentDate, 1));
            end = endOfMonth(addMonths(currentDate, 1));
        } else if (viewMode === 'week') {
            start = startOfMonth(subMonths(currentDate, 2));
            end = endOfMonth(addMonths(currentDate, 4));
        } else {
            start = startOfYear(subMonths(currentDate, 6));
            end = endOfYear(addMonths(currentDate, 6));
        }
        return { start, end };
    }, [currentDate, viewMode]);

    // Generate timeline headers
    const timeline = useMemo(() => {
        if (viewMode === 'day') {
            const days = eachDayOfInterval({ start: timeRange.start, end: timeRange.end });
            const months = eachMonthOfInterval({ start: timeRange.start, end: timeRange.end });
            return { items: days, groups: months, groupFormat: 'MMMM yyyy', itemFormat: 'd' };
        } else if (viewMode === 'week') {
            const weeks = eachWeekOfInterval({ start: timeRange.start, end: timeRange.end }, { weekStartsOn: 1 });
            const months = eachMonthOfInterval({ start: timeRange.start, end: timeRange.end });
            return { items: weeks, groups: months, groupFormat: 'MMMM yyyy', itemFormat: 'w' };
        } else {
            const months = eachMonthOfInterval({ start: timeRange.start, end: timeRange.end });
            const years = eachYearOfInterval({ start: timeRange.start, end: timeRange.end });
            return { items: months, groups: years, groupFormat: 'yyyy', itemFormat: 'MMM' };
        }
    }, [viewMode, timeRange]);

    // Calculate Total Budget & Weight
    const budgetStats = useMemo(() => {
        const totalCost = tasks.reduce((sum, t) => sum + (t.cost || 0), 0);
        const totalDuration = tasks.reduce((sum, t) => {
            const d = differenceInDays(parseISO(t.planEndDate), parseISO(t.planStartDate)) + 1;
            return sum + Math.max(0, d);
        }, 0);

        // Use Cost weighting if available, else Duration
        const useCostWeighting = tasks.some(t => (t.cost || 0) > 0);

        return {
            totalCost,
            totalDuration,
            useCostWeighting,
            totalWeight: useCostWeighting ? totalCost : totalDuration
        };
    }, [tasks]);

    // Calculate weight for a task
    const getTaskWeight = (task: Task): number => {
        if (budgetStats.totalWeight <= 0) return 0;

        if (budgetStats.useCostWeighting) {
            return ((task.cost || 0) / budgetStats.totalWeight) * 100;
        } else {
            const duration = differenceInDays(parseISO(task.planEndDate), parseISO(task.planStartDate)) + 1;
            return (Math.max(0, duration) / budgetStats.totalWeight) * 100;
        }
    };

    // Calculate S-Curve data for overlay
    const scurveData = useMemo(() => {
        if (tasks.length === 0 || !showSCurve) return [];

        const buckets: { date: Date; cumulativePlan: number; cumulativeActual: number }[] = [];

        timeline.items.forEach((item, idx) => {
            let bucketEnd: Date;
            if (viewMode === 'day') {
                bucketEnd = item;
            } else if (viewMode === 'week') {
                bucketEnd = new Date(item);
                bucketEnd.setDate(bucketEnd.getDate() + 6);
            } else {
                bucketEnd = endOfMonth(item);
            }

            let runningPlan = 0;
            let runningActual = 0;

            tasks.forEach(task => {
                const tStart = parseISO(task.planStartDate);
                const tEnd = parseISO(task.planEndDate);
                const duration = differenceInDays(tEnd, tStart) + 1;
                if (duration <= 0 || budgetStats.totalWeight <= 0) return;

                const taskWeight = getTaskWeight(task);
                const weightPerDay = taskWeight / duration;

                // Calculate Plan contribution up to bucketEnd
                if (isBefore(bucketEnd, tStart)) {
                    // Not started yet
                } else if (isAfter(bucketEnd, tEnd)) {
                    // Task fully planned by this bucket
                    runningPlan += taskWeight;
                } else {
                    // Partial overlap
                    const daysInBucket = differenceInDays(bucketEnd, tStart) + 1;
                    runningPlan += Math.min(taskWeight, daysInBucket * weightPerDay);
                }

                // Calculate Actual contribution
                const progress = Number(task.progress) || 0;
                const actualContribution = taskWeight * (progress / 100);

                // For actual, we attribute it progressively
                let actualStart = task.actualStartDate ? parseISO(task.actualStartDate) : tStart;
                let actualEnd = task.actualEndDate ? parseISO(task.actualEndDate) :
                    (progress > 0 ? new Date() : null);

                if (actualEnd && isBefore(bucketEnd, actualStart)) {
                    // Work hasn't started
                } else if (actualEnd && isAfter(bucketEnd, actualEnd)) {
                    // Work complete in this bucket
                    runningActual += actualContribution;
                } else if (actualEnd && progress > 0) {
                    // Work in progress
                    const actualDuration = differenceInDays(actualEnd, actualStart) + 1;
                    const actualWeightPerDay = actualDuration > 0 ? actualContribution / actualDuration : actualContribution;
                    const daysToNow = differenceInDays(bucketEnd, actualStart) + 1;
                    runningActual += Math.min(actualContribution, Math.max(0, daysToNow) * actualWeightPerDay);
                }
            });

            buckets.push({
                date: bucketEnd,
                cumulativePlan: Math.min(100, runningPlan),
                cumulativeActual: Math.min(100, runningActual)
            });
        });

        return buckets;
    }, [tasks, timeline.items, viewMode, showSCurve, budgetStats]);

    // Calculate current progress stats
    const progressStats = useMemo(() => {
        let totalWeight = 0;
        let actualWeighted = 0;

        tasks.forEach(task => {
            const weight = getTaskWeight(task);
            totalWeight += weight;
            actualWeighted += weight * (Number(task.progress) || 0) / 100;
        });

        return {
            totalActual: actualWeighted,
            totalPlan: scurveData.find(d => isAfter(d.date, new Date()))?.cumulativePlan || 100
        };
    }, [tasks, scurveData]);

    // Auto-scroll logic
    useEffect(() => {
        if (scrollContainerRef.current) {
            let offset = 0;
            if (viewMode === 'day') {
                const todayDiff = differenceInDays(new Date(), timeRange.start);
                offset = todayDiff * config.cellWidth;
            } else if (viewMode === 'month') {
                const todayDiff = differenceInMonths(new Date(), timeRange.start);
                offset = todayDiff * config.cellWidth;
            } else {
                const todayDiff = differenceInDays(new Date(), timeRange.start) / 7;
                offset = todayDiff * config.cellWidth;
            }
            scrollContainerRef.current.scrollLeft = Math.max(0, offset - 300);
        }
    }, [viewMode, timeRange.start, config.cellWidth]);

    const navigate = (direction: 'prev' | 'next') => {
        const amount = viewMode === 'day' ? 1 : viewMode === 'week' ? 3 : 12;
        setCurrentDate(prev => direction === 'prev' ? subMonths(prev, amount) : addMonths(prev, amount));
    };

    const handleExport = () => {
        const headers = ['Category', 'Task Name', 'Cost (Baht)', 'Weight (%)', 'Start Date', 'End Date', 'Duration (Days)', 'Progress (%)'];
        const rows = tasks.map(task => {
            const duration = differenceInDays(parseISO(task.planEndDate), parseISO(task.planStartDate)) + 1;
            const weight = getTaskWeight(task);
            return [
                `"${task.category}"`,
                `"${task.name}"`,
                task.cost || 0,
                weight.toFixed(2),
                task.planStartDate,
                task.planEndDate,
                duration,
                task.progress || 0
            ].join(',');
        });

        const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `gantt_export_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const groupedTasks = useMemo(() => {
        const groups: Record<string, Task[]> = {};
        tasks.forEach(task => {
            if (!groups[task.category]) groups[task.category] = [];
            groups[task.category].push(task);
        });
        return groups;
    }, [tasks]);

    // Calculate category summary
    const getCategorySummary = (catTasks: Task[]) => {
        const totalCost = catTasks.reduce((sum, t) => sum + (t.cost || 0), 0);
        const totalWeight = catTasks.reduce((sum, t) => sum + getTaskWeight(t), 0);
        const avgProgress = catTasks.length > 0
            ? catTasks.reduce((sum, t) => sum + Number(t.progress || 0), 0) / catTasks.length
            : 0;
        return { totalCost, totalWeight, avgProgress, count: catTasks.length };
    };

    const getBarStyle = (task: Task, type: 'plan' | 'actual') => {
        const chartStart = timeRange.start;
        const totalDays = differenceInDays(timeRange.end, chartStart);

        if (type === 'plan') {
            const taskStart = parseISO(task.planStartDate);
            const taskEnd = parseISO(task.planEndDate);
            const startOffsetDays = differenceInDays(taskStart, chartStart);
            const durationDays = differenceInDays(taskEnd, taskStart) + 1;

            let leftPx = 0;
            let widthPx = 0;

            if (viewMode === 'day') {
                leftPx = startOffsetDays * config.cellWidth;
                widthPx = durationDays * config.cellWidth;
            } else if (viewMode === 'week') {
                leftPx = (startOffsetDays / 7) * config.cellWidth;
                widthPx = (durationDays / 7) * config.cellWidth;
            } else if (viewMode === 'month') {
                leftPx = (startOffsetDays / 30.44) * config.cellWidth;
                widthPx = (durationDays / 30.44) * config.cellWidth;
            }

            if ((leftPx < 0 && leftPx + widthPx < 0) || (leftPx > totalDays * config.cellWidth)) {
                return { display: 'none' as const };
            }

            return {
                left: `${leftPx}px`,
                width: `${Math.max(4, widthPx)}px`
            };
        } else {
            const hasActualStart = task.actualStartDate && task.actualStartDate.length > 0;
            const hasActualEnd = task.actualEndDate && task.actualEndDate.length > 0;

            let actualStart, actualEnd;

            if (hasActualStart) {
                actualStart = parseISO(task.actualStartDate!);
            } else {
                actualStart = parseISO(task.planStartDate);
            }

            if (hasActualEnd) {
                actualEnd = parseISO(task.actualEndDate!);
            } else if (Number(task.progress) > 0) {
                const plannedDuration = differenceInDays(parseISO(task.planEndDate), parseISO(task.planStartDate)) + 1;
                const progressDays = Math.round(plannedDuration * (Number(task.progress) / 100));
                actualEnd = new Date(actualStart);
                actualEnd.setDate(actualEnd.getDate() + Math.max(0, progressDays - 1));
            } else {
                return { display: 'none' as const };
            }

            const startOffsetDays = differenceInDays(actualStart, chartStart);
            const durationDays = differenceInDays(actualEnd, actualStart) + 1;

            let leftPx = 0;
            let widthPx = 0;

            if (viewMode === 'day') {
                leftPx = startOffsetDays * config.cellWidth;
                widthPx = durationDays * config.cellWidth;
            } else if (viewMode === 'week') {
                leftPx = (startOffsetDays / 7) * config.cellWidth;
                widthPx = (durationDays / 7) * config.cellWidth;
            } else if (viewMode === 'month') {
                leftPx = (startOffsetDays / 30.44) * config.cellWidth;
                widthPx = (durationDays / 30.44) * config.cellWidth;
            }

            if ((leftPx < 0 && leftPx + widthPx < 0) || (leftPx > totalDays * config.cellWidth)) {
                return { display: 'none' as const };
            }

            return {
                left: `${leftPx}px`,
                width: `${Math.max(4, widthPx)}px`
            };
        }
    };

    // Get S-Curve point position
    const getSCurvePosition = (value: number, idx: number) => {
        const x = idx * config.cellWidth + config.cellWidth / 2;
        const y = 60 - (value / 100) * 55; // Scale to fit in 60px height area
        return { x, y };
    };

    // Generate SVG path for S-Curve
    const generateSCurvePath = (type: 'plan' | 'actual'): string => {
        if (scurveData.length < 2) return '';

        const points = scurveData.map((d, idx) => {
            const value = type === 'plan' ? d.cumulativePlan : d.cumulativeActual;
            return getSCurvePosition(value, idx);
        });

        return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    };

    const stickyWidth = showDates ? 520 : 290;

    return (
        <div className="flex flex-col h-[750px] bg-white rounded-xl border border-gray-200 shadow-sm w-full max-w-full overflow-hidden">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row items-center justify-between p-4 border-b border-gray-100 bg-white gap-4 flex-shrink-0">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                        <SlidersHorizontal className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-gray-900">{title || 'Project Schedule'}</h3>
                        <p className="text-xs text-gray-600">
                            {format(timeRange.start, 'MMM yyyy', { locale: th })} - {format(timeRange.end, 'MMM yyyy', { locale: th })}
                        </p>
                    </div>
                </div>

                {/* Budget Summary */}
                <div className="flex items-center gap-4 px-4 py-2 bg-gradient-to-r from-blue-50 to-green-50 rounded-lg border border-blue-100">
                    <div className="flex items-center gap-2">
                        <Wallet className="w-4 h-4 text-blue-600" />
                        <div>
                            <p className="text-xs text-gray-600 uppercase">Total Budget</p>
                            <p className="text-sm font-bold text-blue-700">{budgetStats.totalCost.toLocaleString()} <span className="text-xs font-normal">บาท</span></p>
                        </div>
                    </div>
                    <div className="w-px h-8 bg-gray-200"></div>
                    <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-green-600" />
                        <div>
                            <p className="text-xs text-gray-600 uppercase">Total Actual</p>
                            <p className="text-sm font-bold text-green-700">{progressStats.totalActual.toFixed(2)}%</p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 bg-gray-50 p-1 rounded-lg border border-gray-100">
                    {(['day', 'week', 'month'] as ViewMode[]).map((mode) => (
                        <button key={mode} onClick={() => handleViewModeChange(mode)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all capitalize ${viewMode === mode ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'
                                }`}>
                            {mode === 'day' ? 'วัน' : mode === 'week' ? 'สัปดาห์' : 'เดือน'}
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-2">
                    <button onClick={() => setShowSCurve(!showSCurve)}
                        title={showSCurve ? 'ซ่อน S-Curve' : 'แสดง S-Curve'}
                        className={`p-2 rounded-lg border transition-colors ${showSCurve ? 'bg-green-50 border-green-200 text-green-600' : 'bg-white border-gray-200 text-gray-500'}`}>
                        <TrendingUp className="w-4 h-4" />
                    </button>
                    <button onClick={() => setShowDates(!showDates)}
                        className={`p-2 rounded-lg border transition-colors ${showDates ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-white border-gray-200 text-gray-500'}`}>
                        {showDates ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                    <div className="h-6 w-px bg-gray-200 mx-1"></div>
                    <button onClick={() => navigate('prev')} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 border border-gray-200">
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button onClick={() => setCurrentDate(new Date())} className="px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg border border-gray-200">
                        วันนี้
                    </button>
                    <button onClick={() => navigate('next')} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 border border-gray-200">
                        <ChevronRight className="w-4 h-4" />
                    </button>
                    <button onClick={handleExport} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 border border-gray-200" title="Export CSV">
                        <Download className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 min-h-0 w-full relative">
                <div ref={scrollContainerRef} className="absolute inset-0 overflow-auto custom-scrollbar">
                    <div className="min-w-max flex flex-col">

                        {/* Header Row (Sticky Top) */}
                        <div className="sticky top-0 z-30 flex bg-white border-b border-gray-200 shadow-sm">
                            {/* Sticky Left Corner */}
                            <div className="sticky left-0 z-40 bg-gray-50 border-r border-gray-200 flex items-end pb-2 px-4 shadow-[4px_0_10px_rgba(0,0,0,0.03)] h-16"
                                style={{ width: `${stickyWidth}px`, minWidth: `${stickyWidth}px` }}>
                                <div className="flex-1 text-xs font-semibold text-gray-600 uppercase">Task Name</div>
                                {showDates && (
                                    <>
                                        <div className="w-20 text-right text-xs font-semibold text-gray-600 uppercase">Cost</div>
                                        <div className="w-14 text-right text-xs font-semibold text-blue-600 uppercase">Weight</div>
                                        <div className="w-16 text-right text-xs font-semibold text-gray-600 uppercase">Q'ty</div>
                                        <div className="w-24 text-right text-xs font-semibold text-gray-600 uppercase">Period</div>
                                    </>
                                )}
                                <div className="w-12 text-right text-xs font-semibold text-gray-600 uppercase">%Prog</div>
                            </div>

                            {/* Timeline Headers */}
                            <div className="flex flex-col h-16 bg-white relative">
                                <div className="flex h-8 border-b border-gray-100">
                                    {timeline.groups.map((group, idx) => {
                                        let width = 0;
                                        if (viewMode === 'day') {
                                            width = eachDayOfInterval({ start: startOfMonth(group), end: endOfMonth(group) }).length * config.cellWidth;
                                        } else if (viewMode === 'week') {
                                            width = 4.35 * config.cellWidth;
                                        } else {
                                            width = 12 * config.cellWidth;
                                            if (viewMode === 'month') {
                                                const monthsInYear = timeline.items.filter(m => m.getFullYear() === group.getFullYear()).length;
                                                width = monthsInYear * config.cellWidth;
                                            }
                                        }

                                        return (
                                            <div key={idx} className="flex items-center justify-center px-1 text-xs font-bold text-gray-700 bg-gray-50/50 border-r border-gray-100 truncate"
                                                style={{ width: `${width}px`, minWidth: `${width}px` }}>
                                                {format(group, timeline.groupFormat, { locale: th })}
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="flex h-8">
                                    {timeline.items.map((item, idx) => {
                                        const isTodayDay = viewMode === 'day' && isToday(item);
                                        const isWeekendDay = viewMode === 'day' && isWeekend(item);

                                        let label = '';
                                        if (viewMode === 'day') label = format(item, 'd');
                                        else if (viewMode === 'week') label = format(item, 'w');
                                        else label = format(item, 'MMM', { locale: th });

                                        return (
                                            <div key={idx} className={`flex-shrink-0 border-r border-gray-50 flex items-center justify-center text-xs ${isTodayDay ? 'bg-blue-600 text-white font-bold' : isWeekendDay ? 'bg-gray-50 text-gray-500' : 'text-gray-600'
                                                }`} style={{ width: config.cellWidth }}>
                                                {label}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* S-Curve Overlay Area */}
                        {showSCurve && scurveData.length > 0 && (
                            <div className="flex border-b border-gray-200 bg-gradient-to-b from-gray-50/50 to-white">
                                <div className="sticky left-0 z-20 bg-white border-r border-gray-200 px-4 py-2 shadow-[4px_0_10px_rgba(0,0,0,0.02)]"
                                    style={{ width: `${stickyWidth}px`, minWidth: `${stickyWidth}px` }}>
                                    <div className="flex items-center justify-between h-full">
                                        <div className="text-xs font-bold text-gray-700 flex items-center gap-2">
                                            <TrendingUp className="w-4 h-4 text-blue-500" />
                                            S-Curve
                                        </div>
                                        <div className="flex items-center gap-3 text-[10px]">
                                            <div className="flex items-center gap-1">
                                                <div className="w-3 h-0.5 bg-blue-500"></div>
                                                <span className="text-gray-600">Plan</span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <div className="w-3 h-0.5 bg-green-500"></div>
                                                <span className="text-gray-600">Actual</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="relative h-16" style={{ width: `${timeline.items.length * config.cellWidth}px` }}>
                                    <svg className="absolute inset-0 w-full h-full overflow-visible" preserveAspectRatio="none">
                                        {/* Plan line */}
                                        <path
                                            d={generateSCurvePath('plan')}
                                            fill="none"
                                            stroke="#3b82f6"
                                            strokeWidth="2"
                                            strokeDasharray="4 2"
                                            opacity="0.7"
                                        />
                                        {/* Actual line */}
                                        <path
                                            d={generateSCurvePath('actual')}
                                            fill="none"
                                            stroke="#22c55e"
                                            strokeWidth="2.5"
                                        />
                                    </svg>
                                    {/* Y-axis labels */}
                                    <div className="absolute left-2 top-1 text-xs text-gray-500">100%</div>
                                    <div className="absolute left-2 bottom-1 text-xs text-gray-500">0%</div>
                                </div>
                            </div>
                        )}

                        {/* Task Rows */}
                        <div>
                            {Object.entries(groupedTasks).map(([category, catTasks]) => {
                                const isCollapsed = collapsedCategories.has(category);
                                const categorySummary = getCategorySummary(catTasks);

                                return (
                                    <div key={category}>
                                        {/* Category Header - Collapsible */}
                                        <div
                                            className="flex bg-blue-50/70 border-b border-gray-100 cursor-pointer hover:bg-blue-100/50 transition-colors"
                                            onClick={() => toggleCategory(category)}
                                        >
                                            <div className="sticky left-0 z-20 bg-blue-50/90 backdrop-blur-sm border-r border-gray-200 px-4 py-2 shadow-[4px_0_10px_rgba(0,0,0,0.01)] flex items-center gap-2"
                                                style={{ width: `${stickyWidth}px`, minWidth: `${stickyWidth}px` }}>
                                                <button className="p-0.5 hover:bg-blue-200/50 rounded transition-colors">
                                                    {isCollapsed ? <ChevronRight className="w-4 h-4 text-blue-600" /> : <ChevronDown className="w-4 h-4 text-blue-600" />}
                                                </button>
                                                <span className="flex-1 text-xs font-bold text-blue-800 uppercase">{category}</span>
                                                <span className="text-xs text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded">{categorySummary.count} งาน</span>
                                                {showDates && (
                                                    <>
                                                        <span className="w-20 text-right text-xs font-semibold text-blue-700">
                                                            {categorySummary.totalCost.toLocaleString()}
                                                        </span>
                                                        <span className="w-14 text-right text-xs font-bold text-blue-600">
                                                            {categorySummary.totalWeight.toFixed(1)}%
                                                        </span>
                                                        <span className="w-16"></span>
                                                        <span className="w-24"></span>
                                                    </>
                                                )}
                                                <span className="w-12 text-right text-xs font-bold text-blue-700">
                                                    {categorySummary.avgProgress.toFixed(0)}%
                                                </span>
                                            </div>
                                            <div className="flex-1"></div>
                                        </div>

                                        {/* Task Items */}
                                        {!isCollapsed && catTasks.map(task => {
                                            const weight = getTaskWeight(task);

                                            return (
                                                <div key={task.id} className="flex h-9 border-b border-gray-50 hover:bg-gray-50 transition-colors group">
                                                    <div className="sticky left-0 z-20 bg-white group-hover:bg-gray-50 border-r border-gray-200 flex items-center px-4 shadow-[4px_0_10px_rgba(0,0,0,0.02)]"
                                                        style={{ width: `${stickyWidth}px`, minWidth: `${stickyWidth}px` }}>
                                                        <div className="w-5"></div> {/* Indent for collapse icon alignment */}
                                                        <div className="flex-1 truncate text-xs text-gray-700 font-medium pl-2" title={task.name}>
                                                            {task.name}
                                                        </div>

                                                        {showDates && (
                                                            <>
                                                                <div className="w-20 text-right text-xs text-gray-600 font-medium">
                                                                    {task.cost ? task.cost.toLocaleString() : '-'}
                                                                </div>
                                                                <div className="w-14 text-right text-xs text-blue-600 font-semibold">
                                                                    {weight.toFixed(2)}%
                                                                </div>
                                                                <div className="w-16 text-right text-xs text-gray-600 font-medium">
                                                                    {task.quantity || '-'}
                                                                </div>
                                                                <div className="w-24 text-right text-xs text-gray-500">
                                                                    {format(parseISO(task.planStartDate), 'd/MM')} - {format(parseISO(task.planEndDate), 'd/MM')}
                                                                </div>
                                                            </>
                                                        )}
                                                        <div className={`w-12 text-right text-xs font-bold ${Number(task.progress) === 100 ? 'text-green-600' : Number(task.progress) > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                                                            {Number(task.progress)}%
                                                        </div>
                                                    </div>

                                                    <div className="relative" style={{ width: `${timeline.items.length * config.cellWidth}px` }}>
                                                        <div className="absolute inset-0 flex pointer-events-none">
                                                            {timeline.items.map((item, idx) => (
                                                                <div key={idx} className={`flex-shrink-0 border-r border-gray-50 h-full ${viewMode === 'day' && isWeekend(item) ? 'bg-gray-50/50' : ''
                                                                    } ${viewMode === 'day' && isToday(item) ? 'bg-blue-50/10' : ''}`}
                                                                    style={{ width: config.cellWidth }} />
                                                            ))}
                                                            {/* Today Line - Orange */}
                                                            {(() => {
                                                                const todayOffset = differenceInDays(new Date(), timeRange.start);
                                                                let leftPx = 0;
                                                                if (viewMode === 'day') {
                                                                    leftPx = todayOffset * config.cellWidth;
                                                                } else if (viewMode === 'week') {
                                                                    leftPx = (todayOffset / 7) * config.cellWidth;
                                                                } else {
                                                                    leftPx = (todayOffset / 30.44) * config.cellWidth;
                                                                }
                                                                return (
                                                                    <div
                                                                        className="absolute top-0 bottom-0 z-20 pointer-events-none"
                                                                        style={{ left: `${leftPx}px` }}
                                                                    >
                                                                        <div className="absolute top-0 bottom-0 w-0.5 bg-orange-500"></div>
                                                                    </div>
                                                                );
                                                            })()}
                                                        </div>

                                                        <div className="absolute h-2.5 top-[5px] rounded-sm bg-blue-300/60 border border-blue-400/50"
                                                            style={getBarStyle(task, 'plan')} />

                                                        {Number(task.progress) > 0 && (
                                                            <div className={`absolute h-1.5 top-[19px] rounded-sm z-10 ${Number(task.progress) === 100 ? 'bg-green-500' : 'bg-green-500'}`}
                                                                style={getBarStyle(task, 'actual')} />
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Footer Summary */}
                        <div className="sticky bottom-0 z-30 flex bg-gray-100 border-t-2 border-gray-300 shadow-[0_-4px_10px_rgba(0,0,0,0.1)]">
                            <div className="sticky left-0 z-20 bg-gray-100 border-r border-gray-300 px-4 py-3 shadow-[4px_0_10px_rgba(0,0,0,0.05)]"
                                style={{ width: `${stickyWidth}px`, minWidth: `${stickyWidth}px` }}>
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-gray-700 uppercase">Total</span>
                                    {showDates && (
                                        <>
                                            <span className="text-xs font-bold text-gray-800">
                                                {budgetStats.totalCost.toLocaleString()} บาท
                                            </span>
                                            <span className="text-xs font-bold text-blue-600">
                                                100.00%
                                            </span>
                                        </>
                                    )}
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-gray-600">Actual:</span>
                                        <span className="text-lg font-bold text-green-600">{progressStats.totalActual.toFixed(2)}%</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex-1"></div>
                        </div>
                    </div>
                </div>
            </div>

            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar {
                    height: 12px;
                    width: 12px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: #f1f5f9;
                    border-top: 1px solid #e2e8f0;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #cbd5e1;
                    border-radius: 6px;
                    border: 3px solid #f1f5f9;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #94a3b8;
                }
            `}</style>
        </div>
    );
}
