'use client';

import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Task } from '@/types/construction';
import { differenceInDays, parseISO, addMonths, subMonths, isAfter, isBefore, format, addDays, differenceInMonths } from 'date-fns';

import { ViewMode, RowDragState, VisibleColumns, ColorMenuConfig } from './types';
import { DependencyLines } from './DependencyLines';
import { CategoryRow } from './CategoryRow';
import { TaskRow } from './TaskRow';
import { getCategorySummary, getCategoryBarStyle, formatDateRange, isWeekend } from './utils'; // Modified import
import GanttToolbar from './GanttToolbar';
import TimelineHeader from './TimelineHeader';
import { usePdfExport } from '@/hooks/usePdfExport';

// Hooks
import { useGanttDrag } from './hooks/useGanttDrag';
import { useGanttTimeline } from './hooks/useGanttTimeline';

interface GanttChartProps {
    tasks: Task[];
    startDate?: string;
    endDate?: string;
    title?: string;
    viewMode?: ViewMode;
    onViewModeChange?: (mode: ViewMode) => void;
    onTaskUpdate?: (taskId: string, updates: Partial<Task>) => Promise<void>;
    onOpenProgressModal?: (taskId: string) => void;
    onAddSubTask?: (parentId: string) => void;
    onAddTaskToCategory?: (category: string, subcategory?: string, subsubcategory?: string) => void;
    updatingTaskIds?: Set<string>;
}

export default function GanttChart({
    tasks: propTasks,
    startDate = '2024-09-01',
    endDate = '2025-04-30',
    title,
    viewMode: controlledViewMode,
    onViewModeChange,
    onTaskUpdate,
    onOpenProgressModal,
    onAddSubTask,
    onAddTaskToCategory,
    updatingTaskIds
}: GanttChartProps) {

    // Optimistic State
    const [optimisticTasks, setOptimisticTasks] = useState<Task[]>(propTasks);
    useEffect(() => {
        setOptimisticTasks(propTasks);
    }, [propTasks]);

    // Latest Tasks Ref for Hooks
    const tasksRef = useRef(optimisticTasks);
    useEffect(() => {
        tasksRef.current = optimisticTasks;
    }, [optimisticTasks]);

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

    // Container Refs
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

    // 1. Timeline Logic (Extracted)
    const { timeRange, timeline, config } = useGanttTimeline({
        startDate,
        endDate,
        viewMode,
        containerWidth
    });

    // 2. Drag Logic (Extracted)
    const { dragState, startDrag, isUpdating: isDragUpdating } = useGanttDrag({
        tasksRef,
        viewMode,
        config,
        onTaskUpdate,
        setOptimisticTasks
    });

    // UI States
    const [showDates, setShowDates] = useState(true);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
    const [collapsedSubcategories, setCollapsedSubcategories] = useState<Set<string>>(new Set());
    const [collapsedTasks, setCollapsedTasks] = useState<Set<string>>(new Set());
    const [showDependencies, setShowDependencies] = useState(true);

    // Column Visibility
    const [visibleColumns, setVisibleColumns] = useState<VisibleColumns>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('gantt_visibleColumns_v2');
            return saved ? JSON.parse(saved) : {
                cost: false,
                weight: false,
                quantity: false,
                period: true,
                progress: true
            };
        }
        return { cost: false, weight: false, quantity: false, period: true, progress: true };
    });

    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('gantt_visibleColumns_v2', JSON.stringify(visibleColumns));
        }
    }, [visibleColumns]);

    // Row Drag & Drop State
    const [rowDragState, setRowDragState] = useState<RowDragState | null>(null);
    const [dropTargetId, setDropTargetId] = useState<string | null>(null);
    const [dropPosition, setDropPosition] = useState<'above' | 'below' | 'child' | null>(null);
    const [categoryOrder, setCategoryOrder] = useState<string[]>([]);
    const [categoryDragState, setCategoryDragState] = useState<{ id: string; type: 'category' | 'subcategory' | 'subsubcategory' | 'task' } | null>(null);

    // Dependency Selection State
    const [dependencySource, setDependencySource] = useState<{ taskId: string, side: 'start' | 'end' } | null>(null);

    // Modal Config
    const [modalConfig, setModalConfig] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        type: 'confirm' | 'alert';
        onConfirm?: () => void;
    }>({ isOpen: false, title: '', message: '', type: 'alert' });

    // Custom Date
    const [customDate, setCustomDate] = useState<Date | null>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('gantt_customDate');
            return saved ? parseISO(saved) : null;
        }
        return null;
    });

    useEffect(() => {
        if (typeof window !== 'undefined') {
            if (customDate) localStorage.setItem('gantt_customDate', format(customDate, 'yyyy-MM-dd'));
            else localStorage.removeItem('gantt_customDate');
        }
    }, [customDate]);

    // Color Management
    const [categoryColors, setCategoryColors] = useState<Record<string, string>>({});
    const [activeColorMenu, setActiveColorMenu] = useState<ColorMenuConfig | null>(null);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('gantt_category_colors');
            if (saved) try { setCategoryColors(JSON.parse(saved)); } catch (e) { }
        }
    }, []);

    const effectiveLoadingIds = updatingTaskIds || new Set<string>();

    // Handlers
    const toggleCategory = (category: string) => {
        setCollapsedCategories(prev => {
            const newSet = new Set(prev);
            newSet.has(category) ? newSet.delete(category) : newSet.add(category);
            return newSet;
        });
    };

    const toggleSubcategory = (id: string) => {
        setCollapsedSubcategories(prev => {
            const newSet = new Set(prev);
            newSet.has(id) ? newSet.delete(id) : newSet.add(id);
            return newSet;
        });
    };

    // Row Drag Handlers (Structure Reordering)
    const handleCategoryDragStart = (e: React.DragEvent, category: string) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', category);
        setCategoryDragState({ id: category, type: 'category' });
    };

    const handleCategoryDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleCategoryDrop = async (e: React.DragEvent, targetCategory: string) => {
        e.preventDefault();
        const sourceId = categoryDragState?.id;
        const dragType = categoryDragState?.type;
        setCategoryDragState(null);

        if (!sourceId) return;

        if (dragType === 'category') {
            if (sourceId === targetCategory) return;
            const allCats = Object.keys(groupedTasks);
            let currentOrder = categoryOrder.length > 0 ? [...categoryOrder] : [...allCats];
            allCats.forEach(c => { if (!currentOrder.includes(c)) currentOrder.push(c); });
            const sourceIndex = currentOrder.indexOf(sourceId);
            const targetIndex = currentOrder.indexOf(targetCategory);
            if (sourceIndex > -1 && targetIndex > -1) {
                currentOrder.splice(sourceIndex, 1);
                currentOrder.splice(targetIndex, 0, sourceId);
                setCategoryOrder(currentOrder);
            }
            return;
        }

        if (onTaskUpdate) {
            if (dragType === 'task') {
                const sourceTask = optimisticTasks.find(t => t.id === sourceId);
                if (sourceTask && sourceTask.category !== targetCategory) {
                    await onTaskUpdate(sourceId, { category: targetCategory, subcategory: '', subsubcategory: '', order: 999999 });
                }
            } else if (dragType === 'subcategory') {
                const parts = sourceId.split('::');
                const sourceCat = parts[0];
                const sourceSub = parts[1] || '';
                if (sourceCat !== targetCategory) {
                    const tasksToMove = optimisticTasks.filter(t => t.category === sourceCat && t.subcategory === sourceSub);
                    await Promise.all(tasksToMove.map(t => onTaskUpdate(t.id, { category: targetCategory })));
                }
            }
        }
    };

    const handleSubcategoryDragStart = (e: React.DragEvent, subcatKey: string, type: 'subcategory' | 'subsubcategory') => {
        e.stopPropagation();
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', subcatKey);
        setCategoryDragState({ id: subcatKey, type });
    };

    const handleSubcategoryDrop = async (e: React.DragEvent, targetKey: string) => {
        e.preventDefault();
        e.stopPropagation();
        const sourceId = categoryDragState?.id;
        setCategoryDragState(null);
        if (!sourceId || !onTaskUpdate) return;
    };

    // Dependency Linking
    const handleDependencyClick = async (taskId: string, side: 'start' | 'end') => {
        if (!onTaskUpdate) return;
        if (dependencySource) {
            if (dependencySource.taskId === taskId && dependencySource.side === side) {
                setDependencySource(null);
                return;
            }
            if (dependencySource.side === 'end' && side === 'start') {
                const targetTask = optimisticTasks.find(t => t.id === taskId);
                if (targetTask && !targetTask.predecessors?.includes(dependencySource.taskId)) {
                    await onTaskUpdate(taskId, { predecessors: [...(targetTask.predecessors || []), dependencySource.taskId] });
                }
            }
            setDependencySource(null);
        } else {
            if (side === 'end') setDependencySource({ taskId, side });
            else setModalConfig({ isOpen: true, title: 'Error', message: 'Start linking from End point only.', type: 'alert' });
        }
    };

    // Calculate budget/stats
    const budgetStats = useMemo(() => {
        const totalCost = optimisticTasks.reduce((sum, t) => sum + (t.cost || 0), 0);
        const totalDuration = optimisticTasks.reduce((sum, t) => {
            const d = differenceInDays(parseISO(t.planEndDate), parseISO(t.planStartDate)) + 1;
            return sum + Math.max(0, d);
        }, 0);
        const useCostWeighting = optimisticTasks.some(t => (t.cost || 0) > 0);
        return { totalCost, totalDuration, useCostWeighting, totalWeight: useCostWeighting ? totalCost : totalDuration };
    }, [optimisticTasks]);

    const getTaskWeight = (task: Task) => {
        if (budgetStats.totalWeight <= 0) return 0;
        if (budgetStats.useCostWeighting) return ((task.cost || 0) / budgetStats.totalWeight) * 100;
        const duration = differenceInDays(parseISO(task.planEndDate), parseISO(task.planStartDate)) + 1;
        return (Math.max(0, duration) / budgetStats.totalWeight) * 100;
    };

    // Grouping Logic
    const groupedTasks = useMemo(() => {
        const structure: Record<string, { tasks: Task[]; subcategories: Record<string, { tasks: Task[]; subsubcategories: Record<string, Task[]> }> }> = {};
        const rootTasks = optimisticTasks.filter(t => !t.parentTaskId || t.parentTaskId === null);

        rootTasks.forEach(task => {
            const cat = task.category || 'Uncategorized';
            const subcat = task.subcategory || '';
            const subsubcat = task.subsubcategory || '';

            if (!structure[cat]) structure[cat] = { tasks: [], subcategories: {} };

            if (subcat) {
                if (!structure[cat].subcategories[subcat]) structure[cat].subcategories[subcat] = { tasks: [], subsubcategories: {} };
                if (subsubcat) {
                    if (!structure[cat].subcategories[subcat].subsubcategories[subsubcat]) structure[cat].subcategories[subcat].subsubcategories[subsubcat] = [];
                    structure[cat].subcategories[subcat].subsubcategories[subsubcat].push(task);
                } else {
                    structure[cat].subcategories[subcat].tasks.push(task);
                }
            } else {
                structure[cat].tasks.push(task);
            }
        });
        return structure;
    }, [optimisticTasks]);

    // Visible Rows Mapping
    const visibleRowMap = useMemo(() => {
        const map = new Map<string, number>();
        let currentRow = 0;

        const processTaskList = (list: Task[]) => {
            list.sort((a, b) => (a.order || 0) - (b.order || 0)).forEach(t => {
                map.set(t.id, currentRow++);
                if (!collapsedTasks.has(t.id)) {
                    const children = optimisticTasks.filter(c => c.parentTaskId === t.id);
                    if (children.length > 0) processTaskList(children);
                }
            });
        };

        const sortedCats = Object.keys(groupedTasks).sort((a, b) => {
            const ia = categoryOrder.indexOf(a);
            const ib = categoryOrder.indexOf(b);
            if (ia >= 0 && ib >= 0) return ia - ib;
            return 0;
        });

        sortedCats.forEach(cat => {
            currentRow++; // Header
            if (!collapsedCategories.has(cat)) {
                const catData = groupedTasks[cat];
                Object.keys(catData.subcategories).forEach(sub => {
                    currentRow++; // Subheader
                    if (!collapsedSubcategories.has(`${cat}::${sub}`)) {
                        const subData = catData.subcategories[sub];
                        Object.keys(subData.subsubcategories).forEach(subsub => {
                            currentRow++; // Subsub
                            if (!collapsedSubcategories.has(`${cat}::${sub}::${subsub}`)) {
                                processTaskList(subData.subsubcategories[subsub]);
                            }
                        });
                        processTaskList(subData.tasks);
                    }
                });
                processTaskList(catData.tasks);
            }
        });
        return map;
    }, [groupedTasks, collapsedCategories, collapsedSubcategories, collapsedTasks, optimisticTasks, categoryOrder]);

    const stickyWidth = useMemo(() => {
        let w = 300; // Increased base width for Name
        if (visibleColumns.cost) w += 80;
        if (visibleColumns.weight) w += 64; // w-16
        if (visibleColumns.quantity) w += 80; // w-20
        if (visibleColumns.period) w += 130; // w-[130px]
        if (visibleColumns.progress) w += 80;
        return w + 30;
    }, [visibleColumns]);

    // PDF Export
    const { containerRef: chartContainerRef, exportToPdf: handleExportPDF } = usePdfExport({ title, pageSize: 'A3', orientation: 'landscape' });

    // Handlers needed for children
    const getChildTasks = (parentId: string) => optimisticTasks.filter(t => t.parentTaskId === parentId).sort((a, b) => a.order - b.order);
    const hasChildren = (taskId: string) => optimisticTasks.some(t => t.parentTaskId === taskId);
    const toggleTaskCollapse = (taskId: string) => {
        setCollapsedTasks(prev => {
            const newSet = new Set(prev);
            newSet.has(taskId) ? newSet.delete(taskId) : newSet.add(taskId);
            return newSet;
        });
    }

    // Original Row Drag Logic (Simplified for stability)
    const handleRowDragStart = (e: React.DragEvent, t: Task) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', t.id);
        setRowDragState({ taskId: t.id, taskName: t.name });
    };
    const handleRowDragEnd = () => { setRowDragState(null); setDropTargetId(null); setDropPosition(null); };
    const handleRowDragOver = (e: React.DragEvent, targetId?: string) => {
        e.preventDefault();
        if (targetId && rowDragState && rowDragState.taskId !== targetId) {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const relY = e.clientY - rect.top;
            const h = rect.height;
            if (relY < h * 0.3) setDropPosition('above');
            else if (relY > h * 0.7) setDropPosition('below');
            else setDropPosition('child');
            setDropTargetId(targetId);
        }
    };
    const handleRowDrop = async (e: React.DragEvent, targetId: string) => {
        e.preventDefault();
        if (!rowDragState || !onTaskUpdate || !dropPosition) return;
        const sourceId = rowDragState.taskId;
        if (sourceId === targetId) return;

        const targetTask = optimisticTasks.find(t => t.id === targetId);
        if (!targetTask) return;

        if (dropPosition === 'child') {
            await onTaskUpdate(sourceId, {
                parentTaskId: targetId,
                category: targetTask.category,
                subcategory: targetTask.subcategory || '',
                subsubcategory: targetTask.subsubcategory || ''
            });
            setCollapsedTasks(prev => { const n = new Set(prev); n.delete(targetId); return n; });
        } else {
            // Reordering Logic
            // 1. Get all siblings in the target context
            const siblings = optimisticTasks.filter(t =>
                t.parentTaskId === targetTask.parentTaskId &&
                t.category === targetTask.category &&
                t.subcategory === targetTask.subcategory &&
                t.subsubcategory === targetTask.subsubcategory
            ).sort((a, b) => (a.order || 0) - (b.order || 0));

            const targetIndex = siblings.findIndex(t => t.id === targetId);
            if (targetIndex === -1) return;

            let newOrder = 0;
            const targetOrder = targetTask.order || 0;

            if (dropPosition === 'above') {
                const prevTask = siblings[targetIndex - 1];
                if (prevTask) {
                    newOrder = ((prevTask.order || 0) + targetOrder) / 2;
                } else {
                    newOrder = targetOrder - 100000; // Place well before
                }
            } else { // below
                const nextTask = siblings[targetIndex + 1];
                if (nextTask) {
                    newOrder = (targetOrder + (nextTask.order || 0)) / 2;
                } else {
                    newOrder = targetOrder + 100000; // Place well after
                }
            }

            await onTaskUpdate(sourceId, {
                parentTaskId: targetTask.parentTaskId,
                category: targetTask.category,
                subcategory: targetTask.subcategory || '',
                subsubcategory: targetTask.subsubcategory || '',
                order: newOrder
            });
        }
        handleRowDragEnd();
    };
    const handleRemoveFromParent = (id: string) => onTaskUpdate?.(id, { parentTaskId: null });
    const handleRowDragLeave = () => { setDropTargetId(null); setDropPosition(null); };

    // Navigation
    const navigate = (direction: 'prev' | 'next') => {
        const amount = viewMode === 'day' ? 1 : viewMode === 'week' ? 3 : 12;
        setCurrentDate(prev => direction === 'prev' ? subMonths(prev, amount) : addMonths(prev, amount));
    };

    // Calculate Overall Progress (Weighted)
    const summaryStats = useMemo(() => {
        let totalWeight = 0;
        let weightedProgressSum = 0;

        optimisticTasks.forEach(t => {
            // Use same weighing logic
            let weight = 0;
            if (budgetStats.totalWeight > 0) {
                if (budgetStats.useCostWeighting) {
                    weight = ((t.cost || 0) / budgetStats.totalWeight) * 100;
                } else {
                    const duration = differenceInDays(parseISO(t.planEndDate), parseISO(t.planStartDate)) + 1;
                    weight = (Math.max(0, duration) / budgetStats.totalWeight) * 100;
                }
            }

            // Only count Leaf tasks or tasks that have progress directly
            // Simplified: If using cost weighting, sum(cost * progress) / totalCost
            // If using duration, sum(duration * progress) / totalDuration
            // But we already have getTaskWeight helper but it depends on budgetStats which is outside this loop scope comfortably?
            // Let's reuse the weight calculated above.

            if (weight > 0) {
                totalWeight += weight;
                weightedProgressSum += (weight * (Number(t.progress) || 0));
            }
        });

        // Normalize if totalWeight > 100 (unlikely if calculated correctly) or < 100 (incomplete data)
        // Usually we divide by totalWeight of the project.

        const overallProgress = totalWeight > 0 ? weightedProgressSum / totalWeight : 0;

        return {
            progress: overallProgress,
            cost: budgetStats.totalCost
        };
    }, [optimisticTasks, budgetStats]);

    return (
        <div ref={chartContainerRef} className="relative flex flex-col h-[750px] bg-white rounded border border-gray-300 w-full max-w-full overflow-hidden font-sans">
            <GanttToolbar
                title={title}
                timeRange={timeRange}
                viewMode={viewMode}
                onViewModeChange={handleViewModeChange}
                showDates={showDates}
                onToggleDates={() => setShowDates(!showDates)}
                onNavigate={navigate}
                onJumpToToday={() => setCurrentDate(new Date())}
                onExport={handleExportPDF}
                onExportPDF={handleExportPDF}
                budgetStats={budgetStats}
                progressStats={{ totalActual: summaryStats.progress, totalPlan: 0 }}
                visibleColumns={visibleColumns}
                onToggleColumn={(col) => setVisibleColumns((prev: any) => ({ ...prev, [col]: !prev[col] }))}
                showDependencies={showDependencies}
                onToggleDependencies={() => setShowDependencies(!showDependencies)}
                customDate={customDate}
                onCustomDateChange={setCustomDate}
            />

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

                        <div className="relative">
                            {/* Today Line */}
                            {(() => {
                                const targetDate = customDate || new Date();
                                const todayOffset = differenceInDays(targetDate, timeRange.start);
                                let leftPx = 0;
                                if (viewMode === 'day') leftPx = todayOffset * config.cellWidth;
                                else if (viewMode === 'week') leftPx = (todayOffset / 7) * config.cellWidth;
                                else leftPx = (todayOffset / 30.44) * config.cellWidth;

                                return (
                                    <div className="absolute top-0 bottom-0 z-10 pointer-events-none" style={{ left: `${stickyWidth + leftPx}px` }}>
                                        <div className="h-full w-px bg-orange-500"></div>
                                    </div>
                                );
                            })()}

                            {showDependencies && (
                                <DependencyLines
                                    tasks={optimisticTasks}
                                    visibleRowMap={visibleRowMap}
                                    config={config}
                                    viewMode={viewMode}
                                    timeRange={timeRange}
                                    stickyWidth={stickyWidth}
                                    onDeleteDependency={(taskId, predId) => onTaskUpdate?.(taskId, { predecessors: optimisticTasks.find(t => t.id === taskId)?.predecessors?.filter(p => p !== predId) })}
                                />
                            )}

                            {Object.keys(groupedTasks)
                                .sort((a, b) => {
                                    if (categoryOrder.length === 0) return 0;
                                    const ia = categoryOrder.indexOf(a);
                                    const ib = categoryOrder.indexOf(b);
                                    if (ia === -1) return 1;
                                    if (ib === -1) return -1;
                                    return ia - ib;
                                })
                                .map((category) => {
                                    const catData = groupedTasks[category];
                                    return (
                                        <div key={category}>
                                            <CategoryRow
                                                category={category}
                                                catData={catData}
                                                collapsedCategories={collapsedCategories}
                                                toggleCategory={toggleCategory}
                                                categoryColors={categoryColors}
                                                setActiveColorMenu={setActiveColorMenu}
                                                onAddTaskToCategory={onAddTaskToCategory}
                                                visibleColumns={visibleColumns}
                                                stickyWidth={stickyWidth}
                                                timeline={timeline}
                                                config={config}
                                                viewMode={viewMode}
                                                timeRange={timeRange}
                                                getTaskWeight={getTaskWeight}
                                                onCategoryDragStart={handleCategoryDragStart}
                                                onCategoryDragOver={handleCategoryDragOver}
                                                isDragging={categoryDragState?.id === category && categoryDragState?.type === 'category'}
                                                loadingIds={effectiveLoadingIds}
                                            />

                                            {!collapsedCategories.has(category) && (
                                                <>
                                                    {/* Subcategories */}
                                                    {Object.entries(catData.subcategories).map(([subcat, subData]) => {
                                                        const uniqueSubcatId = `${category}::${subcat}`;
                                                        // Color Priority: Self -> Parent -> Default
                                                        const color = categoryColors[uniqueSubcatId] || categoryColors[category] || '#3b82f6';

                                                        // Calculate Subcategory Summary
                                                        const subTasks = [
                                                            ...subData.tasks,
                                                            ...Object.values(subData.subsubcategories).flat()
                                                        ];
                                                        const subSummary = getCategorySummary(subTasks, getTaskWeight);
                                                        const subDateRange = subSummary.dateRange;

                                                        return (
                                                            <div key={subcat}>
                                                                {/* Subcategory Header */}
                                                                <div
                                                                    className={`flex bg-gray-50/50 border-b border-dashed border-gray-200 h-8 group cursor-pointer hover:bg-gray-100/50 transition-colors ${categoryDragState?.id === uniqueSubcatId && categoryDragState?.type === 'subcategory' ? 'opacity-40 bg-blue-50' : ''}`}
                                                                    onClick={() => toggleSubcategory(uniqueSubcatId)}
                                                                    draggable
                                                                    onDragStart={(e) => handleSubcategoryDragStart(e, uniqueSubcatId, 'subcategory')}
                                                                    onDragOver={handleCategoryDragOver}
                                                                    onDrop={(e) => handleSubcategoryDrop(e, uniqueSubcatId)}
                                                                >
                                                                    <div className="sticky left-0 z-[60] bg-gray-50 group-hover:bg-gray-100 border-r border-gray-300 pl-2 flex items-center"
                                                                        style={{ width: `${stickyWidth}px`, minWidth: `${stickyWidth}px`, paddingLeft: '24px' }}>
                                                                        {/* Drag Handle */}
                                                                        <div className="cursor-grab text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 mr-1">
                                                                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M8 6h8v2H8V6zm0 4h8v2H8v-2zm0 4h8v2H8v-2z" /></svg>
                                                                        </div>

                                                                        {/* Color Picker for Subcategory */}
                                                                        <button
                                                                            className="w-2.5 h-2.5 rounded-full border border-gray-300 hover:scale-110 transition-transform shadow-sm flex-shrink-0 mr-2"
                                                                            style={{ backgroundColor: color }}
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                const rect = e.currentTarget.getBoundingClientRect();
                                                                                setActiveColorMenu({
                                                                                    id: uniqueSubcatId,
                                                                                    type: 'category', // Use 'category' type so it updates categoryColors map
                                                                                    top: rect.bottom + window.scrollY,
                                                                                    left: rect.left + window.scrollX
                                                                                });
                                                                            }}
                                                                            title="Change Subcategory Color"
                                                                        />

                                                                        <div className="flex-1 flex items-center overflow-hidden">
                                                                            <div className="flex-1 flex items-center min-w-0 pr-2">
                                                                                <div className="font-semibold text-xs text-gray-800 truncate" style={{ color: color }}>
                                                                                    {subcat}
                                                                                </div>
                                                                                {onAddTaskToCategory && (
                                                                                    <button
                                                                                        className="ml-2 p-0.5 hover:bg-blue-100 rounded-sm text-blue-500 opacity-0 group-hover:opacity-100 shrink-0 ease-in-out duration-200"
                                                                                        onClick={(e) => { e.stopPropagation(); onAddTaskToCategory(category, subcat); }}
                                                                                        title="Add Task to Subcategory"
                                                                                    >
                                                                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                                                                    </button>
                                                                                )}
                                                                            </div>

                                                                            {/* Subcategory Summary Cols */}
                                                                            {/* Subcategory Summary Cols */}
                                                                            {visibleColumns.cost && <div className="h-full flex items-center justify-end border-l border-gray-200 text-xs text-gray-900 font-bold font-mono w-20 shrink-0 pr-2 truncate">{(subSummary.totalCost || 0).toLocaleString()}</div>}
                                                                            {visibleColumns.weight && <div className="h-full flex items-center justify-end border-l border-gray-200 text-xs text-gray-900 font-bold font-mono w-16 shrink-0 pr-2 truncate">{(subSummary.totalWeight || 0).toFixed(2)}%</div>}
                                                                            {visibleColumns.quantity && <div className="h-full flex items-center justify-start border-l border-gray-200 w-20 shrink-0 text-left pl-2 truncate"></div>}
                                                                            {visibleColumns.period && <div className="h-full flex items-center justify-start border-l border-gray-200 w-[130px] shrink-0 text-[10px] text-gray-600 font-mono text-left pl-2 truncate">
                                                                                {subDateRange ? formatDateRange(subDateRange.start, subDateRange.end) : '-'}
                                                                            </div>}
                                                                            {visibleColumns.progress && <div className="h-full flex items-center justify-start border-l border-gray-200 text-xs text-blue-700 font-bold font-mono w-20 shrink-0 pl-2 truncate">{(subSummary.avgProgress || 0).toFixed(0)}%</div>}
                                                                        </div>
                                                                    </div>

                                                                    {/* Styled Timeline Bar for Subcategory */}
                                                                    <div className="flex-1 h-full relative overflow-hidden bg-white/50">
                                                                        {/* Grid Lines (Subtle) */}
                                                                        <div className="absolute inset-0 flex pointer-events-none">
                                                                            {timeline.items.map((item, idx) => (
                                                                                <div key={idx} className={`flex-shrink-0 border-r border-dashed border-gray-200/50 h-full ${viewMode === 'day' && isWeekend(item) ? 'bg-gray-50/30' : ''}`}
                                                                                    style={{ width: config.cellWidth }} />
                                                                            ))}
                                                                        </div>

                                                                        {subDateRange && (
                                                                            <div
                                                                                className="absolute h-3 top-[10px] rounded-full border border-gray-400/30"
                                                                                style={{
                                                                                    ...getCategoryBarStyle(subDateRange, viewMode, config, timeRange),
                                                                                    backgroundColor: `${color}30`,
                                                                                    zIndex: 20
                                                                                }}
                                                                            >
                                                                                <div
                                                                                    className="absolute left-0 top-0 bottom-0 rounded-full"
                                                                                    style={{
                                                                                        width: `${subSummary.avgProgress}%`,
                                                                                        backgroundColor: color,
                                                                                        opacity: 0.7
                                                                                    }}
                                                                                />
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                {!collapsedSubcategories.has(uniqueSubcatId) && (
                                                                    <>
                                                                        {/* Sub-Subcategories */}
                                                                        {Object.entries(subData.subsubcategories).map(([subsub, tasks]) => {
                                                                            const uniqueSubsubId = `${category}::${subcat}::${subsub}`;
                                                                            // Color Priority: Self -> Parent (Subcat) -> Grandparent (Category) -> Default
                                                                            const subColor = categoryColors[uniqueSubsubId] || color;

                                                                            // Sub-Sub Summary
                                                                            const subsubSummary = getCategorySummary(tasks, getTaskWeight);
                                                                            const subsubDateRange = subsubSummary.dateRange;

                                                                            return (
                                                                                <div key={subsub}>
                                                                                    {/* SubSub Header */}
                                                                                    <div className="h-7 flex items-center bg-gray-50/20 border-b border-dotted border-gray-100 group" >
                                                                                        <div className="sticky left-0 z-[59] flex items-center border-r border-gray-300 pl-2 bg-gray-50/20"
                                                                                            style={{ width: stickyWidth, minWidth: stickyWidth, paddingLeft: 40 }}>

                                                                                            {/* Color Picker for Sub-Subcategory */}
                                                                                            <button
                                                                                                className="w-2 h-2 rounded-full border border-gray-300 hover:scale-110 transition-transform shadow-sm flex-shrink-0 mr-2"
                                                                                                style={{ backgroundColor: subColor }}
                                                                                                onClick={(e) => {
                                                                                                    e.stopPropagation();
                                                                                                    const rect = e.currentTarget.getBoundingClientRect();
                                                                                                    setActiveColorMenu({
                                                                                                        id: uniqueSubsubId,
                                                                                                        type: 'category',
                                                                                                        top: rect.bottom + window.scrollY,
                                                                                                        left: rect.left + window.scrollX
                                                                                                    });
                                                                                                }}
                                                                                                title="Change Sub-subcategory Color"
                                                                                            />

                                                                                            <div className="flex-1 flex items-center overflow-hidden">
                                                                                                <div className="flex-1 flex items-center min-w-0 pr-2">
                                                                                                    <span className="text-[11px] text-gray-600 font-bold italic truncate">{subsub}</span>

                                                                                                    {onAddTaskToCategory && (
                                                                                                        <button
                                                                                                            className="ml-2 p-0.5 text-blue-400 hover:text-blue-600 bg-transparent hover:bg-blue-50 rounded opacity-0 group-hover:opacity-100 shrink-0 ease-in-out duration-200"
                                                                                                            onClick={(e) => { e.stopPropagation(); onAddTaskToCategory(category, subcat, subsub); }}
                                                                                                            title="Add Task to Sub-subcategory"
                                                                                                        >
                                                                                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                                                                                        </button>
                                                                                                    )}
                                                                                                </div>

                                                                                                {/* SubSub Cols */}
                                                                                                {visibleColumns.cost && <div className="h-full flex items-center justify-end border-l border-gray-200 text-[10px] text-gray-900 font-bold font-mono w-20 shrink-0 pr-2 truncate">{(subsubSummary.totalCost || 0).toLocaleString()}</div>}
                                                                                                {visibleColumns.weight && <div className="h-full flex items-center justify-end border-l border-gray-200 text-[10px] text-gray-900 font-bold font-mono w-16 shrink-0 pr-2 truncate">{(subsubSummary.totalWeight || 0).toFixed(2)}%</div>}
                                                                                                {visibleColumns.quantity && <div className="h-full flex items-center justify-start border-l border-gray-200 w-20 shrink-0 text-left pl-2 truncate"></div>}
                                                                                                {visibleColumns.period && <div className="h-full flex items-center justify-start border-l border-gray-200 w-[130px] shrink-0 text-[9px] text-gray-500 font-mono text-left pl-2 truncate">
                                                                                                    {subsubDateRange ? formatDateRange(subsubDateRange.start, subsubDateRange.end) : '-'}
                                                                                                </div>}
                                                                                                {visibleColumns.progress && <div className="h-full flex items-center justify-start border-l border-gray-200 text-[10px] text-blue-700 font-bold font-mono w-20 shrink-0 pl-2 truncate">{(subsubSummary.avgProgress || 0).toFixed(0)}%</div>}
                                                                                            </div>
                                                                                        </div>

                                                                                        {/* Timeline Bar for SubSub */}
                                                                                        <div className="flex-1 h-full relative overflow-hidden opacity-80">
                                                                                            {/* Grid Lines (Subtle) */}
                                                                                            <div className="absolute inset-0 flex pointer-events-none">
                                                                                                {timeline.items.map((item, idx) => (
                                                                                                    <div key={idx} className={`flex-shrink-0 border-r border-dashed border-gray-200/30 h-full ${viewMode === 'day' && isWeekend(item) ? 'bg-gray-50/20' : ''}`}
                                                                                                        style={{ width: config.cellWidth }} />
                                                                                                ))}
                                                                                            </div>

                                                                                            {subsubDateRange && (
                                                                                                <div
                                                                                                    className="absolute h-2.5 top-[9px] rounded-full border border-gray-400/20"
                                                                                                    style={{
                                                                                                        ...getCategoryBarStyle(subsubDateRange, viewMode, config, timeRange),
                                                                                                        backgroundColor: `${subColor}20`,
                                                                                                        zIndex: 10
                                                                                                    }}
                                                                                                >
                                                                                                    <div
                                                                                                        className="absolute left-0 top-0 bottom-0 rounded-full"
                                                                                                        style={{
                                                                                                            width: `${subsubSummary.avgProgress}%`,
                                                                                                            backgroundColor: subColor,
                                                                                                            opacity: 0.6
                                                                                                        }}
                                                                                                    />
                                                                                                </div>
                                                                                            )}
                                                                                        </div>

                                                                                    </div>
                                                                                    {tasks.sort((a, b) => (a.order || 0) - (b.order || 0)).map(t => (
                                                                                        <TaskRow
                                                                                            key={t.id} task={t} level={2}
                                                                                            tasks={optimisticTasks} config={config} viewMode={viewMode}
                                                                                            timeRange={timeRange} visibleColumns={visibleColumns} stickyWidth={stickyWidth}
                                                                                            timeline={timeline} collapsedTasks={collapsedTasks} dragState={dragState}
                                                                                            rowDragState={rowDragState} dropTargetId={dropTargetId} dropPosition={dropPosition}
                                                                                            isUpdating={isDragUpdating} showDependencies={showDependencies} dependencySource={dependencySource}
                                                                                            getTaskWeight={getTaskWeight} hasChildren={hasChildren} getChildTasks={getChildTasks}
                                                                                            onTaskUpdate={onTaskUpdate} onAddSubTask={onAddSubTask} toggleTaskCollapse={toggleTaskCollapse}
                                                                                            handleRowDragStart={handleRowDragStart} handleRowDragOver={handleRowDragOver}
                                                                                            handleRowDragLeave={handleRowDragLeave} handleRowDrop={handleRowDrop} handleRowDragEnd={handleRowDragEnd}
                                                                                            handleRemoveFromParent={handleRemoveFromParent} setActiveColorMenu={setActiveColorMenu}
                                                                                            handleDependencyClick={handleDependencyClick} setModalConfig={setModalConfig} startDrag={startDrag}
                                                                                            loadingIds={effectiveLoadingIds}
                                                                                        />
                                                                                    ))}
                                                                                </div>
                                                                            );
                                                                        })}

                                                                        {/* Direct Tasks in Subcat */}
                                                                        {subData.tasks.sort((a, b) => (a.order || 0) - (b.order || 0)).map(t => (
                                                                            <TaskRow
                                                                                key={t.id}
                                                                                task={t}
                                                                                level={1}
                                                                                tasks={optimisticTasks}
                                                                                config={config}
                                                                                viewMode={viewMode}
                                                                                timeRange={timeRange}
                                                                                visibleColumns={visibleColumns}
                                                                                stickyWidth={stickyWidth}
                                                                                timeline={timeline}
                                                                                collapsedTasks={collapsedTasks}
                                                                                dragState={dragState}
                                                                                rowDragState={rowDragState}
                                                                                dropTargetId={dropTargetId}
                                                                                dropPosition={dropPosition}
                                                                                isUpdating={isDragUpdating}
                                                                                showDependencies={showDependencies}
                                                                                dependencySource={dependencySource}
                                                                                getTaskWeight={getTaskWeight}
                                                                                hasChildren={hasChildren}
                                                                                getChildTasks={getChildTasks}
                                                                                onTaskUpdate={onTaskUpdate}
                                                                                onAddSubTask={onAddSubTask}
                                                                                toggleTaskCollapse={toggleTaskCollapse}
                                                                                handleRowDragStart={handleRowDragStart}
                                                                                handleRowDragOver={handleRowDragOver}
                                                                                handleRowDragLeave={handleRowDragLeave}
                                                                                handleRowDrop={handleRowDrop}
                                                                                handleRowDragEnd={handleRowDragEnd}
                                                                                handleRemoveFromParent={handleRemoveFromParent}
                                                                                setActiveColorMenu={setActiveColorMenu}
                                                                                handleDependencyClick={handleDependencyClick}
                                                                                setModalConfig={setModalConfig}
                                                                                startDrag={startDrag}
                                                                                loadingIds={effectiveLoadingIds}
                                                                            />
                                                                        ))}
                                                                    </>
                                                                )}
                                                            </div>
                                                        );
                                                    })}

                                                    {/* Direct Tasks in Category */}
                                                    {catData.tasks.sort((a, b) => (a.order || 0) - (b.order || 0)).map(t => (
                                                        <TaskRow
                                                            key={t.id}
                                                            task={t}
                                                            level={0}
                                                            tasks={optimisticTasks}
                                                            config={config}
                                                            viewMode={viewMode}
                                                            timeRange={timeRange}
                                                            visibleColumns={visibleColumns}
                                                            stickyWidth={stickyWidth}
                                                            timeline={timeline}
                                                            collapsedTasks={collapsedTasks}
                                                            dragState={dragState}
                                                            rowDragState={rowDragState}
                                                            dropTargetId={dropTargetId}
                                                            dropPosition={dropPosition}
                                                            isUpdating={isDragUpdating}
                                                            showDependencies={showDependencies}
                                                            dependencySource={dependencySource}
                                                            getTaskWeight={getTaskWeight}
                                                            hasChildren={hasChildren}
                                                            getChildTasks={getChildTasks}
                                                            onTaskUpdate={onTaskUpdate}
                                                            onAddSubTask={onAddSubTask}
                                                            toggleTaskCollapse={toggleTaskCollapse}
                                                            handleRowDragStart={handleRowDragStart}
                                                            handleRowDragOver={handleRowDragOver}
                                                            handleRowDragLeave={handleRowDragLeave}
                                                            handleRowDrop={handleRowDrop}
                                                            handleRowDragEnd={handleRowDragEnd}
                                                            handleRemoveFromParent={handleRemoveFromParent}
                                                            setActiveColorMenu={setActiveColorMenu}
                                                            handleDependencyClick={handleDependencyClick}
                                                            setModalConfig={setModalConfig}
                                                            startDrag={startDrag}
                                                            loadingIds={effectiveLoadingIds}
                                                        />
                                                    ))}
                                                </>
                                            )}
                                        </div>
                                    )
                                })}
                        </div>
                    </div>
                </div>
            </div>

            {/* TOTAL FOOTER BAR - Restored */}
            <div className="flex-shrink-0 bg-gray-100 border-t border-gray-300 z-[80] shadow-[0_-2px_10px_rgba(0,0,0,0.05)] font-mono text-xs">
                <div className="flex h-10 items-center">
                    {/* Fixed Left Section */}
                    <div className="sticky left-0 bg-gray-100 border-r border-gray-300 flex items-center px-4 font-bold text-gray-800 z-20"
                        style={{ width: `${stickyWidth}px`, minWidth: `${stickyWidth}px` }}>
                        <div className="flex-1">TOTAL</div>

                        {visibleColumns.cost && (
                            <div className="w-20 text-right shrink-0 text-blue-800">
                                {summaryStats.cost.toLocaleString()}
                            </div>
                        )}
                        {visibleColumns.weight && (
                            <div className="w-14 text-right shrink-0">
                                100%
                            </div>
                        )}
                        {/* Spacer for other cols */}
                        {visibleColumns.quantity && <div className="w-16 shrink-0" />}
                        {visibleColumns.period && <div className="w-[110px] shrink-0" />}

                        {visibleColumns.progress && (
                            <div className="w-20 text-right shrink-0 pr-1 flex items-center justify-end gap-2">
                                <span className="text-gray-500 text-[10px]">ACTUAL:</span>
                                <span className={`text-sm ${summaryStats.progress >= 100 ? 'text-green-600' : 'text-blue-600'}`}>
                                    {summaryStats.progress.toFixed(2)}%
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Timeline Footer (Optional: could show projected bars) */}
                    <div className="flex-1 bg-gray-50 text-gray-400 flex items-center justify-center italic text-[10px]">
                        Overall Project Status
                    </div>
                </div>
            </div>

            {/* Global Confirm Modal (optional, if using setModalConfig) */}
            {modalConfig.isOpen && (
                <div className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full">
                        <h3 className="text-lg font-bold text-gray-900 mb-2">{modalConfig.title}</h3>
                        <p className="text-gray-600 mb-6">{modalConfig.message}</p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setModalConfig({ ...modalConfig, isOpen: false })}
                                className="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
                            >
                                Cancel
                            </button>
                            {modalConfig.type === 'confirm' && (
                                <button
                                    onClick={() => { modalConfig.onConfirm?.(); setModalConfig({ ...modalConfig, isOpen: false }); }}
                                    className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                                >
                                    Confirm
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Color Menu Popup */}
            {activeColorMenu && (
                <>
                    {/* Backdrop to close menu */}
                    <div
                        className="fixed inset-0 z-[998]"
                        onClick={() => setActiveColorMenu(null)}
                    />
                    <div
                        className="fixed z-[999] bg-white rounded-lg shadow-xl border border-gray-200 p-3 w-40"
                        style={{ top: activeColorMenu.top, left: activeColorMenu.left }}
                    >
                        <div className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">Select Color</div>
                        <div className="grid grid-cols-4 gap-2">
                            {[
                                '#3b82f6', // Blue
                                '#ef4444', // Red
                                '#22c55e', // Green
                                '#eab308', // Yellow
                                '#a855f7', // Purple
                                '#ec4899', // Pink
                                '#f97316', // Orange
                                '#6b7280'  // Gray
                            ].map(color => (
                                <button
                                    key={color}
                                    className="w-6 h-6 rounded-full border border-gray-200 hover:scale-110 transition-transform focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-400"
                                    style={{ backgroundColor: color }}
                                    onClick={() => {
                                        const newColors = { ...categoryColors, [activeColorMenu.id]: color };
                                        setCategoryColors(newColors);
                                        localStorage.setItem('gantt_category_colors', JSON.stringify(newColors));
                                        setActiveColorMenu(null);
                                    }}
                                    title={color}
                                />
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
