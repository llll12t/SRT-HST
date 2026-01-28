'use client';

import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Task } from '@/types/construction';
import { format, parseISO, differenceInDays, addMonths, subMonths, isValid, isAfter } from 'date-fns';
import { ChevronRight, ChevronDown, Layers, FolderOpen } from 'lucide-react';

// Types & Utils
import { ViewMode, VisibleColumns, DateRange } from '../gantt/types';
import GanttToolbar from '../gantt/GanttToolbar';
import TimelineHeader from '../gantt/TimelineHeader';
import { getCategorySummary, parseDate } from '../gantt/utils';

// Hooks
import { useGanttTimeline } from '../gantt/hooks/useGanttTimeline';
import { useSCurveData, SCurveMode } from './hooks/useSCurveData';

// Components
import { SCurveGraph } from './SCurveGraph';

interface SCurveChartProps {
    tasks: Task[];
    startDate?: string;
    endDate?: string;
    title?: string;
    viewMode?: ViewMode;
    onViewModeChange?: (mode: ViewMode) => void;
    onTaskUpdate?: (taskId: string, field: keyof Task, value: any) => Promise<void>;
}

export default function SCurveChart(props: SCurveChartProps) {
    const { tasks, startDate, endDate, title, viewMode: controlledViewMode, onViewModeChange, onTaskUpdate } = props;

    // View Mode State
    const [internalViewMode, setInternalViewMode] = useState<ViewMode>('day');
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
            for (let entry of entries) {
                if (entry.contentRect.width > 0) setContainerWidth(entry.contentRect.width);
            }
        });
        resizeObserver.observe(scrollContainerRef.current);
        return () => resizeObserver.disconnect();
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

    // UI States
    const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
    const [showDates, setShowDates] = useState(true);
    const [currentDate, setCurrentDate] = useState(new Date());

    // Navigation
    const navigate = (direction: 'prev' | 'next') => {
        // This functionality might need to be linked to timeRange adjustment if strict windowing is implemented
        // For now just kept as UI placeholder or Date State update
        const amount = viewMode === 'day' ? 1 : viewMode === 'week' ? 3 : 12;
        setCurrentDate(prev => direction === 'prev' ? subMonths(prev, amount) : addMonths(prev, amount));
    };

    // Columns
    const [visibleColumns, setVisibleColumns] = useState<VisibleColumns>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('scurve-visible-columns');
            if (saved) try { return JSON.parse(saved); } catch (e) { }
        }
        return { cost: true, weight: true, progress: true, quantity: true, period: true, planDuration: false, actualDuration: false };
    });

    useEffect(() => {
        if (typeof window !== 'undefined') localStorage.setItem('scurve-visible-columns', JSON.stringify(visibleColumns));
    }, [visibleColumns]);

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
        if (visibleColumns.weight) w += 56;
        if (visibleColumns.quantity) w += 64;
        if (visibleColumns.period) w += 150;
        if (visibleColumns.planDuration) w += 60;
        if (visibleColumns.actualDuration) w += 60;
        if (visibleColumns.progress) w += 80;
        return w + 30;
    }, [visibleColumns]);

    // Helper
    const calcDuration = (start: string, end: string) => {
        if (!start || !end) return 1;
        return differenceInDays(parseDate(end), parseDate(start)) + 1;
    };

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

    // Recursive Renderer (Modified to be simpler since we control hierarchy)
    const renderTaskRow = (task: Task, level: number) => {
        // We do NOT filter children here because we are iterating the pre-built hierarchy.
        // Direct tasks are just rows.
        const paddingLeft = level * 16 + 20;

        return (
            <div key={task.id} className="flex h-8 border-b border-gray-100 hover:bg-blue-50/20 group">
                <div className="sticky left-0 z-40 bg-white group-hover:bg-blue-50/10 border-r border-gray-300 px-4 flex items-center"
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
                    {visibleColumns.weight && <div className="w-14 text-right text-xs text-gray-600 font-mono shrink-0">{getTaskWeight(task).toFixed(2)}%</div>}
                    {visibleColumns.quantity && (
                        <div className="w-16 text-right text-xs text-gray-600 font-mono shrink-0 bg-yellow-50/50 px-1 rounded mx-1">
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
                    {visibleColumns.period && (
                        <div className="w-[150px] text-right text-[10px] font-mono shrink-0 px-2 flex flex-col justify-center leading-tight">
                            <div className="text-gray-600">
                                {isValid(parseDate(task.planStartDate)) ? `${format(parseDate(task.planStartDate), 'dd/MM')} - ${format(parseDate(task.planEndDate), 'dd/MM')}` : '-'}
                            </div>
                        </div>
                    )}
                    {visibleColumns.planDuration && <div className="w-[60px] text-right text-xs text-gray-600 font-mono shrink-0 px-1">{differenceInDays(parseDate(task.planEndDate), parseDate(task.planStartDate)) + 1}d</div>}
                    {visibleColumns.actualDuration && <div className="w-[60px] text-right text-xs text-green-600 font-mono shrink-0 px-1">{task.actualStartDate && task.actualEndDate ? differenceInDays(parseDate(task.actualEndDate), parseDate(task.actualStartDate)) + 1 : '-'}d</div>}
                    {visibleColumns.progress && <div className="w-20 text-right text-xs text-gray-600 font-mono shrink-0 pr-4">{(task.progress || 0)}%</div>}
                </div>
                <div className="flex-1"></div>
            </div>
        );
    };

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
                budgetStats={{
                    totalCost: projectStats.totalCost,
                    totalDuration: projectStats.totalDuration,
                    useCostWeighting: calcMode === 'financial',
                    totalWeight: calcMode === 'financial' ? projectStats.totalCost : projectStats.totalDuration
                }}
                progressStats={{ totalActual: 0, totalPlan: 0 }}
                visibleColumns={visibleColumns}
                onToggleColumn={(col) => setVisibleColumns((prev: any) => ({ ...prev, [col]: !prev[col] }))}
                showDependencies={false}
                onToggleDependencies={() => { }}
                onExport={() => { }}
                customDate={null}
                onCustomDateChange={() => { }}
                onBudgetChange={setManualBudget}
            />

            {/* Calculation Mode Toggle */}
            <div className="flex items-center gap-4 px-4 py-2 bg-gray-50 border-b border-gray-200">
                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Calculation Mode:</span>
                <div className="flex bg-white rounded-md p-1 border border-gray-200 shadow-sm">
                    <button
                        onClick={() => setCalcMode('physical')}
                        className={`px-3 py-1.5 text-xs font-medium rounded transition-all ${calcMode === 'physical' ? 'bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-200' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                    >
                        ตามแผนงาน (Work Weight)
                    </button>
                    <button
                        onClick={() => setCalcMode('financial')}
                        className={`px-3 py-1.5 text-xs font-medium rounded transition-all ${calcMode === 'financial' ? 'bg-green-50 text-green-700 shadow-sm ring-1 ring-green-200' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                    >
                        จำนวนเงิน (Financial Cost)
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
                            visibleColumns={visibleColumns}
                        />

                        <div className="flex relative items-start">
                            {/* Left Data Rows */}
                            <div className="flex-col w-full">
                                {Object.keys(hierarchicalData).map((category) => {
                                    const catData = hierarchicalData[category];
                                    const catColor = categoryColors[category] || '#2563eb';

                                    return (
                                        <div key={category}>
                                            <div className="flex bg-gray-50 border-b border-gray-200 h-10">
                                                <div className="sticky left-0 z-50 bg-gray-100 border-r border-gray-300 px-4 flex items-center justify-between"
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
                                                        <div className="font-bold text-sm text-gray-800" style={{ color: catColor }}>{category}</div>
                                                    </div>
                                                </div>
                                                <div className="flex-1 border-b border-dashed border-gray-200 opacity-50 bg-gray-50/30"></div>
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
                                                                <div className="flex bg-gray-50/50 h-8 border-b border-dashed border-gray-200">
                                                                    <div className="sticky left-0 z-50 bg-gray-50 border-r border-gray-300 px-4 flex items-center"
                                                                        style={{ width: `${stickyWidth}px`, minWidth: `${stickyWidth}px`, paddingLeft: '36px' }}>
                                                                        {/* Icon for Subcategory */}
                                                                        <FolderOpen className="w-4 h-4 mr-2" style={{ color: subColor }} />
                                                                        <div className="text-xs font-semibold text-gray-600" style={{ color: subColor }}>{subcat}</div>
                                                                    </div>
                                                                    <div className="flex-1"></div>
                                                                </div>

                                                                {/* Level 3 Subsubcategories */}
                                                                {Object.entries(subData.subsubcategories).map(([subsub, tasks]) => {
                                                                    const subSubKey = `${category}::${subcat}::${subsub}`;
                                                                    const subSubColor = categoryColors[subSubKey] || subColor;

                                                                    return (
                                                                        <div key={subsub}>
                                                                            <div className="flex bg-gray-50/30 h-8 border-b border-dashed border-gray-100">
                                                                                <div className="sticky left-0 z-50 bg-gray-50 border-r border-gray-300 px-4 flex items-center"
                                                                                    style={{ width: `${stickyWidth}px`, minWidth: `${stickyWidth}px`, paddingLeft: '56px' }}>
                                                                                    <div className="w-1.5 h-1.5 rounded-full mr-2" style={{ backgroundColor: subSubColor }}></div>
                                                                                    <div className="text-xs font-medium text-gray-500">{subsub}</div>
                                                                                </div>
                                                                                <div className="flex-1"></div>
                                                                            </div>
                                                                            {/* Tasks in SubSub */}
                                                                            {tasks.map(t => renderTaskRow(t, 3))}
                                                                        </div>
                                                                    );
                                                                })}

                                                                {/* Tasks in Subcategory (Direct) */}
                                                                {subData.tasks.map(t => renderTaskRow(t, 2))}
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
                            <SCurveGraph
                                data={sCurveData}
                                width={timeline.items.length * config.cellWidth}
                                height={400}
                                timeline={timeline}
                                config={config}
                                timeRange={timeRange}
                                viewMode={viewMode}
                                totalScope={sCurveData.totalScope}
                                mode={calcMode}
                                left={stickyWidth}
                            />
                        </div>
                    </div>
                </div>

                {/* Fixed Right Axis Overlay */}
                <div className="absolute right-0 w-[50px] pointer-events-none z-20 border-l border-gray-100 bg-white/20"
                    style={{ top: '48px', height: '400px' }}>
                    {/* Axis Labels */}
                    <div className="relative w-full h-full">
                        {[0, 25, 50, 75, 100].map(val => (
                            <div key={val} className="absolute right-1 text-[10px] text-gray-500 font-medium"
                                style={{ bottom: `${val}%`, transform: 'translateY(50%)' }}>
                                {val}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
