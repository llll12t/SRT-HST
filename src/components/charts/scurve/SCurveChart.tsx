'use client';

import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Task } from '@/types/construction';
import { format, parseISO, differenceInDays, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval, eachYearOfInterval, startOfMonth, endOfMonth, startOfYear, endOfYear, addMonths, subMonths, isSameDay, differenceInMonths, isBefore, isAfter, addDays, isValid } from 'date-fns';
import { ChevronRight, ChevronDown, Plus } from 'lucide-react';

// Re-use types and components from Gantt
import { ViewMode, VisibleColumns, DateRange } from '../gantt/types';
import GanttToolbar from '../gantt/GanttToolbar';
import TimelineHeader from '../gantt/TimelineHeader';
import { getCategorySummary, isWeekend, formatDateRange } from '../gantt/utils';

interface SCurveChartProps {
    tasks: Task[];
    startDate?: string;
    endDate?: string;
    title?: string;
    viewMode?: ViewMode;
    onViewModeChange?: (mode: ViewMode) => void;
}

export default function SCurveChart(props: SCurveChartProps) {
    const { tasks, startDate, endDate, title, viewMode: controlledViewMode, onViewModeChange } = props;
    const [internalViewMode, setInternalViewMode] = useState<ViewMode>('day');
    const viewMode = controlledViewMode || internalViewMode;

    const handleViewModeChange = (mode: ViewMode) => {
        if (onViewModeChange) {
            onViewModeChange(mode);
        } else {
            setInternalViewMode(mode);
        }
    };

    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(0);

    // Monitor container width for auto-fit
    useEffect(() => {
        if (!scrollContainerRef.current) return;
        const resizeObserver = new ResizeObserver(entries => {
            for (let entry of entries) {
                if (entry.contentRect.width > 0) setContainerWidth(entry.contentRect.width);
            }
        });
        resizeObserver.observe(scrollContainerRef.current);
        return () => resizeObserver.disconnect();
    }, []);

    // Chart Time Range (Strictly Project Dates)
    const timeRange = useMemo(() => {
        let pStart = startDate ? parseISO(startDate) : startOfMonth(new Date());
        let pEnd = endDate ? parseISO(endDate) : endOfMonth(addMonths(new Date(), 12));

        // Ensure valid initial dates
        if (!isValid(pStart)) pStart = startOfMonth(new Date());
        if (!isValid(pEnd)) pEnd = endOfMonth(addMonths(new Date(), 12));

        return { start: pStart, end: pEnd };
    }, [startDate, endDate]);

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

    const config = useMemo(() => {
        let base;
        switch (viewMode) {
            case 'day': base = { cellWidth: 30, label: 'วัน' }; break;
            case 'week': base = { cellWidth: 40, label: 'สัปดาห์' }; break;
            case 'month': base = { cellWidth: 100, label: 'เดือน' }; break;
            default: base = { cellWidth: 40, label: 'สัปดาห์' };
        }
        if (containerWidth > 0 && timeline.items.length > 0) {
            const totalRequired = timeline.items.length * base.cellWidth;
            if (totalRequired < containerWidth) {
                const fitWidth = (containerWidth - 2) / timeline.items.length;
                return { ...base, cellWidth: Math.max(base.cellWidth, fitWidth) };
            }
        }
        return base;
    }, [viewMode, containerWidth, timeline.items.length]);

    const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
    const [collapsedSubcategories, setCollapsedSubcategories] = useState<Set<string>>(new Set());
    const [showDates, setShowDates] = useState(true);
    const [currentDate, setCurrentDate] = useState(new Date());

    // Basic columns support (can be extended)
    // Basic columns support (can be extended)
    const [visibleColumns, setVisibleColumns] = useState<VisibleColumns>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('scurve-visible-columns');
            if (saved) {
                try {
                    return JSON.parse(saved);
                } catch (e) { console.error(e); }
            }
        }
        return {
            cost: true,
            weight: true,
            progress: true,
            quantity: true,
            period: true,
            planDuration: false,
            actualDuration: false
        };
    });

    // Save settings when changed
    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('scurve-visible-columns', JSON.stringify(visibleColumns));
        }
    }, [visibleColumns]);

    // Helper functions for hierarchy (Moved up for use in sCurveData)
    const getChildTasks = (parentId: string) => {
        return tasks.filter(t => t.parentTaskId === parentId).sort((a, b) => a.order - b.order);
    };

    const hasChildren = (taskId: string) => {
        return tasks.some(t => t.parentTaskId === taskId);
    };

    // Calculate Total Budget & Weight
    const budgetStats = useMemo(() => {
        // Only sum LEAF tasks to avoid double counting if parents are just summaries
        // Or if your system allows cost on parents, remove this filter. 
        // Assuming standard behavior: Leaf tasks drive the physical S-Curve.
        const leafTasks = tasks.filter(t => !tasks.some(child => child.parentTaskId === t.id));

        const totalCost = leafTasks.reduce((sum, t) => sum + (t.cost || 0), 0);
        const totalDuration = leafTasks.reduce((sum, t) => {
            const d = differenceInDays(parseISO(t.planEndDate), parseISO(t.planStartDate)) + 1;
            return sum + Math.max(0, d);
        }, 0);
        const useCostWeighting = leafTasks.some(t => (t.cost || 0) > 0);
        return {
            totalCost,
            totalDuration,
            useCostWeighting,
            totalWeight: useCostWeighting ? totalCost : totalDuration
        };
    }, [tasks]);

    const getTaskWeight = (task: Task): number => {
        if (budgetStats.totalWeight <= 0) return 0;
        // Group tasks shouldn't have own weight in this context if we purely use leaves, 
        // but for Table display we might want it.
        // For S-Curve calculation we only use leaves.

        if (budgetStats.useCostWeighting) {
            return ((task.cost || 0) / budgetStats.totalWeight) * 100;
        } else {
            const duration = differenceInDays(parseISO(task.planEndDate), parseISO(task.planStartDate)) + 1;
            return (Math.max(0, duration) / budgetStats.totalWeight) * 100;
        }
    };

    // Calculate S-Curve Data Points
    const sCurveData = useMemo(() => {
        // Prepare daily map
        const dayMap = new Map<string, { plan: number, actual: number }>();
        const rangeDays = eachDayOfInterval({ start: timeRange.start, end: timeRange.end });

        rangeDays.forEach(d => {
            dayMap.set(format(d, 'yyyy-MM-dd'), { plan: 0, actual: 0 });
        });

        const today = new Date();

        // ONLY LEAF TASKS for S-Curve calculation
        const leafTasks = tasks.filter(t => !tasks.some(child => child.parentTaskId === t.id));

        leafTasks.forEach(task => {
            const weight = getTaskWeight(task);
            if (weight <= 0) return;

            // Plan Distribution
            const pStart = parseISO(task.planStartDate);
            const pEnd = parseISO(task.planEndDate);
            if (isValid(pStart) && isValid(pEnd) && !isAfter(pStart, pEnd)) {
                const days = differenceInDays(pEnd, pStart) + 1;
                const dailyWeight = weight / days;
                for (let i = 0; i < days; i++) {
                    const d = addDays(pStart, i);
                    const key = format(d, 'yyyy-MM-dd');
                    if (dayMap.has(key)) {
                        dayMap.get(key)!.plan += dailyWeight;
                    }
                }
            }

            // Actual Distribution
            const progress = Number(task.progress) || 0;
            if (progress > 0) {
                // Use Actual Start/End if available, else fallback
                let aStart = task.actualStartDate ? parseISO(task.actualStartDate) : pStart;
                let aEnd = task.actualEndDate ? parseISO(task.actualEndDate) : (isAfter(today, pEnd) ? pEnd : today); // If not done, up to today or pEnd? 

                // If complete, use actual End. If in progress, assume work done up to 'Today' or Last Plan date?
                // Simplest: Distribute (Weight * Progress%) over (aStart to aEnd)

                if (!isValid(aStart)) aStart = pStart;
                if (!isValid(aEnd)) aEnd = today;
                if (isBefore(aEnd, aStart)) aEnd = aStart;

                const actualWeightTotal = weight * (progress / 100);
                const aDays = differenceInDays(aEnd, aStart) + 1;
                const dailyActual = actualWeightTotal / aDays;

                for (let i = 0; i < aDays; i++) {
                    const d = addDays(aStart, i);
                    const key = format(d, 'yyyy-MM-dd');
                    if (dayMap.has(key)) {
                        dayMap.get(key)!.actual += dailyActual;
                    }
                }
            }
        });

        // Cumulative
        let cumPlan = 0;
        let cumActual = 0;
        const points: { date: Date, plan: number, actual: number }[] = [];

        rangeDays.forEach(d => {
            const key = format(d, 'yyyy-MM-dd');
            const val = dayMap.get(key)!;
            cumPlan += val.plan;
            cumActual += val.actual;
            points.push({
                date: d,
                plan: Math.min(100, cumPlan),
                actual: Math.min(100, cumActual)
            });
        });

        return points;
    }, [tasks, timeRange, budgetStats]);

    // Group tasks with parent-child hierarchy (Same as GanttChart)
    const groupedTasks = useMemo(() => {
        const structure: Record<string, {
            tasks: Task[]; // Direct tasks in Category
            subcategories: Record<string, {
                tasks: Task[]; // Direct tasks in Subcategory
                subsubcategories: Record<string, Task[]>; // Level 3
            }>;
        }> = {};

        // Get all ROOT tasks (no parent - null or undefined) first
        const rootTasks = tasks.filter(t => !t.parentTaskId || t.parentTaskId === null);

        rootTasks.forEach(task => {
            const cat = task.category || 'Uncategorized';
            const subcat = task.subcategory || '';
            const subsubcat = task.subsubcategory || '';

            // Init Category
            if (!structure[cat]) {
                structure[cat] = {
                    tasks: [],
                    subcategories: {}
                };
            }

            if (subcat) {
                // Init Subcategory
                if (!structure[cat].subcategories[subcat]) {
                    structure[cat].subcategories[subcat] = {
                        tasks: [],
                        subsubcategories: {}
                    };
                }

                if (subsubcat) {
                    // Level 3
                    if (!structure[cat].subcategories[subcat].subsubcategories[subsubcat]) {
                        structure[cat].subcategories[subcat].subsubcategories[subsubcat] = [];
                    }
                    structure[cat].subcategories[subcat].subsubcategories[subsubcat].push(task);
                } else {
                    // Level 2 direct task
                    structure[cat].subcategories[subcat].tasks.push(task);
                }
            } else {
                // Level 1 direct task
                structure[cat].tasks.push(task);
            }
        });

        return structure;
    }, [tasks]);



    // Sticky Width
    const stickyWidth = useMemo(() => {
        let w = 250;
        if (visibleColumns.cost) w += 80;
        if (visibleColumns.weight) w += 56;
        if (visibleColumns.quantity) w += 64;
        if (visibleColumns.period) w += 150;
        if (visibleColumns.planDuration) w += 60;
        if (visibleColumns.actualDuration) w += 60;
        if (visibleColumns.progress) w += 80;
        return w + 30;
    }, [visibleColumns]);

    const navigate = (direction: 'prev' | 'next') => {
        const amount = viewMode === 'day' ? 1 : viewMode === 'week' ? 3 : 12;
        setCurrentDate(prev => direction === 'prev' ? subMonths(prev, amount) : addMonths(prev, amount));
    };

    // Calculate Grid Points for S-Curve
    const getX = (date: Date) => {
        const diff = differenceInDays(date, timeRange.start);
        if (viewMode === 'day') return diff * config.cellWidth;
        if (viewMode === 'week') return (diff / 7) * config.cellWidth;
        return (diff / 30.44) * config.cellWidth;
    };

    const getY = (val: number) => {
        // Chart Height fixed??
        // Mapping 0-100 to Height
        const height = 400; // Fixed height for S-Curve
        return height - (val / 100) * height;
    };

    const chartHeight = 400;
    const chartWidth = timeline.items.length * config.cellWidth;

    // Helper for recursive task rendering
    const renderTaskRowRecursive = (task: Task, level: number) => {
        const children = getChildTasks(task.id);
        const hasKids = children.length > 0;
        // Basic indentation
        const paddingLeft = level * 16 + (hasKids ? 0 : 20);

        return (
            <React.Fragment key={task.id}>
                <div className="flex h-8 border-b border-gray-100 hover:bg-blue-50/20 group">
                    <div className="sticky left-0 z-40 bg-white group-hover:bg-blue-50/10 border-r border-gray-300 px-4 flex items-center"
                        style={{ width: `${stickyWidth}px`, minWidth: `${stickyWidth}px`, paddingLeft: `${paddingLeft}px` }}>

                        {/* Collapse/Expand for children (Visual only for now since we don't track collapsed state for tasks in this view, or we could add it) */}
                        {hasKids && (
                            <button className="mr-1 p-0.5 hover:bg-gray-200 rounded-sm text-gray-400">
                                <ChevronDown className="w-3 h-3" />
                            </button>
                        )}

                        <div className="truncate text-xs text-gray-700 flex-1">{task.name}</div>

                        {/* Cols */}
                        {visibleColumns.cost && (
                            <div className="w-20 text-right text-xs text-gray-600 font-mono shrink-0">
                                {(task.cost || 0).toLocaleString()}
                            </div>
                        )}
                        {visibleColumns.weight && (
                            <div className="w-14 text-right text-xs text-gray-600 font-mono shrink-0">
                                {getTaskWeight(task).toFixed(2)}%
                            </div>
                        )}
                        {visibleColumns.quantity && (
                            <div className="w-16 text-right text-xs text-gray-600 font-mono shrink-0 bg-yellow-50/50 px-1 rounded mx-1">
                                {task.quantity || '-'}
                            </div>
                        )}
                        {visibleColumns.period && (
                            <div className="w-[150px] text-right text-[10px] font-mono shrink-0 px-2 flex flex-col justify-center leading-tight">
                                {(() => {
                                    const pStart = parseISO(task.planStartDate);
                                    const pEnd = parseISO(task.planEndDate);
                                    const pValid = isValid(pStart) && isValid(pEnd);

                                    let aText = null;
                                    if (task.actualStartDate) {
                                        const aStart = parseISO(task.actualStartDate);
                                        const aEnd = task.actualEndDate ? parseISO(task.actualEndDate) : null;

                                        if (isValid(aStart)) {
                                            const endStr = aEnd && isValid(aEnd) ? format(aEnd, 'dd/MM') : '...';
                                            const durStr = aEnd && isValid(aEnd) ? `(${differenceInDays(aEnd, aStart) + 1}d)` : '';
                                            aText = `${format(aStart, 'dd/MM')} - ${endStr} ${durStr}`;
                                        }
                                    }

                                    return (
                                        <>
                                            <div className="text-gray-600">
                                                {pValid ? `${format(pStart, 'dd/MM')} - ${format(pEnd, 'dd/MM')} (${differenceInDays(pEnd, pStart) + 1}d)` : '-'}
                                            </div>
                                            {aText && (
                                                <div className="text-gray-400">
                                                    {aText}
                                                </div>
                                            )}
                                        </>
                                    );
                                })()}
                            </div>
                        )}
                        {visibleColumns.planDuration && (
                            <div className="w-[60px] text-right text-xs text-gray-600 font-mono shrink-0 px-1">
                                {(() => {
                                    const pStart = parseISO(task.planStartDate);
                                    const pEnd = parseISO(task.planEndDate);
                                    if (isValid(pStart) && isValid(pEnd)) {
                                        return `${differenceInDays(pEnd, pStart) + 1}d`;
                                    }
                                    return '-';
                                })()}
                            </div>
                        )}
                        {visibleColumns.actualDuration && (
                            <div className="w-[60px] text-right text-xs text-green-600 font-mono shrink-0 px-1">
                                {(() => {
                                    if (task.actualStartDate && task.actualEndDate) {
                                        const aStart = parseISO(task.actualStartDate);
                                        const aEnd = parseISO(task.actualEndDate);
                                        if (isValid(aStart) && isValid(aEnd)) {
                                            return `${differenceInDays(aEnd, aStart) + 1}d`;
                                        }
                                    }
                                    return '-';
                                })()}
                            </div>
                        )}
                        {visibleColumns.progress && (
                            <div className="w-20 text-right text-xs text-gray-600 font-mono shrink-0 pr-4">
                                {(task.progress || 0)}%
                            </div>
                        )}
                    </div>
                    {/* Empty Right Side */}
                    <div className="flex-1"></div>
                </div>
                {/* Recursion */}
                {children.map(child => renderTaskRowRecursive(child, level + 1))}
            </React.Fragment>
        );
    };

    // Find the latest actual date to determine how far to draw the Actual Curve
    // This allows seeing the curve even if data is in the future (Scenario/Testing)
    const maxActualDate = useMemo(() => {
        let maxD = new Date(); // Default to today

        tasks.forEach(t => {
            if (t.actualEndDate) {
                const d = parseISO(t.actualEndDate);
                if (isValid(d)) {
                    if (isAfter(d, maxD)) {
                        maxD = d;
                    }
                }
            }
        });

        // If we have data in the future relative to today, use that max date.
        // If all data is in past, use Today (to show flat line up to now).
        // But if project hasn't started yet and no data, it defaults to Today which is fine (cuts off at start).
        return maxD;
    }, [tasks]);

    return (
        <div className="relative flex flex-col h-[750px] bg-white rounded border border-gray-300 w-full max-w-full overflow-hidden font-sans">
            <GanttToolbar
                title={title || "S-Curve Analysis"}
                timeRange={timeRange}
                viewMode={viewMode}
                onViewModeChange={handleViewModeChange}
                showDates={showDates}
                onToggleDates={() => setShowDates(!showDates)}
                onNavigate={navigate}
                onJumpToToday={() => setCurrentDate(new Date())}
                budgetStats={budgetStats}
                progressStats={{ totalActual: 0, totalPlan: 0 }} // Todo correct these
                visibleColumns={visibleColumns}
                onToggleColumn={(col) => setVisibleColumns((prev: any) => ({ ...prev, [col]: !prev[col] }))}
                showDependencies={false}
                onToggleDependencies={() => { }}
                onExport={() => { }}
                customDate={null}
                onCustomDateChange={() => { }}
            />

            <div className="flex-1 min-h-0 w-full relative">
                <div ref={scrollContainerRef} className="absolute inset-0 overflow-auto custom-scrollbar">
                    <div className="min-w-max flex flex-col">

                        {/* 1. Timeline Header */}
                        <TimelineHeader
                            viewMode={viewMode}
                            timeline={timeline}
                            config={config}
                            stickyWidth={stickyWidth}
                            showDates={showDates}
                            visibleColumns={visibleColumns}
                        />

                        {/* 2. Tasks Table (Left) + S-Curve Area (Right) */}
                        <div className="flex relative items-start">

                            {/* The Grid/Table Rows Container */}
                            {/* The Grid/Table Rows Container */}
                            <div className="flex-col w-full">
                                {Object.entries(groupedTasks).map(([category, catData]) => {
                                    // Calculate category summary for display
                                    const allCatTasks = [
                                        ...catData.tasks,
                                        ...Object.values(catData.subcategories).flatMap((sub: any) => [
                                            ...sub.tasks,
                                            ...Object.values(sub.subsubcategories || {}).flat()
                                        ])
                                    ] as Task[];
                                    const catSummary = getCategorySummary(allCatTasks, getTaskWeight);

                                    return (
                                        <div key={category}>
                                            {/* Category Row */}
                                            <div className="flex bg-gray-50 border-b border-gray-200 h-10">
                                                <div className="sticky left-0 z-50 bg-gray-100 border-r border-gray-300 px-4 flex items-center justify-between"
                                                    style={{ width: `${stickyWidth}px`, minWidth: `${stickyWidth}px` }}>
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            className="p-0.5 hover:bg-gray-200 rounded-sm transition-colors text-gray-500"
                                                            onClick={() => {
                                                                const newSet = new Set(collapsedCategories);
                                                                if (newSet.has(category)) newSet.delete(category);
                                                                else newSet.add(category);
                                                                setCollapsedCategories(newSet);
                                                            }}
                                                        >
                                                            {collapsedCategories.has(category) ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                                        </button>
                                                        <div className="font-bold text-sm text-gray-800">{category}</div>
                                                    </div>
                                                    {visibleColumns.cost && <div className="text-xs font-bold text-gray-800 w-20 text-right shrink-0">{(catSummary.totalCost || 0).toLocaleString()}</div>}
                                                    {visibleColumns.weight && <div className="text-xs font-bold text-gray-800 w-14 text-right shrink-0">{(catSummary.totalWeight || 0).toFixed(2)}%</div>}
                                                    {visibleColumns.quantity && <div className="w-16 shrink-0"></div>}
                                                    {visibleColumns.period && <div className="w-[150px] shrink-0"></div>}
                                                    {visibleColumns.planDuration && <div className="w-[60px] shrink-0"></div>}
                                                    {visibleColumns.actualDuration && <div className="w-[60px] shrink-0"></div>}
                                                    {visibleColumns.progress && <div className="w-20 shrink-0"></div>}
                                                </div>
                                                <div className="flex-1 border-b border-dashed border-gray-200 opacity-50 bg-gray-50/30"></div>
                                            </div>

                                            {!collapsedCategories.has(category) && (
                                                <>
                                                    {/* Subcategories */}
                                                    {Object.entries(catData.subcategories).map(([subcat, subData]) => {
                                                        // Subcat Summary
                                                        const subTasks = [
                                                            ...subData.tasks,
                                                            ...Object.values(subData.subsubcategories).flat()
                                                        ];
                                                        const subSummary = getCategorySummary(subTasks, getTaskWeight);

                                                        return (
                                                            <div key={subcat}>
                                                                <div className="flex bg-gray-50/50 h-8 border-b border-dashed border-gray-200">
                                                                    <div className="sticky left-0 z-50 bg-gray-50 border-r border-gray-300 px-4 flex items-center justify-between"
                                                                        style={{ width: `${stickyWidth}px`, minWidth: `${stickyWidth}px`, paddingLeft: '36px' }}>
                                                                        <div className="text-xs font-semibold text-gray-600">{subcat}</div>
                                                                        <div className="flex items-center">
                                                                            {visibleColumns.cost && <div className="text-xs text-gray-500 font-medium w-20 text-right shrink-0">{(subSummary.totalCost || 0).toLocaleString()}</div>}
                                                                            {visibleColumns.weight && <div className="text-xs text-gray-500 font-medium w-14 text-right shrink-0">{(subSummary.totalWeight || 0).toFixed(2)}%</div>}
                                                                            {visibleColumns.quantity && <div className="w-16 shrink-0"></div>}
                                                                            {visibleColumns.period && <div className="w-[150px] shrink-0"></div>}
                                                                            {visibleColumns.planDuration && <div className="w-[60px] shrink-0"></div>}
                                                                            {visibleColumns.actualDuration && <div className="w-[60px] shrink-0"></div>}
                                                                            {visibleColumns.progress && <div className="w-20 shrink-0"></div>}
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex-1"></div>
                                                                </div>

                                                                {/* Sub-Subcategories */}
                                                                {Object.entries(subData.subsubcategories).map(([subsub, subsubTasks]) => (
                                                                    <div key={subsub}>
                                                                        <div className="flex bg-gray-50/30 h-8 border-b border-dashed border-gray-100">
                                                                            <div className="sticky left-0 z-50 bg-gray-50 border-r border-gray-300 px-4 flex items-center justify-between"
                                                                                style={{ width: `${stickyWidth}px`, minWidth: `${stickyWidth}px`, paddingLeft: '56px' }}>
                                                                                <div className="text-xs font-medium text-gray-500">{subsub}</div>
                                                                            </div>
                                                                            <div className="flex-1"></div>
                                                                        </div>
                                                                        {subsubTasks.map(t => renderTaskRowRecursive(t, 3))}
                                                                    </div>
                                                                ))}

                                                                {/* Direct Subcat Tasks */}
                                                                {subData.tasks.map(t => renderTaskRowRecursive(t, 2))}
                                                            </div>
                                                        );
                                                    })}

                                                    {/* Direct Category Tasks */}
                                                    {catData.tasks.map(t => renderTaskRowRecursive(t, 1))}
                                                </>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* S-Curve OVERLAY */}
                            {/* S-Curve OVERLAY */}
                            <div className="absolute top-0 left-0 bottom-0 z-10 pointer-events-none"
                                style={{ left: `${stickyWidth}px`, width: `${chartWidth}px`, height: '100%' }}>

                                <div className="sticky top-0 h-[400px] w-full border-b border-gray-200 bg-white/95 backdrop-blur-sm relative group/chart shadow-sm">
                                    {/* Legend */}
                                    <div className="absolute top-4 right-4 bg-white/90 p-3 rounded-lg border border-gray-200 shadow-sm z-50 flex flex-col gap-2 pointer-events-auto backdrop-blur-sm">
                                        <div className="flex items-center gap-2">
                                            <div className="w-3 h-3 rounded-full bg-blue-500 border border-blue-600"></div>
                                            <span className="text-xs font-semibold text-gray-700">แผนงานสะสม (Plan)</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="w-3 h-3 rounded-full bg-green-500 border border-green-600"></div>
                                            <span className="text-xs font-semibold text-gray-700">ผลงานจริง (Actual)</span>
                                        </div>
                                    </div>



                                    {/* Current Status Badges (At Max Actual Date) */}
                                    {(() => {
                                        const targetDate = maxActualDate;
                                        const targetDateStr = format(targetDate, 'yyyy-MM-dd');
                                        const point = sCurveData.find(p => format(p.date, 'yyyy-MM-dd') === targetDateStr) ||
                                            sCurveData.filter(p => p.date <= targetDate).pop();

                                        if (point) {
                                            const x = getX(point.date);
                                            // Ensure we are inside chart bounds
                                            if (x >= 0 && x <= chartWidth) {
                                                return (
                                                    <>
                                                        {/* Plan Badge */}
                                                        <div className="absolute transform -translate-x-1/2 -translate-y-full mb-1 flex flex-col items-center z-20"
                                                            style={{ left: x, top: getY(point.plan) }}>
                                                            <div className="bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap font-bold">
                                                                Plan: {point.plan.toFixed(1)}%
                                                            </div>
                                                            <div className="w-0.5 h-2 bg-blue-600"></div>
                                                        </div>

                                                        {/* Actual Badge */}
                                                        <div className="absolute transform -translate-x-1/2 mt-1 flex flex-col items-center z-20 pt-1"
                                                            style={{ left: x, top: getY(point.actual) }}>
                                                            <div className="w-0.5 h-2 bg-green-600"></div>
                                                            <div className="bg-green-600 text-white text-[10px] px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap font-bold">
                                                                Actual: {point.actual.toFixed(1)}%
                                                            </div>
                                                        </div>
                                                    </>
                                                );
                                            }
                                        }
                                        return null;
                                    })()}

                                    <svg width={chartWidth} height={chartHeight} className="overflow-visible">
                                        {/* Grid Lines (Vertical) */}
                                        {timeline.items.map((item, i) => (
                                            <line key={i} x1={i * config.cellWidth} y1={0} x2={i * config.cellWidth} y2={chartHeight} stroke="#f3f4f6" strokeDasharray="4 4" />
                                        ))}

                                        {/* Today Line */}
                                        {(() => {
                                            const today = new Date();
                                            const todayX = getX(today);
                                            if (todayX >= 0 && todayX <= chartWidth) {
                                                return (
                                                    <g>
                                                        <line x1={todayX} y1={0} x2={todayX} y2={chartHeight} stroke="#ef4444" strokeWidth="2" strokeDasharray="6 4" />
                                                        <text x={todayX} y={-10} fill="#ef4444" fontSize="10" fontWeight="bold" textAnchor="middle">Today</text>
                                                    </g>
                                                );
                                            }
                                            return null;
                                        })()}

                                        {/* Plan S-Curve */}
                                        <path
                                            d={`M0,${chartHeight} ` + sCurveData.map(p => `L${getX(p.date)},${getY(p.plan)}`).join(' ')}
                                            fill="none"
                                            stroke="#3b82f6"
                                            strokeWidth="3"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        />
                                        {/* Plan Area Fill */}
                                        <path
                                            d={`M0,${chartHeight} ` + sCurveData.map(p => `L${getX(p.date)},${getY(p.plan)}`).join(' ') + ` L${getX(sCurveData[sCurveData.length - 1].date)},${chartHeight} Z`}
                                            fill="url(#blueGradient)"
                                            opacity="0.2"
                                        />

                                        {/* Actual S-Curve */}
                                        <path
                                            d={`M0,${chartHeight} ` + sCurveData.filter(p => p.date <= maxActualDate).map(p => `L${getX(p.date)},${getY(p.actual)}`).join(' ')}
                                            fill="none"
                                            stroke="#22c55e"
                                            strokeWidth="3"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        />

                                        {/* Actual Area Fill */}
                                        {sCurveData.filter(p => p.date <= maxActualDate).length > 0 && (
                                            <path
                                                d={`M0,${chartHeight} ` + sCurveData.filter(p => p.date <= maxActualDate).map(p => `L${getX(p.date)},${getY(p.actual)}`).join(' ') + ` L${getX(sCurveData.filter(p => p.date <= maxActualDate).pop()!.date)},${chartHeight} Z`}
                                                fill="url(#greenGradient)"
                                                opacity="0.2"
                                            />
                                        )}

                                        <defs>
                                            <linearGradient id="blueGradient" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#3b82f6" />
                                                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                                            </linearGradient>
                                            <linearGradient id="greenGradient" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#22c55e" />
                                                <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
                                            </linearGradient>
                                        </defs>
                                    </svg>

                                    {/* Hover Tooltips or Markers could go here */}
                                </div>

                                {/* The rest of the height is just empty space or rows corresponding to tasks */}
                            </div>
                        </div>

                    </div>
                </div>

                {/* Fixed Y-Axis Labels (Right Edge) */}
                <div className="absolute top-12 right-0 w-10 h-[400px] pointer-events-none z-[60]">
                    {[0, 25, 50, 75, 100].map(pct => (
                        <div key={pct} className="absolute w-full flex justify-center pr-1" style={{ top: `${100 - pct}%`, transform: 'translateY(-50%)' }}>
                            <span className="text-[9px] font-bold text-gray-600 bg-white/95 px-1.5 py-0.5 rounded shadow-sm border border-gray-200">{pct}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
