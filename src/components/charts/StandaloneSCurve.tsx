'use client';

import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Task } from '@/types/construction';
import { format, parseISO, differenceInDays, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval, eachYearOfInterval, startOfMonth, endOfMonth, addMonths, isSameDay, isWeekend, differenceInMonths, isBefore, isAfter } from 'date-fns';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { ViewMode } from './gantt/types';
import GanttToolbar from './gantt/GanttToolbar';
import TimelineHeader from './gantt/TimelineHeader';
import { usePdfExport } from '@/hooks/usePdfExport';

interface StandaloneSCurveProps {
    tasks: Task[];
    startDate?: string;
    endDate?: string;
    title?: string;
    height?: number | string;
}

const formatDateTH = (dateStr: string | Date | undefined | null) => {
    if (!dateStr) return '-';
    const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
    if (isNaN(date.getTime())) return '-';
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const yearBE = (date.getFullYear() + 543).toString().slice(-2);
    return `${day}/${month}/${yearBE}`;
};

export default function StandaloneSCurve({ tasks, startDate = '2024-09-01', endDate = '2025-04-30', title, height = 600 }: StandaloneSCurveProps) {
    const [viewMode, setViewMode] = useState<ViewMode>('week');
    const [calculationMode, setCalculationMode] = useState<'weight' | 'cost'>('weight'); // 'weight' = based on Duration/Work, 'cost' = based on Financial Cost
    const [showDates, setShowDates] = useState(true);
    const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
    const [collapsedTasks, setCollapsedTasks] = useState<Set<string>>(new Set());

    // Visible Columns (matching GanttChart)
    const [visibleColumns, setVisibleColumns] = useState({
        cost: true,
        weight: true,
        quantity: true,
        period: true,
        progress: true
    });

    // Valid Tasks Filter: Exclude tasks with invalid dates to prevent calculation errors
    const validTasks = useMemo(() => {
        return tasks.filter(t => t.planStartDate && t.planEndDate && !isNaN(Date.parse(t.planStartDate)) && !isNaN(Date.parse(t.planEndDate)));
    }, [tasks]);

    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(0);

    // Monitor container width
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

    // 1. Time Range & Info
    const timeRange = useMemo(() => {
        let pStart = startDate ? parseISO(startDate) : startOfMonth(new Date());
        let pEnd = endDate ? parseISO(endDate) : endOfMonth(addMonths(new Date(), 12));
        if (isNaN(pStart.getTime())) pStart = startOfMonth(new Date());
        if (isNaN(pEnd.getTime())) pEnd = endOfMonth(addMonths(new Date(), 12));
        return { start: pStart, end: pEnd };
    }, [startDate, endDate]);

    // Intelligent Default View Mode - Force week view for S-Curve
    useEffect(() => {
        setViewMode('week'); // Always use week view for S-Curve
    }, []);

    // 2. Timeline config - Always use week
    const timeline = useMemo(() => {
        const weeks = eachWeekOfInterval({ start: timeRange.start, end: timeRange.end }, { weekStartsOn: 1 });
        const months = eachMonthOfInterval({ start: timeRange.start, end: timeRange.end });
        return { items: weeks, groups: months, groupFormat: 'MMMM yyyy', itemFormat: 'w' };
    }, [timeRange]);

    // Config will be calculated after stickyWidth is defined
    const [fittedCellWidth, setFittedCellWidth] = useState(40);

    // 3. Data Grouping Logic (Same as Gantt)
    const groupedTasks = useMemo(() => {
        const groups: Record<string, Task[]> = {};
        const rootTasks = validTasks.filter(t => !t.parentTaskId);
        rootTasks.forEach(task => {
            if (!groups[task.category]) groups[task.category] = [];
            groups[task.category].push(task);
        });
        return groups;
    }, [validTasks]);

    // Calculate total visible rows for S-Curve height
    const countVisibleRows = useMemo(() => {
        let count = 0;
        const countTaskAndChildren = (taskId: string, collapsed: boolean): number => {
            if (collapsed) return 0;
            const children = validTasks.filter(t => t.parentTaskId === taskId);
            let childCount = children.length;
            children.forEach(child => {
                if (!collapsedTasks.has(child.id)) {
                    childCount += countTaskAndChildren(child.id, false);
                }
            });
            return childCount;
        };

        Object.entries(groupedTasks).forEach(([category, catTasks]) => {
            count += 1; // Category header
            if (!collapsedCategories.has(category)) {
                catTasks.forEach(task => {
                    count += 1; // Task row
                    if (!collapsedTasks.has(task.id)) {
                        count += countTaskAndChildren(task.id, false);
                    }
                });
            }
        });
        return count;
    }, [groupedTasks, collapsedCategories, collapsedTasks, validTasks]);

    // S-Curve overlay height based on visible rows (32px per row)
    const sCurveHeight = Math.max(200, countVisibleRows * 32);

    const getChildTasks = (parentId: string) => validTasks.filter(t => t.parentTaskId === parentId).sort((a, b) => a.order - b.order);
    const hasChildren = (taskId: string) => validTasks.some(t => t.parentTaskId === taskId);

    // Get all descendants for a task (for group summary calculations)
    const getAllDescendants = (taskId: string): Task[] => {
        const children = getChildTasks(taskId);
        let all: Task[] = [...children];
        children.forEach(child => {
            all = [...all, ...getAllDescendants(child.id)];
        });
        return all;
    };

    // Calculate Group summary (dates and progress from children)
    const getGroupSummary = (groupTask: Task) => {
        const descendants = getAllDescendants(groupTask.id);
        // Exclude groups AND any task that has children (prevent double counting parents as leafs)
        const leafDescendants = descendants.filter(t => t.type !== 'group' && !hasChildren(t.id));

        if (leafDescendants.length === 0) return null;

        let minStartDate: string | null = null;
        let maxEndDate: string | null = null;
        let totalWeight = 0;
        let weightedProgress = 0;
        let totalCost = 0;

        leafDescendants.forEach(t => {
            if (t.planStartDate && (!minStartDate || t.planStartDate < minStartDate)) minStartDate = t.planStartDate;
            if (t.planEndDate && (!maxEndDate || t.planEndDate > maxEndDate)) maxEndDate = t.planEndDate;

            const duration = Math.max(1, differenceInDays(parseISO(t.planEndDate), parseISO(t.planStartDate)) + 1);
            const cost = Number(t.cost) || 0;

            // Weight accumulation based on Calculation Mode
            const itemWeight = calculationMode === 'cost' ? cost : duration;
            const progressVal = Number(t.progress) || 0;

            totalWeight += itemWeight;
            weightedProgress += itemWeight * progressVal;
            totalCost += cost;
        });

        const progress = totalWeight > 0 ? Math.round(weightedProgress / totalWeight) : 0;

        return {
            minStartDate: minStartDate || groupTask.planStartDate,
            maxEndDate: maxEndDate || groupTask.planEndDate,
            progress,
            count: leafDescendants.length,
            totalCost,
            totalWeight // Return the accumulated weight of children
        };
    };


    // 4. Budget Stats (Calculated based on selected mode)
    const budgetStats = useMemo(() => {
        // Only count TRUE Leaf tasks (tasks with no children), regardless of type.
        // This ensures checkgroups/empty groups with weights are counted.
        const leafTasks = validTasks.filter(t => !hasChildren(t.id));

        const totalCost = leafTasks.reduce((sum, t) => sum + (t.cost || 0), 0);
        const totalDuration = leafTasks.reduce((sum, t) => {
            const d = differenceInDays(parseISO(t.planEndDate), parseISO(t.planStartDate)) + 1;
            return sum + Math.max(0, d);
        }, 0);

        const useCostWeighting = calculationMode === 'cost';

        return {
            totalCost,
            totalDuration,
            useCostWeighting,
            totalWeight: useCostWeighting ? totalCost : totalDuration
        };
    }, [validTasks, calculationMode]);

    // Calculate weight for a task
    const getWeight = (task: Task, groupWeightVal?: number): number => {
        if (budgetStats.totalWeight <= 0) return 0;

        let numerator = 0;

        if (task.type === 'group') {
            // For groups, use the provided sum of children weights (or calculate if missing)
            if (groupWeightVal !== undefined) {
                numerator = groupWeightVal;
            } else {
                // Fallback: calculate sum of children if not provided
                const summary = getGroupSummary(task);
                numerator = summary ? summary.totalWeight : 0;
            }
        } else {
            // Leaf tasks
            if (budgetStats.useCostWeighting) {
                numerator = task.cost || 0;
            } else {
                // Duration weight
                numerator = Math.max(0, differenceInDays(parseISO(task.planEndDate), parseISO(task.planStartDate)) + 1);
            }
        }

        return (numerator / budgetStats.totalWeight) * 100;
    };

    const curveData = useMemo(() => {
        const days = eachDayOfInterval({ start: timeRange.start, end: timeRange.end });
        // Consistency: Only calculate curve based on true leafs (any task without children)
        const leafTasks = validTasks.filter(t => !hasChildren(t.id));

        // Use budgetStats.totalWeight directly to ensure 100% consistency with the header/table
        const totalWeight = budgetStats.totalWeight;

        return days.map(day => {
            let dayPlan = 0;
            let dayActual = 0;
            // Normalize today to midnight for consistent comparison
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const isPastOrToday = isBefore(day, today) || isSameDay(day, today);

            leafTasks.forEach(task => {
                let val = 0;
                if (budgetStats.useCostWeighting) {
                    val = Number(task.cost) || 0;
                } else {
                    const days = differenceInDays(parseISO(task.planEndDate), parseISO(task.planStartDate)) + 1;
                    val = Math.max(0, days); // Prevent negative duration
                }

                // Use budgetStats.totalWeight for absolute consistency with the summary widget
                const totalW = budgetStats.totalWeight;
                const weightPercent = totalW > 0 ? (val / totalW) * 100 : 0;

                // Plan
                const tStart = parseISO(task.planStartDate);
                const tEnd = parseISO(task.planEndDate);
                if (!isBefore(day, tStart)) {
                    if (isAfter(day, tEnd)) {
                        dayPlan += weightPercent;
                    } else {
                        const totalDur = differenceInDays(tEnd, tStart) + 1;
                        const passed = differenceInDays(day, tStart) + 1;
                        if (totalDur > 0) dayPlan += weightPercent * (passed / totalDur);
                    }
                }

                // Actual
                if (isPastOrToday) {
                    const progress = Number(task.progress) || 0;
                    if (progress > 0) {
                        const maxActual = weightPercent * (progress / 100);

                        // S-CURVE VISUALIZATION LOGIC:
                        // Spread the ACTUAL contribution linearly from Project Start to Today.
                        // This creates a rising curve that reaches the total actual progress (e.g., 100%) at Today.
                        // For tasks planned in the future but already done, they still contribute to the curve.

                        const aStart = timeRange.start;  // Always start from project beginning
                        const aEnd = today;              // End at today (current status point)

                        if (!isBefore(day, aStart)) {
                            if (isAfter(day, aEnd)) {
                                // Past the status point: full contribution
                                dayActual += maxActual;
                            } else {
                                // Within the spread period: linear interpolation
                                const totalDur = differenceInDays(aEnd, aStart) + 1;
                                const passed = differenceInDays(day, aStart) + 1;
                                if (totalDur > 0) {
                                    dayActual += maxActual * (passed / totalDur);
                                } else {
                                    dayActual += maxActual;
                                }
                            }
                        }
                    }
                }
            });

            const actualVal = isPastOrToday ? Math.min(100, dayActual) : null;
            return {
                date: day,
                plan: Math.min(100, dayPlan),
                actual: actualVal
            };
        });
    }, [validTasks, timeRange, budgetStats]);

    // Chart Dimensions
    const [chartHeight, setChartHeight] = useState(600);
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!chartContainerRef.current) return;
        const resizeObserver = new ResizeObserver(entries => {
            for (let entry of entries) {
                if (entry.contentRect.height > 0) {
                    setChartHeight(entry.contentRect.height);
                }
            }
        });
        resizeObserver.observe(chartContainerRef.current);
        return () => resizeObserver.disconnect();
    }, []);

    const getX = (date: Date) => {
        // Calculate based on weeks from start
        const diffDays = differenceInDays(date, timeRange.start);
        const weekNumber = Math.floor(diffDays / 7);
        const dayInWeek = diffDays % 7;
        // Position = week index * cell width + fraction of week
        return (weekNumber * fittedCellWidth) + (dayInWeek / 7 * fittedCellWidth) + (fittedCellWidth / 2);
    };

    const getY = (percent: number) => {
        const h = chartHeight;
        const padding = 40;
        const availableH = h - (padding * 2);
        return padding + (availableH * (1 - percent / 100));
    };

    const planPath = useMemo(() => curveData.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(d.date)} ${getY(d.plan)}`).join(' '), [curveData, fittedCellWidth, chartHeight, timeRange.start]);
    const actualPath = useMemo(() => curveData.filter(d => d.actual !== null).map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(d.date)} ${getY(d.actual!)}`).join(' '), [curveData, fittedCellWidth, chartHeight, timeRange.start]);

    const stats = useMemo(() => {
        const lastActual = curveData.filter(d => d.actual !== null).pop();
        const planAtToday = curveData.find(d => isSameDay(d.date, new Date())) || lastActual;
        return { plan: planAtToday?.plan || 0, actual: lastActual?.actual || 0 };
    }, [curveData]);

    // PDF Export
    const { containerRef: pdfRef, exportToPdf } = usePdfExport({ title: title || 'project' });

    // Calculate category summary (matching GanttChart)
    const getCategorySummary = (catTasks: Task[], category: string) => {
        const allCategoryTasks = tasks.filter(t => t.category === category);
        const totalCost = allCategoryTasks.reduce((sum, t) => sum + (t.cost || 0), 0);
        const totalWeight = allCategoryTasks.reduce((sum, t) => sum + getWeight(t), 0);
        const avgProgress = allCategoryTasks.length > 0
            ? allCategoryTasks.reduce((sum, t) => sum + Number(t.progress || 0), 0) / allCategoryTasks.length
            : 0;

        let minDate: Date | null = null;
        let maxDate: Date | null = null;

        allCategoryTasks.filter(t => t.type !== 'group').forEach(t => {
            const start = parseISO(t.planStartDate);
            const end = parseISO(t.planEndDate);
            if (!minDate || isBefore(start, minDate)) minDate = start;
            if (!maxDate || isAfter(end, maxDate)) maxDate = end;
        });

        const dateRange = minDate && maxDate ? {
            start: minDate,
            end: maxDate,
            days: differenceInDays(maxDate, minDate) + 1
        } : null;

        return { totalCost, totalWeight, avgProgress, count: allCategoryTasks.length, dateRange };
    };

    // Dynamic sticky width calculation (matching GanttChart)
    const stickyWidth = useMemo(() => {
        let w = 250;
        if (visibleColumns.cost) w += 80;
        if (visibleColumns.weight) w += 56;
        if (visibleColumns.quantity) w += 64;
        if (visibleColumns.period) w += 110;
        if (visibleColumns.progress) w += 80;
        return w + 30;
    }, [visibleColumns]);

    // Calculate cell width to fit container (after stickyWidth is defined)
    useEffect(() => {
        const availableWidth = containerWidth - stickyWidth - 20;
        const numWeeks = timeline.items.length;

        if (availableWidth > 0 && numWeeks > 0) {
            const newCellWidth = Math.max(20, Math.floor(availableWidth / numWeeks));
            setFittedCellWidth(newCellWidth);
        }
    }, [containerWidth, stickyWidth, timeline.items.length]);

    const config = useMemo(() => {
        return { cellWidth: fittedCellWidth, label: 'Week' };
    }, [fittedCellWidth]);

    // Render Task Row (matching GanttChart styling exactly)
    const renderTaskRow = (task: Task, level: number = 0) => {
        const isGroup = task.type === 'group';
        const taskHasChildren = hasChildren(task.id);
        const isTaskCollapsed = collapsedTasks.has(task.id);
        const childTasks = getChildTasks(task.id);
        // Calculate group summary for group-type tasks
        const groupSummary = isGroup ? getGroupSummary(task) : null;

        // Use summary totalWeight for groups
        const weight = getWeight(task, groupSummary?.totalWeight);

        // Use summary values for groups
        const displayStartDate = isGroup && groupSummary ? groupSummary.minStartDate : task.planStartDate;
        const displayEndDate = isGroup && groupSummary ? groupSummary.maxEndDate : task.planEndDate;
        const displayProgress = isGroup && groupSummary ? groupSummary.progress : task.progress;
        const displayCost = isGroup && groupSummary ? groupSummary.totalCost : task.cost;

        return (
            <React.Fragment key={task.id}>
                <div
                    className={`flex h-8 border-b border-dashed border-gray-200 transition-colors group relative hover:bg-blue-50/30`}
                >
                    <div className="sticky left-0 z-50 bg-white group-hover:bg-gray-50 border-r border-gray-300 flex items-center px-4 shadow-[1px_0_0px_rgba(0,0,0,0.05)]"
                        style={{ width: `${stickyWidth}px`, minWidth: `${stickyWidth}px` }}>

                        {/* Indent + Collapse toggle */}
                        <div className="flex items-center" style={{ paddingLeft: `${level * 20}px` }}>
                            {/* Tree connector line for sub-items */}
                            {level > 0 && (
                                <div className="flex items-center mr-1">
                                    <div className="w-3 h-[1px] bg-gray-300"></div>
                                </div>
                            )}
                            {taskHasChildren ? (
                                <button
                                    className="p-0.5 hover:bg-gray-200 rounded-sm transition-colors text-gray-500"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const next = new Set(collapsedTasks);
                                        if (next.has(task.id)) next.delete(task.id);
                                        else next.add(task.id);
                                        setCollapsedTasks(next);
                                    }}
                                >
                                    {isTaskCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                </button>
                            ) : (
                                <div className="w-4" />
                            )}

                            {/* Color dot for groups */}
                            {isGroup && (
                                <div
                                    className="w-2.5 h-2.5 rounded-full border border-gray-300 shadow-sm flex-shrink-0 mr-1.5"
                                    style={{ backgroundColor: task.color || '#f59e0b' }}
                                />
                            )}

                            {/* Child count badge */}
                            {taskHasChildren && (
                                <span className="text-[9px] text-gray-500 bg-gray-200 px-1 rounded-sm ml-0.5 mr-1">
                                    {childTasks.length}
                                </span>
                            )}
                        </div>

                        <div className={`flex-1 truncate text-xs transition-colors 
                            ${isGroup || taskHasChildren ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}
                            title={task.name}>
                            {task.name}
                        </div>

                        {visibleColumns.cost && (
                            <div className="w-20 text-right text-xs text-gray-600 font-medium font-mono shrink-0">
                                {isGroup ? (displayCost ? displayCost.toLocaleString() : '-') : (task.cost ? task.cost.toLocaleString() : '-')}
                            </div>
                        )}
                        {visibleColumns.weight && (
                            <div className="w-14 text-right text-xs text-gray-600 font-medium font-mono shrink-0">
                                {weight.toFixed(2)}%
                            </div>
                        )}
                        {visibleColumns.quantity && (
                            <div className="w-16 text-right text-xs text-gray-600 font-medium font-mono shrink-0">
                                {isGroup ? (groupSummary?.count ? `${groupSummary.count} งาน` : '-') : (task.quantity || '-')}
                            </div>
                        )}
                        {visibleColumns.period && (
                            <div className={`w-[110px] text-right text-[10px] font-mono shrink-0 ${isGroup ? 'text-gray-700 font-medium' : 'text-gray-500'}`}>
                                {displayStartDate && displayEndDate ? (
                                    <>{formatDateTH(displayStartDate)} - {formatDateTH(displayEndDate)}</>
                                ) : '-'}
                            </div>
                        )}
                        {visibleColumns.progress && (
                            <div className="w-20 flex items-center justify-end shrink-0 gap-1 pr-1">
                                {isGroup ? (
                                    // Groups: Show calculated progress (read-only)
                                    <>
                                        <span className={`w-[45px] text-right text-xs font-bold font-mono ${displayProgress === 100 ? 'text-green-600' : Number(displayProgress) > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                                            {displayProgress}%
                                        </span>
                                        <div className="w-[22px]"></div>
                                    </>
                                ) : (
                                    // Tasks: Show GO button or progress
                                    <>
                                        {!task.actualStartDate && Number(task.progress) === 0 ? (
                                            <>
                                                <div className="w-[45px]"></div>
                                                <div
                                                    className="flex items-center gap-0.5 px-1.5 py-0.5 bg-green-50 text-green-700 text-[9px] font-bold rounded border border-green-200 w-[24px] justify-center"
                                                    title="เริ่มงาน"
                                                >
                                                    <span className="hidden sm:inline">GO</span>
                                                    <svg className="sm:hidden" width="7" height="7" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="flex items-center justify-end w-full gap-1">
                                                <span className={`w-[45px] text-right text-xs font-bold font-mono ${Number(task.progress) === 100 ? 'text-green-600' : 'text-blue-600'}`}>
                                                    {Number(task.progress)}%
                                                </span>
                                                <div className="w-[22px]"></div>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Empty chart area for task rows (S-Curve doesn't show bars per task) */}
                    <div className="relative overflow-hidden" style={{ width: `${timeline.items.length * config.cellWidth}px` }}>
                        <div className="absolute inset-0 flex pointer-events-none">
                            {timeline.items.map((item, idx) => (
                                <div key={idx} className={`flex-shrink-0 border-r border-dashed border-gray-200 h-full ${viewMode === 'day' && isWeekend(item) ? 'bg-gray-50' : ''}`}
                                    style={{ width: config.cellWidth }} />
                            ))}
                        </div>
                    </div>
                </div>

                {/* Recursive Children */}
                {taskHasChildren && !isTaskCollapsed && childTasks.map(child => renderTaskRow(child, level + 1))}
            </React.Fragment>
        );
    };

    return (
        <div ref={chartContainerRef} className="relative flex flex-col h-[750px] bg-white rounded border border-gray-300 w-full max-w-full overflow-hidden font-sans">
            {/* Toolbar */}
            <GanttToolbar
                title={`${title} (S-Curve)`}
                timeRange={timeRange}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                showDates={showDates}
                onToggleDates={() => setShowDates(!showDates)}
                onNavigate={() => { }}
                onJumpToToday={() => {
                    if (scrollContainerRef.current) {
                        const todayX = getX(new Date());
                        scrollContainerRef.current.scrollTo({ left: todayX - scrollContainerRef.current.clientWidth / 2, behavior: 'smooth' });
                    }
                }}
                onExport={() => { }}
                onExportPDF={exportToPdf}
                budgetStats={budgetStats}
                progressStats={{ totalActual: stats.actual, totalPlan: stats.plan }}
                visibleColumns={visibleColumns}
                onToggleColumn={(col: string) => setVisibleColumns((prev: any) => ({ ...prev, [col]: !prev[col] }))}
                showDependencies={false}
                onToggleDependencies={() => { }}
                customDate={null}
                onCustomDateChange={() => { }}
            />

            {/* Calculation Mode Toggle */}
            <div className="flex items-center justify-start px-4 py-1.5 border-b border-gray-200 bg-gray-50/80 backdrop-blur-sm z-10">
                <div className="flex items-center gap-3">
                    <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Base Calculation On:</span>
                    <div className="flex items-center bg-white rounded border border-gray-300 shadow-sm p-0.5">
                        <button
                            onClick={() => setCalculationMode('weight')}
                            className={`px-3 py-1 text-[11px] font-semibold rounded-sm transition-all ${calculationMode === 'weight' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}
                        >
                            <span className="flex items-center gap-1.5">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>
                                WORK WEIGHT (DURATION)
                            </span>
                        </button>
                        <button
                            onClick={() => setCalculationMode('cost')}
                            className={`px-3 py-1 text-[11px] font-semibold rounded-sm transition-all ${calculationMode === 'cost' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}
                        >
                            <span className="flex items-center gap-1.5">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
                                FINANCIAL COST
                            </span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 min-h-0 w-full relative">
                <div ref={scrollContainerRef} className="absolute inset-0 overflow-auto custom-scrollbar">
                    <div className="min-w-max flex flex-col">

                        {/* Header Row (Sticky Top) */}
                        <TimelineHeader
                            viewMode={viewMode}
                            timeline={timeline}
                            config={config}
                            stickyWidth={stickyWidth}
                            showDates={showDates}
                            visibleColumns={visibleColumns}
                        />

                        {/* Task Rows + S-Curve Overlay */}
                        <div className="relative">
                            {/* S-Curve SVG Overlay - spans entire chart area */}
                            <svg
                                className="absolute pointer-events-none z-30"
                                style={{
                                    left: stickyWidth,
                                    top: 0,
                                    width: timeline.items.length * config.cellWidth,
                                    height: '100%',
                                    overflow: 'visible'
                                }}
                            >
                                {/* Plan Line - Blue */}
                                <path
                                    d={curveData.map((d, i) => {
                                        const x = getX(d.date);
                                        // Y based on actual task rows height
                                        const y = sCurveHeight * (1 - d.plan / 100);
                                        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                                    }).join(' ')}
                                    fill="none"
                                    stroke="#3b82f6"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    opacity="0.7"
                                />

                                {/* Actual Line - Green */}
                                <path
                                    d={curveData.filter(d => d.actual !== null).map((d, i) => {
                                        const x = getX(d.date);
                                        const y = sCurveHeight * (1 - d.actual! / 100);
                                        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                                    }).join(' ')}
                                    fill="none"
                                    stroke="#22c55e"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    opacity="0.8"
                                />
                            </svg>

                            {/* Global Today Overlay */}
                            {(() => {
                                const todayOffset = differenceInDays(new Date(), timeRange.start);
                                let leftPx = 0;
                                if (viewMode === 'day') leftPx = todayOffset * config.cellWidth;
                                else if (viewMode === 'week') leftPx = (todayOffset / 7) * config.cellWidth;
                                else leftPx = (todayOffset / 30.44) * config.cellWidth;

                                return (
                                    <div className="absolute top-0 bottom-0 z-25 pointer-events-none" style={{ left: `${stickyWidth + leftPx}px` }}>
                                        <div className="h-full w-px bg-orange-500"></div>
                                    </div>
                                );
                            })()}

                            {Object.entries(groupedTasks).map(([category, catTasks]) => {
                                const isCollapsed = collapsedCategories.has(category);
                                const categorySummary = getCategorySummary(catTasks, category);

                                return (
                                    <div key={category}>
                                        {/* Category Header */}
                                        <div
                                            className="flex bg-white border-b border-dashed border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors h-8 group"
                                            onClick={() => {
                                                const next = new Set(collapsedCategories);
                                                if (next.has(category)) next.delete(category);
                                                else next.add(category);
                                                setCollapsedCategories(next);
                                            }}
                                        >
                                            <div className="sticky left-0 z-50 bg-white group-hover:bg-gray-50 border-r border-gray-300 px-4 shadow-[1px_0_0px_rgba(0,0,0,0.05)] flex items-center gap-2"
                                                style={{ width: `${stickyWidth}px`, minWidth: `${stickyWidth}px` }}>
                                                {/* Collapse toggle */}
                                                <div className="w-4 flex justify-center">
                                                    <button className="p-0.5 hover:bg-gray-200 rounded-sm transition-colors text-gray-500">
                                                        {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                                    </button>
                                                </div>

                                                {/* Category Color dot */}
                                                <div
                                                    className="w-3 h-3 rounded-full border border-gray-300 shadow-sm flex-shrink-0"
                                                    style={{ backgroundColor: '#f59e0b' }}
                                                />

                                                <div className="flex-1 truncate text-xs font-bold text-gray-900 uppercase tracking-wide group/cat-header flex items-center" title={category}>
                                                    {category}
                                                    <span className="ml-2 text-[9px] text-gray-500 font-normal bg-gray-100 px-1.5 rounded-full">{categorySummary.count}</span>
                                                </div>

                                                {/* Columns aligned with Task Row */}
                                                {visibleColumns.cost && (
                                                    <div className="w-20 text-right text-xs text-gray-900 font-bold font-mono shrink-0">
                                                        {categorySummary.totalCost.toLocaleString()}
                                                    </div>
                                                )}
                                                {visibleColumns.weight && (
                                                    <div className="w-14 text-right text-xs text-gray-900 font-bold font-mono shrink-0">
                                                        {categorySummary.totalWeight.toFixed(2)}%
                                                    </div>
                                                )}
                                                {visibleColumns.quantity && (
                                                    <div className="w-16 shrink-0"></div>
                                                )}
                                                {visibleColumns.period && (
                                                    <div className="w-[110px] text-right text-[10px] text-gray-600 font-mono shrink-0">
                                                        {categorySummary.dateRange ? (
                                                            <>
                                                                {format(categorySummary.dateRange.start, 'd/MM')} - {format(categorySummary.dateRange.end, 'd/MM')}
                                                                <span className="text-gray-400 ml-1">({categorySummary.dateRange.days}d)</span>
                                                            </>
                                                        ) : '-'}
                                                    </div>
                                                )}
                                                {visibleColumns.progress && (
                                                    <div className="w-20 flex items-center justify-end shrink-0 gap-1 pr-1">
                                                        <span className="w-[45px] text-right text-xs text-blue-700 font-bold font-mono">
                                                            {categorySummary.avgProgress.toFixed(0)}%
                                                        </span>
                                                        <div className="w-[22px]"></div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Category grid background */}
                                            <div className="flex-1 bg-white relative" style={{ width: `${timeline.items.length * config.cellWidth}px` }}>
                                                <div className="absolute inset-0 flex pointer-events-none">
                                                    {timeline.items.map((item, idx) => (
                                                        <div key={idx} className={`flex-shrink-0 border-r border-dashed border-gray-200 h-full ${viewMode === 'day' && isWeekend(item) ? 'bg-gray-50/50' : ''}`}
                                                            style={{ width: config.cellWidth }} />
                                                    ))}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Task Items - Hierarchical rendering */}
                                        {!isCollapsed && catTasks.map(task => renderTaskRow(task, 0))}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
            {/* DEBUG OVERLAY - Force Reveal Calculation */}
            <div className="absolute bottom-0 left-0 right-0 bg-white border-t-4 border-red-500 p-2 text-[10px] font-mono max-h-60 overflow-auto z-[9999] shadow-2xl">
                <div className="font-bold mb-1 flex justify-between items-center bg-red-50 p-1">
                    <span className="text-red-700">DEBUG ANALYZER: Why 20%? (Leafs Only) | Total Denominator: {budgetStats.totalWeight}</span>
                    <span className="text-xs text-gray-500">If 'Contrib' is red/zero, that's the missing %</span>
                </div>
                <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-x-4 border-b pb-1 mb-1 font-bold text-gray-600">
                    <div>Name (Click to check console)</div>
                    <div>Weight (Days)</div>
                    <div>Progress</div>
                    <div>Actual Contrib %</div>
                </div>
                {validTasks.filter(t => !hasChildren(t.id)).map((t, i) => {
                    const val = budgetStats.useCostWeighting ? (Number(t.cost) || 0) : Math.max(0, differenceInDays(parseISO(t.planEndDate), parseISO(t.planStartDate)) + 1);
                    const progress = Number(t.progress) || 0;
                    const weightPercent = budgetStats.totalWeight > 0 ? (val / budgetStats.totalWeight) * 100 : 0;
                    const actualContrib = weightPercent * (progress / 100);
                    return (
                        <div key={i} className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-x-4 border-b border-dashed border-gray-100 py-0.5 hover:bg-yellow-50 cursor-pointer"
                            onClick={() => console.log('Task Debug:', t)}>
                            <div className="truncate font-medium">{t.name} <span className="text-gray-400 text-[8px]">({t.type})</span></div>
                            <div>{val} <span className="text-gray-400">({weightPercent.toFixed(1)}%)</span></div>
                            <div className={progress === 0 ? 'text-red-500 font-bold' : 'text-blue-600 font-bold'}>{progress}%</div>
                            <div className={actualContrib > 0 ? 'text-green-600 font-bold bg-green-50 px-1' : 'text-red-500 font-bold bg-red-50 px-1'}>{actualContrib.toFixed(2)}%</div>
                        </div>
                    );
                })}
                <div className="mt-2 text-center text-gray-400 italic">-- End of Valid Leaf Tasks --</div>
            </div>
        </div>
    );
}
