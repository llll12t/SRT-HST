'use client';

import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Task } from '@/types/construction';
import { format, parseISO, differenceInDays, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval, eachYearOfInterval, startOfMonth, endOfMonth, startOfYear, endOfYear, addMonths, subMonths, isSameDay, isToday, isWeekend, differenceInMonths } from 'date-fns';
import { th } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, SlidersHorizontal, Eye, EyeOff, Download } from 'lucide-react';

interface GanttChartProps {
    tasks: Task[];
    startDate?: string;
    endDate?: string;
    title?: string;
}

type ViewMode = 'day' | 'week' | 'month';

export default function GanttChart({ tasks, startDate = '2024-09-01', endDate = '2025-04-30', title }: GanttChartProps) {
    const [viewMode, setViewMode] = useState<ViewMode>('day');
    const [showDates, setShowDates] = useState(true);
    const [currentDate, setCurrentDate] = useState(new Date());
    const scrollContainerRef = useRef<HTMLDivElement>(null);

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
        const headers = ['Category', 'Task Name', 'Start Date', 'End Date', 'Duration (Days)', 'Weight (%)', 'Progress (%)'];
        const rows = tasks.map(task => {
            const duration = differenceInDays(parseISO(task.planEndDate), parseISO(task.planStartDate)) + 1;
            return [
                `"${task.category}"`,
                `"${task.name}"`,
                task.planStartDate,
                task.planEndDate,
                duration,
                task.weight || 0,
                task.progress || 0
            ].join(',');
        });

        const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n'); // Add BOM for Excel thai support
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

    const getBarStyle = (task: Task, type: 'plan' | 'actual') => {
        const chartStart = timeRange.start;
        const totalDays = differenceInDays(timeRange.end, chartStart);

        const taskStart = parseISO(task.planStartDate);
        const taskEnd = parseISO(task.planEndDate);

        const startOffsetDays = differenceInDays(taskStart, chartStart);
        const durationDays = differenceInDays(taskEnd, taskStart) + 1;

        let widthDays = durationDays;
        if (type === 'actual') {
            widthDays = durationDays * ((Number(task.progress) || 0) / 100);
        }

        let leftPx = 0;
        let widthPx = 0;

        if (viewMode === 'day') {
            leftPx = startOffsetDays * config.cellWidth;
            widthPx = widthDays * config.cellWidth;
        } else if (viewMode === 'week') {
            leftPx = (startOffsetDays / 7) * config.cellWidth;
            widthPx = (widthDays / 7) * config.cellWidth;
        } else if (viewMode === 'month') {
            leftPx = (startOffsetDays / 30.44) * config.cellWidth;
            widthPx = (widthDays / 30.44) * config.cellWidth;
        }

        if ((leftPx < 0 && leftPx + widthPx < 0) || (leftPx > totalDays * config.cellWidth)) {
            return { display: 'none' as const };
        }

        return {
            left: `${leftPx}px`,
            width: `${Math.max(4, widthPx)}px`
        };
    };

    const stickyWidth = showDates ? 370 : 250;

    return (
        <div className="flex flex-col h-[700px] bg-white rounded-xl border border-gray-200 shadow-sm w-full max-w-full overflow-hidden">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row items-center justify-between p-4 border-b border-gray-100 bg-white gap-4 flex-shrink-0">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                        <SlidersHorizontal className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-gray-900">{title || 'Project Schedule'}</h3>
                        <p className="text-xs text-gray-500">
                            {format(timeRange.start, 'MMM yyyy', { locale: th })} - {format(timeRange.end, 'MMM yyyy', { locale: th })}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 bg-gray-50 p-1 rounded-lg border border-gray-100">
                    {(['day', 'week', 'month'] as ViewMode[]).map((mode) => (
                        <button key={mode} onClick={() => setViewMode(mode)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all capitalize ${viewMode === mode ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'
                                }`}>
                            {mode === 'day' ? 'วัน' : mode === 'week' ? 'สัปดาห์' : 'เดือน'}
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-2">
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
                                <div className="flex-1 text-xs font-semibold text-gray-500 uppercase">Task Name</div>
                                <div className="w-12 text-right text-xs font-semibold text-gray-500 uppercase" title="Weight (% Work)">Wt.</div>
                                {showDates && <div className="w-24 text-right text-xs font-semibold text-gray-500 uppercase">Period</div>}
                                <div className="w-10 text-right text-xs font-semibold text-gray-500 uppercase">%</div>
                            </div>

                            {/* Timeline Headers */}
                            <div className="flex flex-col h-16 bg-white">
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
                                            <div key={idx} className="flex items-center justify-center px-1 text-[10px] font-bold text-gray-600 bg-gray-50/50 border-r border-gray-100 truncate"
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
                                            <div key={idx} className={`flex-shrink-0 border-r border-gray-50 flex items-center justify-center text-[10px] ${isTodayDay ? 'bg-blue-600 text-white font-bold' : isWeekendDay ? 'bg-gray-50 text-gray-400' : 'text-gray-500'
                                                }`} style={{ width: config.cellWidth }}>
                                                {label}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Task Rows */}
                        <div>
                            {Object.entries(groupedTasks).map(([category, catTasks]) => (
                                <div key={category}>
                                    <div className="flex bg-blue-50/50 border-b border-gray-100">
                                        <div className="sticky left-0 z-20 bg-blue-50/80 backdrop-blur-sm border-r border-gray-200 px-4 py-1.5 text-xs font-bold text-blue-800 uppercase shadow-[4px_0_10px_rgba(0,0,0,0.01)]"
                                            style={{ width: `${stickyWidth}px`, minWidth: `${stickyWidth}px` }}>
                                            {category}
                                        </div>
                                        <div className="flex-1"></div>
                                    </div>

                                    {catTasks.map(task => (
                                        <div key={task.id} className="flex h-9 border-b border-gray-50 hover:bg-gray-50 transition-colors group">
                                            <div className="sticky left-0 z-20 bg-white group-hover:bg-gray-50 border-r border-gray-200 flex items-center px-4 shadow-[4px_0_10px_rgba(0,0,0,0.02)]"
                                                style={{ width: `${stickyWidth}px`, minWidth: `${stickyWidth}px` }}>
                                                <div className="flex-1 truncate text-xs text-gray-700 font-medium" title={task.name}>
                                                    {task.name}
                                                </div>

                                                <div className="w-12 text-right text-[10px] text-gray-500 font-medium mr-2">
                                                    {Number(task.weight) > 0 ? `${Number(task.weight)}%` : '-'}
                                                </div>

                                                {showDates && (
                                                    <div className="w-24 text-right text-[9px] text-gray-400">
                                                        {format(parseISO(task.planStartDate), 'd/MM')} - {format(parseISO(task.planEndDate), 'd/MM')}
                                                    </div>
                                                )}
                                                <div className={`w-10 text-right text-[10px] font-bold ${Number(task.progress) === 100 ? 'text-green-600' : Number(task.progress) > 0 ? 'text-blue-600' : 'text-gray-300'}`}>
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
                                                    {viewMode === 'day' && (
                                                        <div className="absolute top-0 bottom-0 border-l border-blue-400 border-dashed z-0 opacity-40 ml-[50%]"
                                                            style={{ left: `${(differenceInDays(new Date(), timeRange.start)) * config.cellWidth}px` }} />
                                                    )}
                                                </div>

                                                <div className="absolute h-2.5 top-[5px] rounded-sm bg-blue-300/60 border border-blue-400/50"
                                                    style={getBarStyle(task, 'plan')} />

                                                {Number(task.progress) > 0 && (
                                                    <div className={`absolute h-1.5 top-[19px] rounded-sm z-10 ${Number(task.progress) === 100 ? 'bg-green-500' : 'bg-green-500'}`}
                                                        style={getBarStyle(task, 'actual')} />
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ))}
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
