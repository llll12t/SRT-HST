'use client';

import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Employee, Task } from '@/types/construction';
import { format, differenceInDays, addMonths, subMonths, isValid, isBefore } from 'date-fns';
import { ChevronRight, ChevronDown, Layers, FolderOpen } from 'lucide-react';

// Types & Utils
import type { ViewMode, VisibleColumns } from '@/shared/chart-kernel/types';
import GanttToolbar from '@/features/gantt/presentation/components/GanttToolbar';
import TimelineHeader from '@/features/gantt/presentation/components/TimelineHeader';
import { parseDate } from '@/shared/utils/date';

// Hooks
import { useGanttTimeline } from '@/features/gantt/presentation/hooks/useGanttTimeline';
import { useSCurveData } from '@/features/scurve/presentation/hooks/useSCurveData';
import type { SCurveMode } from '@/features/scurve/domain/metrics';

// Components
import { SCurveGraph } from './SCurveGraph';

interface SCurveChartProps {
    tasks: Task[];
    employees?: Employee[];
    startDate?: string;
    endDate?: string;
    title?: string;
    viewMode?: ViewMode;
    onViewModeChange?: (mode: ViewMode) => void;
    onTaskUpdate?: (taskId: string, field: keyof Task, value: any) => Promise<void>;
}

export default function SCurveChart(props: SCurveChartProps) {
    const { tasks, employees = [], startDate, endDate, title, viewMode: controlledViewMode, onViewModeChange, onTaskUpdate } = props;

    // View Mode State
    const [internalViewMode, setInternalViewMode] = useState<ViewMode>('week');
    const viewMode = controlledViewMode || internalViewMode;

    const handleViewModeChange = (mode: ViewMode) => {
        if (onViewModeChange) {
            onViewModeChange(mode);
        } else {
            setInternalViewMode(mode);
        }
    };

    // Container & Width
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(0);

    useEffect(() => {
        if (!scrollContainerRef.current) return;
        const resizeObserver = new ResizeObserver(entries => {
            for (const entry of entries) {
                if (entry.contentRect.width > 0) setContainerWidth(entry.contentRect.width);
            }
        });
        resizeObserver.observe(scrollContainerRef.current);
        return () => resizeObserver.disconnect();
    }, []);

    // Scroll Sync for Right Axis
    const axisScrollRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const mainContainer = scrollContainerRef.current;
        const axisContainer = axisScrollRef.current;
        if (!mainContainer || !axisContainer) return;

        const handleScroll = () => {
            axisContainer.style.transform = `translateY(-${mainContainer.scrollTop}px)`;
        };

        mainContainer.addEventListener('scroll', handleScroll);
        return () => mainContainer.removeEventListener('scroll', handleScroll);
    }, []);


    // 1. Timeline Logic (Reused from Gantt)
    const { timeRange, timeline, config } = useGanttTimeline({
        startDate,
        endDate,
        viewMode,
        containerWidth
    });

    // Manual Budget State
    const [manualBudget, setManualBudget] = useState<number | null>(null);

    // 2. Stats for Display (Toolbar)
    const projectStats = useMemo(() => {
        const leafTasks = tasks.filter(t => !tasks.some(child => child.parentTaskId === t.id));
        const calculatedCost = leafTasks.reduce((sum, t) => sum + (t.cost || 0), 0);

        return {
            totalCost: manualBudget !== null ? manualBudget : calculatedCost,
            totalDuration: leafTasks.reduce((sum, t) => sum + Math.max(0, differenceInDays(parseDate(t.planEndDate), parseDate(t.planStartDate)) + 1), 0)
        };
    }, [tasks, manualBudget]);

    // 2.1 Calculation Mode
    const [calcMode, setCalcMode] = useState<SCurveMode>('physical');

    const getTaskWeight = (task: Task) => {
        if (!sCurveData.totalScope) return 0;
        let weight = 0;
        if (calcMode === 'financial') {
            weight = Number(task.cost) || 0;
        } else {
            weight = Math.max(0, differenceInDays(parseDate(task.planEndDate), parseDate(task.planStartDate)) + 1);
        }
        return (weight / sCurveData.totalScope) * 100;
    };

    // 3. S-Curve Data Calculation (Hook)
    const sCurveData = useSCurveData(tasks, timeRange, calcMode);
    const [customDate, setCustomDate] = useState<Date | null>(() => {
        if (typeof window === 'undefined') return null;
        const saved = localStorage.getItem('scurve_custom_date');
        return saved ? parseDate(saved) : null;
    });

    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (customDate) localStorage.setItem('scurve_custom_date', format(customDate, 'yyyy-MM-dd'));
        else localStorage.removeItem('scurve_custom_date');
    }, [customDate]);

    const kpiStats = useMemo(() => {
        const points = sCurveData.points || [];
        const firstPointDate = points.length > 0 ? points[0].date : null;
        const lastPointDate = points.length > 0 ? points[points.length - 1].date : null;
        const latestActualPoint = [...points].reverse().find(p => p.actual > 0);

        const hasValidActualMaxDate =
            isValid(sCurveData.maxActualDate) && sCurveData.maxActualDate.getFullYear() > 2000;

        // Default behavior for S-Curve:
        // - If user sets custom date => use it
        // - Else anchor on latest actual endpoint (matches graph reading better)
        let referenceDate = customDate
            ? customDate
            : hasValidActualMaxDate
                ? sCurveData.maxActualDate
                : new Date();

        // Clamp into timeline window
        if (firstPointDate && isBefore(referenceDate, firstPointDate)) {
            referenceDate = latestActualPoint?.date || firstPointDate;
        }
        if (lastPointDate && isBefore(lastPointDate, referenceDate)) {
            referenceDate = lastPointDate;
        }

        const pointAtOrBefore = (date: Date) => {
            if (points.length === 0) return null;
            let hit = points[0];
            for (let i = 1; i < points.length; i++) {
                if (points[i].date <= date) hit = points[i];
                else break;
            }
            return hit;
        };

        // Use same source as chart lines to keep KPI and graph perfectly aligned.
        const refPoint = pointAtOrBefore(referenceDate) || latestActualPoint || points[points.length - 1] || null;
        const progress = refPoint ? refPoint.actual : 0;
        const planToDate = refPoint ? refPoint.plan : 0;
        const gap = progress - planToDate;

        const leafTasks = tasks.filter(t => !tasks.some(child => child.parentTaskId === t.id));
        let overallPlanStart: Date | null = null;
        let overallPlanEnd: Date | null = null;

        leafTasks.forEach((t) => {
            if (!t.planStartDate || !t.planEndDate) return;
            const planStart = parseDate(t.planStartDate);
            const planEnd = parseDate(t.planEndDate);
            if (![planStart, planEnd].every(isValid)) return;

            if (!overallPlanStart || isBefore(planStart, overallPlanStart)) overallPlanStart = planStart;
            if (!overallPlanEnd || isBefore(overallPlanEnd, planEnd)) overallPlanEnd = planEnd;
        });

        const overallPlanSpanDays = overallPlanStart && overallPlanEnd
            ? Math.max(1, differenceInDays(overallPlanEnd, overallPlanStart) + 1)
            : null;
        const variancePercent = gap;
        const varianceDays = overallPlanSpanDays !== null
            ? Math.round((variancePercent / 100) * overallPlanSpanDays)
            : null;

        return { progress, planToDate, gap, varianceDays, variancePercent };
    }, [tasks, customDate, sCurveData.points, sCurveData.maxActualDate]);

    // UI States
    const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
    const [collapsedSubcategories, setCollapsedSubcategories] = useState<Set<string>>(new Set());
    const [collapsedSubsubcategories, setCollapsedSubsubcategories] = useState<Set<string>>(new Set());
    const [showDates, setShowDates] = useState(true);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [isExpanded, setIsExpanded] = useState(false);

    // Navigation
    const navigate = (direction: 'prev' | 'next') => {
        // This functionality might need to be linked to timeRange adjustment if strict windowing is implemented
        // For now just kept as UI placeholder or Date State update
        const amount = viewMode === 'day' ? 1 : viewMode === 'week' ? 3 : 12;
        setCurrentDate(prev => direction === 'prev' ? subMonths(prev, amount) : addMonths(prev, amount));
    };

    // Columns
    const defaultVisibleColumns: VisibleColumns = { cost: true, weight: true, progress: true, quantity: false, period: false, team: false, planDuration: false, actualDuration: false };
    const [visibleColumns, setVisibleColumns] = useState<VisibleColumns>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('scurve-visible-columns-v3');
            if (saved) {
                try {
                    const parsed = JSON.parse(saved) as Partial<VisibleColumns>;
                    return { ...defaultVisibleColumns, ...parsed };
                } catch (e) { }
            }
        }
        return defaultVisibleColumns;
    });

    useEffect(() => {
        if (typeof window !== 'undefined') localStorage.setItem('scurve-visible-columns-v3', JSON.stringify(visibleColumns));
    }, [visibleColumns]);

    useEffect(() => {
        if (!isExpanded) return;
        const prevOverflow = document.body.style.overflow;
        document.body.classList.add('gantt-fullscreen');
        document.body.style.overflow = 'hidden';
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsExpanded(false);
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => {
            document.body.style.overflow = prevOverflow;
            document.body.classList.remove('gantt-fullscreen');
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [isExpanded]);

    // Category Colors (Synced)
    const [categoryColors, setCategoryColors] = useState<Record<string, string>>({});

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('gantt_category_colors');
            if (saved) try { setCategoryColors(JSON.parse(saved)); } catch (e) { }
        }
    }, []);

    // Sticky Width
    const stickyWidth = useMemo(() => {
        let w = 250;
        if (visibleColumns.cost) w += 80;
        if (visibleColumns.weight) w += 64;
        if (visibleColumns.quantity) w += 80;
        if (visibleColumns.period) w += 150;
        if (visibleColumns.team) w += 92;
        if (visibleColumns.planDuration) w += 60;
        if (visibleColumns.actualDuration) w += 60;
        if (visibleColumns.progress) w += 80;
        return w + 30;
    }, [visibleColumns]);

    const timelineWidth = useMemo(() => {
        const calculated = timeline.items.length * config.cellWidth;
        const available = Math.max(0, containerWidth - stickyWidth);
        return Math.max(calculated, available);
    }, [timeline.items.length, config.cellWidth, containerWidth, stickyWidth]);

    const axisTopOffset = 48; // timeline header height

    // Hierarchical Data (Exact match with Project Details)
    const hierarchicalData = useMemo(() => {
        const structure: Record<string, {
            tasks: Task[];
            subcategories: Record<string, {
                tasks: Task[];
                subsubcategories: Record<string, Task[]>;
            }>;
            stats: {
                totalCost: number;
                totalDuration: number;
                weightedProgress: number;
                minStartDate: string;
                maxEndDate: string;
            }
        }> = {};

        tasks.forEach(task => {
            const cat = task.category || 'Uncategorized';
            const subcat = task.subcategory || '';
            const subsubcat = task.subsubcategory || '';

            // Init Category
            if (!structure[cat]) {
                structure[cat] = {
                    tasks: [],
                    subcategories: {},
                    stats: { totalCost: 0, totalDuration: 0, weightedProgress: 0, minStartDate: '', maxEndDate: '' }
                };
            }

            if (subcat) {
                // Init Subcategory
                if (!structure[cat].subcategories[subcat]) {
                    structure[cat].subcategories[subcat] = { tasks: [], subsubcategories: {} };
                }
                if (subsubcat) {
                    // Level 3
                    if (!structure[cat].subcategories[subcat].subsubcategories[subsubcat]) {
                        structure[cat].subcategories[subcat].subsubcategories[subsubcat] = [];
                    }
                    structure[cat].subcategories[subcat].subsubcategories[subsubcat].push(task);
                } else {
                    // Level 2 direct
                    structure[cat].subcategories[subcat].tasks.push(task);
                }
            } else {
                // Level 1 direct
                structure[cat].tasks.push(task);
            }
        });

        // You could add recursive stat calculation here if needed for S-Curve headers,
        // but SCurveGraph calculates its own stats from the raw task list usually.
        // We'll keep the structure for rendering consistency.

        return structure;
    }, [tasks]);

    const rowsHeight = useMemo(() => {
        const CATEGORY_H = 40;
        const ROW_H = 32;
        let total = 0;

        Object.keys(hierarchicalData).forEach((category) => {
            const catData = hierarchicalData[category];
            total += CATEGORY_H;

            if (collapsedCategories.has(category)) return;

            Object.entries(catData.subcategories).forEach(([subcat, subData]) => {
                const subKey = `${category}::${subcat}`;
                total += ROW_H; // subcategory header
                if (collapsedSubcategories.has(subKey)) return;

                Object.entries(subData.subsubcategories).forEach(([subsub, subTasks]) => {
                    const subSubKey = `${category}::${subcat}::${subsub}`;
                    total += ROW_H; // sub-subcategory header
                    if (collapsedSubsubcategories.has(subSubKey)) return;
                    total += subTasks.length * ROW_H; // tasks under sub-subcategory
                });

                total += subData.tasks.length * ROW_H; // direct tasks under subcategory
            });

            total += catData.tasks.length * ROW_H; // direct tasks under category
        });

        return total;
    }, [hierarchicalData, collapsedCategories, collapsedSubcategories, collapsedSubsubcategories]);

    const graphHeight = useMemo(() => {
        const minH = 280;
        return Math.max(minH, rowsHeight);
    }, [rowsHeight]);

    // Recursive Renderer (Modified to be simpler since we control hierarchy)
    const renderTaskRow = (task: Task, level: number) => {
        // We do NOT filter children here because we are iterating the pre-built hierarchy.
        // Direct tasks are just rows.
        const paddingLeft = level * 16 + 20;

        const assignedIds = task.assignedEmployeeIds || [];
        const assignedEmployees = employees.filter((e) => assignedIds.includes(e.id));

        return (
            <div key={task.id} className="flex h-8 relative z-[80]">
                <div className="sticky left-0 z-[90] bg-white border-r border-gray-300 border-b border-gray-100 px-4 flex items-center"
                    style={{ width: `${stickyWidth}px`, minWidth: `${stickyWidth}px`, paddingLeft: `${paddingLeft}px` }}>

                    <div className="truncate text-xs text-gray-700 flex-1">{task.name}</div>

                    {/* Columns */}
                    {visibleColumns.cost && (
                        <div className="w-20 text-right text-xs text-gray-600 font-mono shrink-0 px-1">
                            {onTaskUpdate ? (
                                <input
                                    className="w-full text-right bg-transparent border-b border-transparent hover:border-blue-300 focus:border-blue-500 outline-none transition-colors"
                                    defaultValue={task.cost || 0}
                                    onBlur={(e) => {
                                        const val = parseFloat(e.target.value.replace(/,/g, ''));
                                        if (!isNaN(val) && val !== task.cost) {
                                            onTaskUpdate(task.id, 'cost', val);
                                        }
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            const val = parseFloat((e.target as HTMLInputElement).value.replace(/,/g, ''));
                                            if (!isNaN(val) && val !== task.cost) {
                                                onTaskUpdate(task.id, 'cost', val);
                                            }
                                            (e.target as HTMLInputElement).blur();
                                        }
                                    }}
                                />
                            ) : (
                                (task.cost || 0).toLocaleString()
                            )}
                        </div>
                    )}
                    {visibleColumns.weight && <div className="w-16 text-right text-xs text-gray-600 font-mono shrink-0">{getTaskWeight(task).toFixed(2)}%</div>}
                    {visibleColumns.quantity && (
                        <div className="w-20 text-right text-xs text-gray-600 font-mono shrink-0 bg-yellow-50/50 px-1 rounded mx-1">
                            {onTaskUpdate ? (
                                <input
                                    className="w-full text-right bg-transparent border-b border-transparent hover:border-blue-300 focus:border-blue-500 outline-none transition-colors"
                                    defaultValue={task.quantity || ''}
                                    onBlur={(e) => {
                                        const val = e.target.value; // Keep as string for quantity or robust parsing? Sample data has quantity as string or number? Types says string | number?
                                        // Let's assume user inputs string for quantity usually, or number.
                                        // Type definition: quantity?: string; in Task?
                                        if (val !== task.quantity) {
                                            onTaskUpdate(task.id, 'quantity', val);
                                        }
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            const val = (e.target as HTMLInputElement).value;
                                            if (val !== task.quantity) {
                                                onTaskUpdate(task.id, 'quantity', val);
                                            }
                                            (e.target as HTMLInputElement).blur();
                                        }
                                    }}
                                />
                            ) : (
                                task.quantity || '-'
                            )}
                        </div>
                    )}
                    {visibleColumns.planDuration && <div className="w-[60px] text-right text-xs text-gray-600 font-mono shrink-0 px-1">{differenceInDays(parseDate(task.planEndDate), parseDate(task.planStartDate)) + 1}d</div>}
                    {visibleColumns.actualDuration && <div className="w-[60px] text-right text-xs text-green-600 font-mono shrink-0 px-1">{task.actualStartDate && task.actualEndDate ? differenceInDays(parseDate(task.actualEndDate), parseDate(task.actualStartDate)) + 1 : '-'}d</div>}
                    {visibleColumns.period && (
                        <div className="w-[150px] text-right text-[10px] font-mono shrink-0 px-2 flex flex-col justify-center leading-tight">
                            <div className="text-gray-600">
                                {isValid(parseDate(task.planStartDate)) ? `${format(parseDate(task.planStartDate), 'dd/MM')} - ${format(parseDate(task.planEndDate), 'dd/MM')}` : '-'}
                            </div>
                        </div>
                    )}
                    {visibleColumns.team && (
                        <div className="w-[92px] shrink-0 flex items-center pl-1">
                            {assignedEmployees.length > 0 ? (
                                <div className="flex items-center -space-x-1">
                                    {assignedEmployees.slice(0, 3).map((employee) => (
                                        employee.avatarBase64 ? (
                                            <img
                                                key={employee.id}
                                                src={employee.avatarBase64}
                                                alt={employee.name}
                                                title={employee.name}
                                                className="w-5 h-5 rounded-full object-cover border border-white ring-1 ring-gray-200 bg-gray-100"
                                            />
                                        ) : (
                                            <div
                                                key={employee.id}
                                                title={employee.name}
                                                className="w-5 h-5 rounded-full border border-white ring-1 ring-gray-200 bg-gray-100 text-[9px] font-semibold text-gray-600 flex items-center justify-center"
                                            >
                                                {employee.name?.charAt(0).toUpperCase() || '?'}
                                            </div>
                                        )
                                    ))}
                                    {assignedEmployees.length > 3 && (
                                        <div className="w-5 h-5 rounded-full border border-white ring-1 ring-gray-200 bg-gray-800 text-[9px] text-white flex items-center justify-center">
                                            +{assignedEmployees.length - 3}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <span className="text-[10px] text-gray-500 truncate" title={task.responsible || '-'}>
                                    {task.responsible || '-'}
                                </span>
                            )}
                        </div>
                    )}
                    {visibleColumns.progress && <div className="w-20 text-right text-xs text-gray-600 font-mono shrink-0 pr-4">{(task.progress || 0)}%</div>}
                </div>
                <div className="shrink-0 pointer-events-none" style={{ width: `${timelineWidth}px`, minWidth: `${timelineWidth}px` }}></div>
            </div >
        );
    };
    return (
        <div className={`relative flex flex-col bg-white border border-gray-300 w-full max-w-full overflow-hidden font-sans ${isExpanded
            ? 'fixed inset-0 z-[1200] h-screen w-screen rounded-none border-0 shadow-none'
            : 'h-[750px] rounded'
            }`}>
            <GanttToolbar
                title={title || "S-Curve วิเคราะห์และวางแผน"}
                timeRange={timeRange}
                viewMode={viewMode}
                onViewModeChange={handleViewModeChange}
                showDates={showDates}
                onToggleDates={() => setShowDates(!showDates)}
                onNavigate={navigate}
                onJumpToToday={() => setCurrentDate(new Date())}
                budgetStats={{
                    totalCost: projectStats.totalCost,
                    totalDuration: projectStats.totalDuration,
                    useCostWeighting: calcMode === 'financial',
                    totalWeight: calcMode === 'financial' ? projectStats.totalCost : projectStats.totalDuration
                }}
                kpiStats={kpiStats}
                visibleColumns={visibleColumns}
                onToggleColumn={(col) => setVisibleColumns((prev: any) => ({ ...prev, [col]: !prev[col] }))}
                showDependencies={false}
                onToggleDependencies={() => { }}
                onExport={() => { }}
                customDate={customDate}
                onCustomDateChange={setCustomDate}
                onBudgetChange={setManualBudget}
                isExpanded={isExpanded}
                onToggleExpand={() => setIsExpanded(prev => !prev)}
                headerStatsDefaultVisible={false}
                headerStatsStorageKey="scurve_show_header_stats_v2"
                hideDependencyControl={true}
            />

            {/* Calculation Mode Toggle */}
            <div className="flex items-center gap-4 px-4 py-2 bg-gray-50 border-b border-gray-200">
                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">โหมดคำนวณ:</span>
                <div className="flex bg-white rounded-md p-1 border border-gray-200 shadow-sm">
                    <button
                        onClick={() => setCalcMode('physical')}
                        className={`px-3 py-1.5 text-xs font-medium rounded transition-all ${calcMode === 'physical' ? 'bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-200' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                    >
                        ตามปริมาณงาน (Work Weight)
                    </button>
                    <button
                        onClick={() => setCalcMode('financial')}
                        className={`px-3 py-1.5 text-xs font-medium rounded transition-all ${calcMode === 'financial' ? 'bg-green-50 text-green-700 shadow-sm ring-1 ring-green-200' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                    >
                        ตามมูลค่าเงิน (Financial Cost)
                    </button>
                </div>
            </div>

            <div className="flex-1 min-h-0 w-full relative">
                <div ref={scrollContainerRef} className="absolute inset-0 overflow-auto custom-scrollbar">
                    <div className="min-w-max flex flex-col">

                        <TimelineHeader
                            viewMode={viewMode}
                            timeline={timeline}
                            config={config}
                            stickyWidth={stickyWidth}
                            showDates={showDates}
                            referenceDate={customDate}
                            visibleColumns={visibleColumns}
                        />

                        <div className="flex relative items-start isolate">
                            {/* Left Data Rows */}
                            <div className="flex-col w-full relative z-[80]">
                                {Object.keys(hierarchicalData).map((category) => {
                                    const catData = hierarchicalData[category];
                                    const catColor = categoryColors[category] || '#2563eb';

                                    return (
                                        <div key={category}>
                                            <div className="flex h-10">
                                                <div className="sticky left-0 z-50 bg-gray-100 border-r border-gray-300 border-b border-gray-200 px-4 flex items-center justify-between"
                                                    style={{ width: `${stickyWidth}px`, minWidth: `${stickyWidth}px` }}>
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            className="p-0.5 hover:bg-gray-200 rounded-sm transition-colors text-gray-500"
                                                            onClick={() => setCollapsedCategories(prev => {
                                                                const s = new Set(prev);
                                                                s.has(category) ? s.delete(category) : s.add(category);
                                                                return s;
                                                            })}
                                                        >
                                                            {collapsedCategories.has(category) ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                                        </button>
                                                        {/* Icon for Category */}
                                                        <Layers className="w-4 h-4" style={{ color: catColor }} />
                                                        <button
                                                            className="font-bold text-sm text-gray-800 text-left min-w-0 flex-1 truncate"
                                                            style={{ color: catColor }}
                                                            title={category}
                                                            onClick={() => setCollapsedCategories(prev => {
                                                                const s = new Set(prev);
                                                                s.has(category) ? s.delete(category) : s.add(category);
                                                                return s;
                                                            })}
                                                        >
                                                            {category}
                                                        </button>
                                                    </div>
                                                </div>
                                                <div
                                                    className="shrink-0 bg-transparent pointer-events-none"
                                                    style={{ width: `${timelineWidth}px`, minWidth: `${timelineWidth}px` }}
                                                ></div>
                                            </div>

                                            {!collapsedCategories.has(category) && (
                                                <>
                                                    {/* Subcategories */}
                                                    {Object.entries(catData.subcategories).map(([subcat, subData]) => {
                                                        const subKey = `${category}::${subcat}`;
                                                        const subColor = categoryColors[subKey] || catColor;

                                                        return (
                                                            <div key={subcat}>
                                                                {/* Level 2 Header */}
                                                                <div className="flex h-8">
                                                                    <div className="sticky left-0 z-50 bg-gray-50 border-r border-gray-300 border-b border-dashed border-gray-200 px-4 flex items-center"
                                                                        style={{ width: `${stickyWidth}px`, minWidth: `${stickyWidth}px`, paddingLeft: '36px' }}>
                                                                        <button
                                                                            className="p-0.5 mr-1 hover:bg-gray-200 rounded-sm transition-colors text-gray-500"
                                                                            onClick={() => setCollapsedSubcategories(prev => {
                                                                                const s = new Set(prev);
                                                                                s.has(subKey) ? s.delete(subKey) : s.add(subKey);
                                                                                return s;
                                                                            })}
                                                                        >
                                                                            {collapsedSubcategories.has(subKey) ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                                                        </button>
                                                                        {/* Icon for Subcategory */}
                                                                        <FolderOpen className="w-4 h-4 mr-2" style={{ color: subColor }} />
                                                                        <button
                                                                            className="text-xs font-semibold text-gray-600 text-left min-w-0 flex-1 truncate"
                                                                            style={{ color: subColor }}
                                                                            title={subcat}
                                                                            onClick={() => setCollapsedSubcategories(prev => {
                                                                                const s = new Set(prev);
                                                                                s.has(subKey) ? s.delete(subKey) : s.add(subKey);
                                                                                return s;
                                                                            })}
                                                                        >
                                                                            {subcat}
                                                                        </button>
                                                                    </div>
                                                                    <div
                                                                        className="shrink-0 bg-transparent pointer-events-none"
                                                                        style={{ width: `${timelineWidth}px`, minWidth: `${timelineWidth}px` }}
                                                                    ></div>
                                                                </div>

                                                                {!collapsedSubcategories.has(subKey) && (
                                                                    <>
                                                                        {/* Level 3 Subsubcategories */}
                                                                        {Object.entries(subData.subsubcategories).map(([subsub, tasks]) => {
                                                                            const subSubKey = `${category}::${subcat}::${subsub}`;
                                                                            const subSubColor = categoryColors[subSubKey] || subColor;

                                                                            return (
                                                                                <div key={subsub}>
                                                                                    <div className="flex h-8">
                                                                                        <div className="sticky left-0 z-50 bg-gray-50 border-r border-gray-300 border-b border-dashed border-gray-100 px-4 flex items-center"
                                                                                            style={{ width: `${stickyWidth}px`, minWidth: `${stickyWidth}px`, paddingLeft: '56px' }}>
                                                                                            <button
                                                                                                className="p-0.5 mr-1 hover:bg-gray-200 rounded-sm transition-colors text-gray-500"
                                                                                                onClick={() => setCollapsedSubsubcategories(prev => {
                                                                                                    const s = new Set(prev);
                                                                                                    s.has(subSubKey) ? s.delete(subSubKey) : s.add(subSubKey);
                                                                                                    return s;
                                                                                                })}
                                                                                            >
                                                                                                {collapsedSubsubcategories.has(subSubKey) ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                                                                            </button>
                                                                                            <div className="w-1.5 h-1.5 rounded-full mr-2" style={{ backgroundColor: subSubColor }}></div>
                                                                                            <button
                                                                                                className="text-xs font-medium text-gray-500 text-left min-w-0 flex-1 truncate"
                                                                                                title={subsub}
                                                                                                onClick={() => setCollapsedSubsubcategories(prev => {
                                                                                                    const s = new Set(prev);
                                                                                                    s.has(subSubKey) ? s.delete(subSubKey) : s.add(subSubKey);
                                                                                                    return s;
                                                                                                })}
                                                                                            >
                                                                                                {subsub}
                                                                                            </button>
                                                                                        </div>
                                                                                        <div
                                                                                            className="shrink-0 bg-transparent pointer-events-none"
                                                                                            style={{ width: `${timelineWidth}px`, minWidth: `${timelineWidth}px` }}
                                                                                        ></div>
                                                                                    </div>
                                                                                    {/* Tasks in SubSub */}
                                                                                    {!collapsedSubsubcategories.has(subSubKey) && tasks.map(t => renderTaskRow(t, 3))}
                                                                                </div>
                                                                            );
                                                                        })}

                                                                        {/* Tasks in Subcategory (Direct) */}
                                                                        {subData.tasks.map(t => renderTaskRow(t, 2))}
                                                                    </>
                                                                )}
                                                            </div>
                                                        );
                                                    })}

                                                    {/* Tasks in Category (Direct) */}
                                                    {catData.tasks.map(t => renderTaskRow(t, 1))}
                                                </>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Right Graph Overlay */}
                            <div className="absolute inset-0 z-0 pointer-events-none">
                                <SCurveGraph
                                    data={sCurveData}
                                    width={timelineWidth}
                                    height={graphHeight}
                                    timeline={timeline}
                                    config={config}
                                    timeRange={timeRange}
                                    viewMode={viewMode}
                                    totalScope={sCurveData.totalScope}
                                    mode={calcMode}
                                    left={stickyWidth}
                                    referenceDate={customDate}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Fixed Right Axis Overlay (Synced Scroll) */}
                <div className="absolute right-0 z-[90] w-[50px] pointer-events-none border-l border-gray-100/50 bg-white/30 backdrop-blur-[1px] overflow-hidden"
                    style={{ top: `${axisTopOffset}px`, bottom: 0 }}>
                    <div ref={axisScrollRef} className="relative w-full" style={{ height: `${graphHeight}px` }}>
                        {[0, 25, 50, 75, 100].map(val => (
                            <div key={val} className="absolute right-2 text-[10px] text-gray-500 font-medium bg-white/30 px-0.5 rounded"
                                style={{ bottom: `${val}%`, transform: 'translateY(50%)' }}>
                                {val}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Footer Summary Bar */}
            <div className="flex-shrink-0 bg-gray-100 border-t border-gray-300 z-[80] shadow-[0_-2px_10px_rgba(0,0,0,0.05)] font-mono text-xs">
                <div className="flex h-10 items-center">
                    <div
                        className="sticky left-0 bg-gray-100 border-r border-gray-300 flex items-center px-4 font-bold text-gray-800 z-20"
                        style={{ width: `${stickyWidth}px`, minWidth: `${stickyWidth}px` }}
                    >
                        <div className="flex-1">TOTAL</div>
                        <div className="w-28 text-right shrink-0 pr-2 flex items-center justify-end gap-2">
                            <span className="text-gray-500 text-[10px]">ACTUAL:</span>
                            <span className={`${kpiStats.progress >= 100 ? 'text-green-600' : 'text-blue-600'} text-sm`}>
                                {kpiStats.progress.toFixed(2)}%
                            </span>
                        </div>
                    </div>
                    <div className="flex-1 bg-gray-50 text-gray-400 flex items-center justify-center italic text-[10px]">
                        Overall Project Status
                    </div>
                </div>
            </div>
        </div>
    );
}
