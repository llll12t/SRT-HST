'use client';

import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Task, Employee } from '@/types/construction';
import { differenceInDays, parseISO, addMonths, subMonths, isAfter, isBefore, format, addDays, differenceInMonths } from 'date-fns';

import { ViewMode, RowDragState, VisibleColumns, ColorMenuConfig } from './types';
import { DependencyLines } from './DependencyLines';
import { CategoryRow } from './CategoryRow';
import { TaskRow } from './TaskRow';
import { getCategorySummary, getCategoryBarStyle, formatDateRange } from './utils'; // Modified import
import GanttToolbar from './GanttToolbar';
import TimelineHeader from './TimelineHeader';
import { usePdfExport } from '@/hooks/usePdfExport';

// Hooks
import { useGanttDrag } from './hooks/useGanttDrag';
import { useGanttTimeline } from './hooks/useGanttTimeline';

interface GanttChartProps {
    tasks: Task[];
    employees?: Employee[];
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
    categoryOrder?: string[];
    onCategoryOrderChange?: (order: string[]) => void;
    subcategoryOrder?: Record<string, string[]>;
    onSubcategoryOrderChange?: (categoryName: string, order: string[]) => void;
    isSavingOrder?: boolean;
    allowedViewModes?: ViewMode[];
    isFourWeekView?: boolean;
    isProcurementMode?: boolean;
    procurementOffsets?: {
        dueProcurementDays: number;
        dueMaterialOnSiteDays: number;
        dateOfUseOffsetDays: number;
    };
    onProcurementOffsetsChange?: (offsets: {
        dueProcurementDays: number;
        dueMaterialOnSiteDays: number;
        dateOfUseOffsetDays: number;
    }) => void;
    onApplyProcurementOffsetsToAll?: () => Promise<void>;
    isApplyingOffsets?: boolean;
}

export default function GanttChart({
    tasks: propTasks,
    employees = [],
    startDate = '2024-09-01',
    endDate = '2025-04-30',
    title,
    viewMode: controlledViewMode,
    onViewModeChange,
    onTaskUpdate,
    onOpenProgressModal,
    onAddSubTask,
    onAddTaskToCategory,
    updatingTaskIds,
    categoryOrder: propCategoryOrder,
    onCategoryOrderChange,
    subcategoryOrder: propSubcategoryOrder,
    onSubcategoryOrderChange,
    isSavingOrder = false,
    allowedViewModes = ['day', 'week', 'month'],
    isFourWeekView = false,
    isProcurementMode = false,
    procurementOffsets = { dueProcurementDays: -14, dueMaterialOnSiteDays: -7, dateOfUseOffsetDays: 0 },
    onProcurementOffsetsChange,
    onApplyProcurementOffsetsToAll,
    isApplyingOffsets = false
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
            for (const entry of entries) {
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
    const [showDependencies, setShowDependencies] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);

    // Column Visibility
    const defaultVisibleColumns: VisibleColumns = {
        cost: false,
        weight: false,
        quantity: false,
        period: !isProcurementMode,
        team: false,
        progress: !isProcurementMode,
        dueProcurement: isProcurementMode,
        dueMaterialOnSite: isProcurementMode,
        dateOfUse: isProcurementMode,
        duration: isProcurementMode,
        procurementStatus: isProcurementMode
    };
    const visibleColumnsStorageKey = isProcurementMode
        ? 'gantt_visibleColumns_procurement_v2'
        : 'gantt_visibleColumns_v3';
    const [visibleColumns, setVisibleColumns] = useState<VisibleColumns>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem(visibleColumnsStorageKey);
            if (saved) {
                try {
                    const parsed = JSON.parse(saved) as Partial<VisibleColumns>;
                    return { ...defaultVisibleColumns, ...parsed };
                } catch {
                    return defaultVisibleColumns;
                }
            }
            return defaultVisibleColumns;
        }
        return defaultVisibleColumns;
    });

    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem(visibleColumnsStorageKey, JSON.stringify(visibleColumns));
        }
    }, [visibleColumns, visibleColumnsStorageKey]);

    // Row Drag & Drop State
    const [rowDragState, setRowDragState] = useState<RowDragState | null>(null);
    const [dropTargetId, setDropTargetId] = useState<string | null>(null);
    const [dropPosition, setDropPosition] = useState<'above' | 'below' | 'child' | null>(null);
    const [enabledGroupDragId, setEnabledGroupDragId] = useState<string | null>(null);
    const [internalCategoryOrder, setInternalCategoryOrder] = useState<string[]>([]);
    const categoryOrder = propCategoryOrder || internalCategoryOrder;

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
        e.stopPropagation();
        console.log('[CategoryDragStart] Starting drag for category:', category);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', category);
        e.dataTransfer.setData('application/x-category', category);
        setCategoryDragState({ id: category, type: 'category' });
    };

    const handleCategoryDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleCategoryDrop = async (e: React.DragEvent, targetCategory: string) => {
        e.preventDefault();
        e.stopPropagation();

        if (rowDragState && onTaskUpdate) {
            await moveTaskToScope(rowDragState.taskId, {
                parentTaskId: null,
                category: targetCategory,
                subcategory: '',
                subsubcategory: ''
            });
            handleRowDragEnd();
            return;
        }

        const sourceId = categoryDragState?.id;
        const dragType = categoryDragState?.type;

        console.log('[CategoryDrop] sourceId:', sourceId, 'dragType:', dragType, 'targetCategory:', targetCategory);

        setCategoryDragState(null);

        if (!sourceId) {
            console.log('[CategoryDrop] No sourceId, returning');
            return;
        }

        if (dragType === 'category') {
            if (sourceId === targetCategory) {
                console.log('[CategoryDrop] Source equals target, returning');
                return;
            }
            const allCats = Object.keys(groupedTasks);
            const currentOrder = categoryOrder.length > 0 ? [...categoryOrder] : [...allCats];
            // Ensure all existing categories are in the order array
            allCats.forEach(c => { if (!currentOrder.includes(c)) currentOrder.push(c); });

            const sourceIndex = currentOrder.indexOf(sourceId);
            const targetIndex = currentOrder.indexOf(targetCategory);

            console.log('[CategoryDrop] sourceIndex:', sourceIndex, 'targetIndex:', targetIndex, 'currentOrder:', currentOrder);

            if (sourceIndex > -1 && targetIndex > -1 && sourceIndex !== targetIndex) {
                // Remove source from its current position
                currentOrder.splice(sourceIndex, 1);
                // Insert at target position (adjust if source was before target)
                const adjustedTargetIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
                currentOrder.splice(adjustedTargetIndex, 0, sourceId);

                console.log('[CategoryDrop] New order:', currentOrder, 'onCategoryOrderChange exists:', !!onCategoryOrderChange);

                if (onCategoryOrderChange) {
                    onCategoryOrderChange(currentOrder);
                } else {
                    setInternalCategoryOrder(currentOrder);
                }
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
        const dragType = categoryDragState?.type;

        console.log('[SubcategoryDrop] sourceId:', sourceId, 'dragType:', dragType, 'targetKey:', targetKey);

        setCategoryDragState(null);
        if (!sourceId) {
            console.log('[SubcategoryDrop] No sourceId, returning');
            return;
        }

        // Handle subcategory reordering within the same parent category
        if (dragType === 'subcategory' && sourceId !== targetKey) {
            // Parse source and target
            const [sourceCat, sourceSub] = sourceId.split('::');
            const [targetCat, targetSub] = targetKey.split('::');

            console.log('[SubcategoryDrop] sourceCat:', sourceCat, 'sourceSub:', sourceSub, 'targetCat:', targetCat, 'targetSub:', targetSub);

            // If same parent category, reorder subcategories using subcategoryOrder
            if (sourceCat === targetCat && onSubcategoryOrderChange) {
                // Get all subcategories in this category
                const catData = groupedTasks[sourceCat];
                if (!catData) return;

                const allSubs = Object.keys(catData.subcategories);
                const existingOrder = propSubcategoryOrder?.[sourceCat];
                const currentOrder = existingOrder && existingOrder.length > 0
                    ? [...existingOrder]
                    : [...allSubs];

                // Ensure all subcategories are in the order
                allSubs.forEach(s => { if (!currentOrder.includes(s)) currentOrder.push(s); });

                const sourceIndex = currentOrder.indexOf(sourceSub);
                const targetIndex = currentOrder.indexOf(targetSub);

                console.log('[SubcategoryDrop] sourceIndex:', sourceIndex, 'targetIndex:', targetIndex, 'currentOrder:', currentOrder);

                if (sourceIndex > -1 && targetIndex > -1 && sourceIndex !== targetIndex) {
                    // Remove source and insert at target position
                    currentOrder.splice(sourceIndex, 1);
                    const adjustedTargetIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
                    currentOrder.splice(adjustedTargetIndex, 0, sourceSub);

                    console.log('[SubcategoryDrop] New order:', currentOrder);
                    onSubcategoryOrderChange(sourceCat, currentOrder);
                }
            } else if (sourceCat !== targetCat && onTaskUpdate) {
                // Move to different category
                const tasksToMove = optimisticTasks.filter(t =>
                    t.category === sourceCat && t.subcategory === sourceSub
                );
                await Promise.all(tasksToMove.map(t =>
                    onTaskUpdate(t.id, { category: targetCat, subcategory: targetSub })
                ));
            }
        }
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

                // Circular Dependency Check
                const hasCycle = (sourceId: string, targetId: string) => {
                    const visited = new Set<string>();
                    const queue = [targetId];
                    while (queue.length > 0) {
                        const curr = queue.shift()!;
                        if (curr === sourceId) return true;

                        const t = optimisticTasks.find(x => x.id === curr);
                        if (t && t.predecessors) {
                            for (const p of t.predecessors) {
                                if (!visited.has(p)) {
                                    visited.add(p);
                                    queue.push(p);
                                }
                            }
                        }
                    }
                    return false;
                };

                if (hasCycle(dependencySource.taskId, taskId)) {
                    setModalConfig({
                        isOpen: true,
                        title: 'Circular Dependency',
                        message: 'Cannot link tasks because it would create a circular dependency loop.',
                        type: 'alert'
                    });
                    setDependencySource(null);
                    return;
                }

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
        // Filter only leaf tasks for statistics to avoid double counting groups
        const leafTasks = optimisticTasks.filter(t => t.type !== 'group');
        const totalCost = leafTasks.reduce((sum, t) => sum + (t.cost || 0), 0);
        const totalDuration = leafTasks.reduce((sum, t) => {
            const d = differenceInDays(parseISO(t.planEndDate), parseISO(t.planStartDate)) + 1;
            return sum + Math.max(0, d);
        }, 0);
        const useCostWeighting = leafTasks.some(t => (t.cost || 0) > 0);
        return { totalCost, totalDuration, useCostWeighting, totalWeight: useCostWeighting ? totalCost : totalDuration };
    }, [optimisticTasks]);

    const getTaskWeight = (task: Task) => {
        // Groups don't have intrinsic weight (they are containers)
        if (task.type === 'group') return 0;

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

    const [scrollTop, setScrollTop] = useState(0);
    const [scrollLeft, setScrollLeft] = useState(0);

    const virtualData = useMemo(() => {
        const map = new Map<string, number>();
        const rows: any[] = [];
        let currentRow = 0;

        const addRow = (item: any) => {
            rows.push(item);
            currentRow++;
        };

        // Recursive task processor
        const processTaskList = (list: Task[], level: number) => {
            list.sort((a, b) => (a.order || 0) - (b.order || 0)).forEach(t => {
                map.set(t.id, currentRow);
                addRow({ type: 'task', task: t, level, id: t.id });
                if (!collapsedTasks.has(t.id)) {
                    const children = optimisticTasks.filter(c => c.parentTaskId === t.id);
                    if (children.length > 0) processTaskList(children, level + 1);
                }
            });
        };

        const sortedCats = Object.keys(groupedTasks).sort((a, b) => {
            const ia = categoryOrder.indexOf(a);
            const ib = categoryOrder.indexOf(b);
            if (ia >= 0 && ib >= 0) return ia - ib;
            return 0;
            // Original logic: if (categoryOrder.length === 0) return 0; ...
            // Simplified here but robust.
        });

        sortedCats.forEach(cat => {
            // Category Header
            // We don't necessarily map headers in visibleRowMap for dependency lines, but consistent accounting of currentRow is Key.
            const catData = groupedTasks[cat];
            addRow({ type: 'category', id: cat, category: cat, catData });

            if (!collapsedCategories.has(cat)) {
                // Subcategories
                const sortedSubs = Object.entries(catData.subcategories).sort(([a], [b]) => {
                    const order = propSubcategoryOrder?.[cat];
                    if (!order || order.length === 0) return 0;
                    const ia = order.indexOf(a);
                    const ib = order.indexOf(b);
                    if (ia === -1) return 1;
                    if (ib === -1) return -1;
                    return ia - ib;
                });

                sortedSubs.forEach(([subcat, subData]) => {
                    const uniqueSubcatId = `${cat}::${subcat}`;
                    addRow({
                        type: 'subcategory',
                        id: uniqueSubcatId,
                        category: cat,
                        subcategory: subcat,
                        subData,
                        // Pass computed props if needed to avoid re-calc in render?
                        // For now keep it simple.
                    });

                    if (!collapsedSubcategories.has(uniqueSubcatId)) {
                        // Sub-Subcategories
                        // Note: SubSubcategories don't seem to have an explicit order prop in the original code, 
                        // they just follow insertion order or alphabetical? 
                        // Original code: Object.keys(subData.subsubcategories).forEach...
                        // Let's stick to Object.entries
                        Object.entries(subData.subsubcategories).forEach(([subsub, tasks]) => {
                            const uniqueSubsubId = `${cat}::${subcat}::${subsub}`;
                            addRow({
                                type: 'subsubcategory',
                                id: uniqueSubsubId,
                                category: cat,
                                subcategory: subcat,
                                subsubcategory: subsub,
                                tasks
                            });

                            if (!collapsedSubcategories.has(uniqueSubsubId)) {
                                processTaskList(tasks, 2);
                            }
                        });
                        processTaskList(subData.tasks, 1);
                    }
                });
                processTaskList(catData.tasks, 0);
            }
        });

        return { map, rows };
    }, [groupedTasks, collapsedCategories, collapsedSubcategories, collapsedTasks, optimisticTasks, categoryOrder, propSubcategoryOrder]);

    const visibleRowMap = virtualData.map;
    const ROW_HEIGHT = 32;
    const EMPLOYEE_COL_WIDTH = 92;
    const startIndex = Math.floor(scrollTop / ROW_HEIGHT);
    const endIndex = Math.min(startIndex + Math.ceil(800 / ROW_HEIGHT) + 10, virtualData.rows.length); // 800px buffer
    const visibleRows = virtualData.rows.slice(startIndex, endIndex);
    const totalHeight = virtualData.rows.length * ROW_HEIGHT;
    const offsetY = startIndex * ROW_HEIGHT;

    const stickyWidth = useMemo(() => {
        let w = 280; // Adjusted base width for Name
        if (visibleColumns.cost) w += 80;
        if (visibleColumns.weight) w += 64; // w-16
        if (visibleColumns.quantity) w += 80; // w-20
        if (isProcurementMode && visibleColumns.dueProcurement) w += 78;
        if (isProcurementMode && visibleColumns.dueMaterialOnSite) w += 78;
        if (isProcurementMode && visibleColumns.dateOfUse) w += 78;
        if (isProcurementMode && visibleColumns.duration) w += 62;
        if (isProcurementMode && visibleColumns.procurementStatus) w += 96;
        if (visibleColumns.planDuration) w += 60;
        if (visibleColumns.actualDuration) w += 60;
        if (visibleColumns.period) w += 150; // w-[150px]
        if (visibleColumns.team) w += EMPLOYEE_COL_WIDTH;
        if (visibleColumns.progress) w += 80;
        return w + 30; // buffer
    }, [visibleColumns, EMPLOYEE_COL_WIDTH, isProcurementMode]);

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
    const moveTaskToScope = async (
        taskId: string,
        scope: { category: string; subcategory?: string; subsubcategory?: string; parentTaskId?: string | null }
    ) => {
        if (!onTaskUpdate) return;
        const scopeSub = scope.subcategory || '';
        const scopeSubSub = scope.subsubcategory || '';
        const scopeParent = scope.parentTaskId ?? null;

        const siblings = optimisticTasks.filter(t =>
            (t.parentTaskId || null) === scopeParent &&
            (t.category || '') === scope.category &&
            (t.subcategory || '') === scopeSub &&
            (t.subsubcategory || '') === scopeSubSub
        );
        const maxOrder = siblings.length > 0 ? Math.max(...siblings.map(t => t.order || 0)) : 0;

        await onTaskUpdate(taskId, {
            parentTaskId: scopeParent,
            category: scope.category,
            subcategory: scopeSub,
            subsubcategory: scopeSubSub,
            order: maxOrder + 100000
        });
    };
    const handleRowDragOver = (e: React.DragEvent, targetId?: string) => {
        e.preventDefault();
        if (targetId && rowDragState && rowDragState.taskId !== targetId) {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const relY = e.clientY - rect.top;
            const h = rect.height;

            // Check if target task is a group (only groups can have children)
            const targetTask = optimisticTasks.find(t => t.id === targetId);
            const canBeChild = targetTask?.type === 'group';

            if (relY < h * 0.3) setDropPosition('above');
            else if (relY > h * 0.7) setDropPosition('below');
            else setDropPosition(canBeChild ? 'child' : 'above'); // Default to 'above' if not a group
            setDropTargetId(targetId);
        }
    };
    const handleTaskDropToSubcategory = async (e: React.DragEvent, category: string, subcategory: string) => {
        e.preventDefault();
        e.stopPropagation();
        if (!rowDragState || !onTaskUpdate) return;
        const sourceId = rowDragState.taskId;
        await moveTaskToScope(sourceId, {
            parentTaskId: null,
            category,
            subcategory,
            subsubcategory: ''
        });
        handleRowDragEnd();
    };
    const handleTaskDropToSubsubcategory = async (e: React.DragEvent, category: string, subcategory: string, subsubcategory: string) => {
        e.preventDefault();
        e.stopPropagation();
        if (!rowDragState || !onTaskUpdate) return;
        const sourceId = rowDragState.taskId;
        await moveTaskToScope(sourceId, {
            parentTaskId: null,
            category,
            subcategory,
            subsubcategory
        });
        handleRowDragEnd();
    };
    const handleRowDrop = async (e: React.DragEvent, targetId: string) => {
        e.preventDefault();
        if (!rowDragState || !onTaskUpdate || !dropPosition) return;
        const sourceId = rowDragState.taskId;
        if (sourceId === targetId) return;

        const targetTask = optimisticTasks.find(t => t.id === targetId);
        if (!targetTask) return;

        if (dropPosition === 'child') {
            // Only allow dropping as child if target is a group type
            if (targetTask.type !== 'group') {
                console.log('[RowDrop] Cannot drop as child - target is not a group');
                handleRowDragEnd();
                return;
            }
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

    // Readable KPI set: Progress / Plan-to-Date / Gap / Variance
    const kpiStats = useMemo(() => {
        const referenceDate = customDate || new Date();
        const leafTasks = optimisticTasks.filter(t => t.type !== 'group');

        let planWeighted = 0;
        let weightSum = 0;
        let overallPlanStart: Date | null = null;
        let overallPlanEnd: Date | null = null;

        leafTasks.forEach((t) => {
            if (!t.planStartDate || !t.planEndDate) return;

            const planStart = parseISO(t.planStartDate);
            const planEnd = parseISO(t.planEndDate);
            if ([planStart, planEnd].some(d => isNaN(d.getTime()))) return;

            const taskWeight = getTaskWeight(t);
            if (taskWeight > 0) {
                weightSum += taskWeight;
                const planDays = Math.max(1, differenceInDays(planEnd, planStart) + 1);
                let plannedPercentAtRef = 0;

                if (isBefore(referenceDate, planStart)) {
                    plannedPercentAtRef = 0;
                } else if (!isBefore(referenceDate, planEnd)) {
                    plannedPercentAtRef = 100;
                } else {
                    const elapsed = Math.max(0, differenceInDays(referenceDate, planStart) + 1);
                    plannedPercentAtRef = Math.min(100, (elapsed / planDays) * 100);
                }
                planWeighted += taskWeight * plannedPercentAtRef;
            }

            if (!overallPlanStart || isBefore(planStart, overallPlanStart)) overallPlanStart = planStart;
            if (!overallPlanEnd || isAfter(planEnd, overallPlanEnd)) overallPlanEnd = planEnd;

        });
        const planToDate = weightSum > 0 ? planWeighted / weightSum : 0;
        const gap = summaryStats.progress - planToDate;
        const overallPlanSpanDays = overallPlanStart && overallPlanEnd
            ? Math.max(1, differenceInDays(overallPlanEnd, overallPlanStart) + 1)
            : null;
        const variancePercent = gap;
        const varianceDays = overallPlanSpanDays !== null
            ? Math.round((variancePercent / 100) * overallPlanSpanDays)
            : null;

        return {
            progress: summaryStats.progress,
            planToDate,
            gap,
            varianceDays,
            variancePercent
        };
    }, [optimisticTasks, customDate, summaryStats.progress, getTaskWeight]);

    // Scroll to Today Handler
    const handleJumpToToday = () => {
        const today = new Date();
        setCurrentDate(today);

        if (scrollContainerRef.current) {
            const diffDays = differenceInDays(today, timeRange.start);
            let leftPx = 0;
            if (viewMode === 'day') leftPx = diffDays * config.cellWidth;
            else if (viewMode === 'week') leftPx = (diffDays / 7) * config.cellWidth;
            else leftPx = (diffDays / 30.44) * config.cellWidth;

            // Center the view: (LeftPx) - (AvailableWidth / 2)
            const availableWidth = (containerWidth || scrollContainerRef.current.clientWidth) - stickyWidth;
            const scrollTo = Math.max(0, leftPx - (availableWidth / 2));

            scrollContainerRef.current.scrollTo({
                left: scrollTo,
                behavior: 'smooth'
            });
        }
    };

    return (
        <div
            ref={chartContainerRef}
            className={`relative flex flex-col bg-white border border-gray-300 w-full max-w-full overflow-hidden font-sans ${isExpanded
                ? 'fixed inset-0 z-[1200] h-screen w-screen rounded-none border-0 shadow-none'
                : 'h-[750px] rounded'
                }`}
        >
            <GanttToolbar
                title={title}
                timeRange={timeRange}
                viewMode={viewMode}
                onViewModeChange={handleViewModeChange}
                allowedViewModes={allowedViewModes}
                showDates={showDates}
                onToggleDates={() => setShowDates(!showDates)}
                onNavigate={navigate}
                onJumpToToday={handleJumpToToday}
                onExport={handleExportPDF}
                onExportPDF={handleExportPDF}
                budgetStats={budgetStats}
                kpiStats={kpiStats}
                visibleColumns={visibleColumns}
                onToggleColumn={(col) => setVisibleColumns((prev) => ({ ...prev, [col]: !prev[col] }))}
                onToggleAllColumns={(visible) => {
                    setVisibleColumns((prev) => {
                        const next = { ...prev };
                        (Object.keys(next) as (keyof VisibleColumns)[]).forEach(key => {
                            next[key] = visible;
                        });
                        return next;
                    });
                }}
                showDependencies={showDependencies}
                onToggleDependencies={() => setShowDependencies(!showDependencies)}
                customDate={customDate}
                onCustomDateChange={setCustomDate}
                isExpanded={isExpanded}
                onToggleExpand={() => setIsExpanded(prev => !prev)}
                isProcurementMode={isProcurementMode}
                procurementOffsets={procurementOffsets}
                onProcurementOffsetsChange={onProcurementOffsetsChange}
                onApplyProcurementOffsetsToAll={onApplyProcurementOffsetsToAll}
                isApplyingOffsets={isApplyingOffsets}
            />

            {/* Drag Snap Tooltip */}
            {dragState && (
                <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] bg-gray-800/90 text-white text-xs px-3 py-1.5 rounded-full shadow-xl flex items-center gap-2 pointer-events-none backdrop-blur-sm border border-gray-600">
                    <span className="font-bold text-gray-400 uppercase tracking-wider text-[10px]">Snap</span>
                    <span className="font-mono font-medium">
                        {dragState.currentStart ? format(dragState.currentStart, 'dd MMM yyyy') : '-'}
                        <span className="mx-1 text-gray-500">→</span>
                        {dragState.currentEnd ? format(dragState.currentEnd, 'dd MMM yyyy') : '-'}
                    </span>
                </div>
            )}

            {/* Saving Order Indicator */}
            {isSavingOrder && (
                <div className="absolute top-12 left-1/2 -translate-x-1/2 z-[100] bg-blue-600 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm font-medium animate-pulse">
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Saving...
                </div>
            )}

            <div className="flex-1 min-h-0 w-full relative">
                <div ref={scrollContainerRef} className="absolute inset-0 overflow-auto custom-scrollbar" onScroll={(e) => { setScrollTop(e.currentTarget.scrollTop); setScrollLeft(e.currentTarget.scrollLeft); }}>
                    <div className="min-w-max flex flex-col">
                        <TimelineHeader
                            viewMode={viewMode}
                            timeline={timeline}
                            config={config}
                            stickyWidth={stickyWidth}
                            showDates={showDates}
                            referenceDate={customDate}
                            visibleColumns={visibleColumns}
                            employeeColumnWidth={EMPLOYEE_COL_WIDTH}
                            isFourWeekView={isFourWeekView}
                            isProcurementMode={isProcurementMode}
                        />

                        <div className="relative">
                            {/* Reference Day Highlight - Clipped to Timeline Area */}
                            {(() => {
                                const targetDate = customDate || new Date();
                                const todayOffset = differenceInDays(targetDate, timeRange.start);
                                let leftPx = 0;
                                if (viewMode === 'day') leftPx = todayOffset * config.cellWidth;
                                else if (viewMode === 'week') leftPx = (todayOffset / 7) * config.cellWidth;
                                else leftPx = (todayOffset / 30.44) * config.cellWidth;

                                return (
                                    <div className="absolute top-0 bottom-0 right-0 z-30 pointer-events-none overflow-hidden"
                                        style={{ left: `${stickyWidth}px`, clipPath: `inset(0px 0px 0px ${Math.max(0, scrollLeft)}px)` }}>
                                        {viewMode === 'day' ? (
                                            <div
                                                className="absolute top-0 bottom-0 bg-green-100/35"
                                                style={{ left: `${leftPx}px`, width: `${config.cellWidth}px` }}
                                            >
                                                <div className="absolute top-0 bottom-0 w-px bg-yellow-500/80" style={{ left: '50%' }} />
                                            </div>
                                        ) : (
                                            <div
                                                className="absolute top-0 bottom-0 w-px bg-orange-500"
                                                style={{ left: `${leftPx}px` }}
                                            />
                                        )}
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
                                    offsetY={36}
                                    startIndex={startIndex}
                                    endIndex={endIndex}
                                    scrollLeft={scrollLeft}
                                />
                            )}

                            {/* Project Summary Row */}
                            {(() => {
                                const leafTasks = optimisticTasks.filter(t => t.type !== 'group');
                                const projSummary = getCategorySummary(leafTasks, getTaskWeight);
                                const displayProgress = summaryStats.progress;
                                const displayCost = summaryStats.cost;
                                const projDateRange = projSummary.dateRange;

                                return (
                                    <div className="border-b-2 border-gray-300 stick-project-header relative bg-white">
                                        <div className="flex bg-blue-50 border-b border-gray-200 h-9 font-bold text-gray-800">
                                            <div className="sticky left-0 z-[60] bg-blue-50 border-r border-gray-300 pl-4 flex items-center shadow-[1px_0_0px_rgba(0,0,0,0.05)]"
                                                style={{ width: `${stickyWidth}px`, minWidth: `${stickyWidth}px` }}>
                                                <div className="flex-1 truncate uppercase tracking-wider flex items-center">
                                                    <span className="bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded mr-2">PROJECT</span>
                                                    {title || "Construction Project"}
                                                    <span className="ml-2 text-[9px] text-gray-500 font-normal bg-white/50 px-1.5 rounded-full">{leafTasks.length} items</span>
                                                </div>

                                                {/* Columns */}
                                                {visibleColumns.cost && (
                                                    <div className="w-20 h-full flex items-center justify-end border-l border-gray-300/70 text-xs shrink-0 pr-2 truncate">
                                                        {displayCost.toLocaleString()}
                                                    </div>
                                                )}
                                                {visibleColumns.weight && (
                                                    <div className="w-16 h-full flex items-center justify-end border-l border-gray-300/70 text-xs shrink-0 pr-2 truncate">
                                                        100%
                                                    </div>
                                                )}
                                                {visibleColumns.quantity && (
                                                    <div className="w-20 h-full flex items-center justify-start border-l border-gray-300/70 shrink-0 pl-2 truncate">
                                                        -
                                                    </div>
                                                )}
                                                {isProcurementMode && visibleColumns.dueProcurement && (
                                                    <div className="w-[78px] h-full flex items-center justify-start border-l border-gray-300/70 text-[10px] shrink-0 pl-2 truncate">-</div>
                                                )}
                                                {isProcurementMode && visibleColumns.dueMaterialOnSite && (
                                                    <div className="w-[78px] h-full flex items-center justify-start border-l border-gray-300/70 text-[10px] shrink-0 pl-2 truncate">-</div>
                                                )}
                                                {isProcurementMode && visibleColumns.dateOfUse && (
                                                    <div className="w-[78px] h-full flex items-center justify-start border-l border-gray-300/70 text-[10px] shrink-0 pl-2 truncate">-</div>
                                                )}
                                                {isProcurementMode && visibleColumns.duration && (
                                                    <div className="w-[62px] h-full flex items-center justify-end border-l border-gray-300/70 text-[10px] shrink-0 pr-2 truncate">-</div>
                                                )}
                                                {isProcurementMode && visibleColumns.procurementStatus && (
                                                    <div className="w-[96px] h-full flex items-center justify-start border-l border-gray-300/70 text-[10px] shrink-0 pl-2 truncate">-</div>
                                                )}
                                                {visibleColumns.period && (
                                                    <div className="w-[150px] h-full flex items-center justify-start border-l border-gray-300/70 text-[10px] shrink-0 pl-2 truncate">
                                                        {projDateRange ? formatDateRange(projDateRange.start, projDateRange.end) : '-'}
                                                    </div>
                                                )}
                                                {visibleColumns.team && (
                                                    <div
                                                        className="h-full flex items-center justify-center border-l border-gray-300/70 shrink-0"
                                                        style={{ width: `${EMPLOYEE_COL_WIDTH}px`, minWidth: `${EMPLOYEE_COL_WIDTH}px` }}
                                                    />
                                                )}
                                                {visibleColumns.progress && (
                                                    <div className="w-20 h-full flex items-center justify-start border-l border-gray-300/70 shrink-0 gap-1 pl-2 truncate text-blue-700">
                                                        {displayProgress.toFixed(0)}%
                                                    </div>
                                                )}
                                            </div>

                                            {/* Project Bar Chart */}
                                            <div
                                                className="flex-none relative overflow-hidden border-l border-gray-300/90 bg-white"
                                                style={{ width: `${timeline.items.length * config.cellWidth}px`, minWidth: `${timeline.items.length * config.cellWidth}px` }}
                                            >
                                                <div className="absolute inset-0 flex pointer-events-none">
                                                    {timeline.items.map((item, idx) => (
                                                        <div key={idx} className={`flex-shrink-0 box-border h-full
                                                            ${isFourWeekView && viewMode === 'day'
                                                                ? `${Math.floor(idx / 7) % 4 === 0 ? 'bg-sky-50' : Math.floor(idx / 7) % 4 === 1 ? 'bg-rose-50' : Math.floor(idx / 7) % 4 === 2 ? 'bg-emerald-50' : 'bg-violet-50'} border-r border-slate-300/35`
                                                                : viewMode === 'week'
                                                                    ? `border-r border-slate-300 ${idx % 2 === 0 ? 'bg-slate-50/60' : 'bg-white'}`
                                                                    : 'border-r border-dashed border-gray-300/60'}
                                                            ${viewMode === 'day' && !isFourWeekView ? (item.getDay() === 6 ? 'bg-violet-50/45' : item.getDay() === 0 ? 'bg-red-50/45' : '') : ''}`}
                                                            style={{ width: config.cellWidth }} />
                                                    ))}
                                                </div>
                                                {projDateRange && (
                                                    <div
                                                        className="absolute h-4 top-[10px] rounded-full border border-blue-600/30 shadow-sm"
                                                        style={{
                                                            ...getCategoryBarStyle(projDateRange, viewMode, config, timeRange),
                                                            backgroundColor: 'rgba(59, 130, 246, 0.25)',
                                                            zIndex: 35
                                                        }}
                                                    >
                                                        <div
                                                            className="absolute left-0 top-0 bottom-0 rounded-full bg-blue-600"
                                                            style={{
                                                                width: `${displayProgress}%`,
                                                                opacity: 0.9
                                                            }}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}

                            <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
                                <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${offsetY}px)` }}>
                                    {visibleRows.map((row) => {
                                        if (row.type === 'category') {
                                            const { category, catData } = row;
                                            return (
                                                <CategoryRow
                                                    key={row.id}
                                                    category={category}
                                                    catData={catData}
                                                    collapsedCategories={collapsedCategories}
                                                    toggleCategory={toggleCategory}
                                                    categoryColors={categoryColors}
                                                    setActiveColorMenu={setActiveColorMenu}
                                                    onAddTaskToCategory={onAddTaskToCategory}
                                                    visibleColumns={visibleColumns}
                                                    stickyWidth={stickyWidth}
                                                    employeeColumnWidth={EMPLOYEE_COL_WIDTH}
                                                    timeline={timeline}
                                                    config={config}
                                                    viewMode={viewMode}
                                                    isFourWeekView={isFourWeekView}
                                                    isProcurementMode={isProcurementMode}
                                                    timeRange={timeRange}
                                                    getTaskWeight={getTaskWeight}
                                                    onCategoryDragStart={handleCategoryDragStart}
                                                    onCategoryDragOver={handleCategoryDragOver}
                                                    onCategoryDrop={handleCategoryDrop}
                                                    isDragging={categoryDragState?.id === category && categoryDragState?.type === 'category'}
                                                    loadingIds={effectiveLoadingIds}
                                                />
                                            );
                                        }

                                        if (row.type === 'subcategory') {
                                            const { category, subcategory: subcat, subData, id: uniqueSubcatId } = row;
                                            const color = categoryColors[uniqueSubcatId] || categoryColors[category] || '#3b82f6';
                                            const subTasks = [
                                                ...subData.tasks,
                                                ...Object.values(subData.subsubcategories).flat()
                                            ] as Task[];
                                            const subSummary = getCategorySummary(subTasks, getTaskWeight);
                                            const subDateRange = subSummary.dateRange;
                                            const isSubCollapsed = collapsedSubcategories.has(uniqueSubcatId);

                                            return (
                                                <div key={row.id}>
                                                    {/* Subcategory Header */}
                                                    <div
                                                        className={`flex bg-white border-b border-dashed border-gray-200 h-8 group hover:bg-slate-50 transition-colors ${categoryDragState?.id === uniqueSubcatId && categoryDragState?.type === 'subcategory' ? 'opacity-40 bg-blue-50' : ''}`}
                                                        draggable={enabledGroupDragId === uniqueSubcatId}
                                                        onDragStart={(e) => handleSubcategoryDragStart(e, uniqueSubcatId, 'subcategory')}
                                                        onDragOver={handleCategoryDragOver}
                                                        onDrop={(e) => rowDragState
                                                            ? handleTaskDropToSubcategory(e, category, subcat)
                                                            : handleSubcategoryDrop(e, uniqueSubcatId)}
                                                        onDragEnd={() => setEnabledGroupDragId(null)}
                                                    >
                                                        <div className="sticky left-0 z-[60] h-full bg-white group-hover:bg-slate-50 border-r border-gray-300 pl-2 flex items-center"
                                                            style={{ width: `${stickyWidth}px`, minWidth: `${stickyWidth}px`, paddingLeft: '24px' }}>
                                                            {/* Drag Handle */}
                                                            <button
                                                                type="button"
                                                                className="cursor-grab text-gray-400 hover:text-gray-600 mr-1"
                                                                title="Move Subcategory"
                                                                onMouseDown={(e) => {
                                                                    e.stopPropagation();
                                                                    setEnabledGroupDragId(uniqueSubcatId);
                                                                }}
                                                                onMouseUp={() => setEnabledGroupDragId(null)}
                                                                onTouchStart={(e) => {
                                                                    e.stopPropagation();
                                                                    setEnabledGroupDragId(uniqueSubcatId);
                                                                }}
                                                                onTouchEnd={() => setEnabledGroupDragId(null)}
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M8 6h8v2H8V6zm0 4h8v2H8v-2zm0 4h8v2H8v-2z" /></svg>
                                                            </button>

                                                            <button
                                                                className="w-4 h-4 mr-1 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-sm"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    toggleSubcategory(uniqueSubcatId);
                                                                }}
                                                                title={isSubCollapsed ? 'Expand children' : 'Collapse children'}
                                                            >
                                                                {isSubCollapsed ? (
                                                                    <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor"><path d="M7 5l6 5-6 5V5z" /></svg>
                                                                ) : (
                                                                    <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor"><path d="M5 7l5 6 5-6H5z" /></svg>
                                                                )}
                                                            </button>

                                                            {/* Color Picker for Subcategory */}
                                                            <button
                                                                className="w-2.5 h-2.5 rounded-full border border-gray-300 hover:scale-110 transition-transform shadow-sm flex-shrink-0 mr-2"
                                                                style={{ backgroundColor: color }}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    const rect = e.currentTarget.getBoundingClientRect();
                                                                    setActiveColorMenu({
                                                                        id: uniqueSubcatId,
                                                                        type: 'category',
                                                                        top: rect.bottom + window.scrollY,
                                                                        left: rect.left + window.scrollX
                                                                    });
                                                                }}
                                                                title="Change Subcategory Color"
                                                            />

                                                            <div className="h-full flex-1 flex items-stretch overflow-hidden">
                                                                <div className="h-full flex-1 flex items-center min-w-0 pr-2">
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
                                                                {visibleColumns.cost && <div className="h-full flex items-center justify-end border-l border-gray-300/40 text-xs text-gray-900 font-bold font-mono w-20 shrink-0 pr-2 truncate">{(subSummary.totalCost || 0).toLocaleString()}</div>}
                                                                {visibleColumns.weight && <div className="h-full flex items-center justify-end border-l border-gray-300/40 text-xs text-gray-900 font-bold font-mono w-16 shrink-0 pr-2 truncate">{(subSummary.totalWeight || 0).toFixed(2)}%</div>}
                                                                {visibleColumns.quantity && <div className="h-full flex items-center justify-start border-l border-gray-300/40 w-20 shrink-0 text-left pl-2 truncate"></div>}
                                                                {isProcurementMode && visibleColumns.dueProcurement && <div className="h-full flex items-center justify-start border-l border-gray-300/40 w-[78px] shrink-0 text-left pl-2 text-[10px] text-gray-500 truncate">-</div>}
                                                                {isProcurementMode && visibleColumns.dueMaterialOnSite && <div className="h-full flex items-center justify-start border-l border-gray-300/40 w-[78px] shrink-0 text-left pl-2 text-[10px] text-gray-500 truncate">-</div>}
                                                                {isProcurementMode && visibleColumns.dateOfUse && <div className="h-full flex items-center justify-start border-l border-gray-300/40 w-[78px] shrink-0 text-left pl-2 text-[10px] text-gray-500 truncate">-</div>}
                                                                {isProcurementMode && visibleColumns.duration && <div className="h-full flex items-center justify-end border-l border-gray-300/40 w-[62px] shrink-0 text-right pr-2 text-[10px] text-gray-500 truncate">-</div>}
                                                                {isProcurementMode && visibleColumns.procurementStatus && <div className="h-full flex items-center justify-start border-l border-gray-300/40 w-[96px] shrink-0 text-left pl-2 text-[10px] text-gray-500 truncate">-</div>}
                                                                {visibleColumns.period && <div className="h-full flex items-center justify-start border-l border-gray-300/40 w-[150px] shrink-0 text-[10px] text-gray-600 font-mono text-left pl-2 truncate">
                                                                    {subDateRange ? formatDateRange(subDateRange.start, subDateRange.end) : '-'}
                                                                </div>}
                                                                {visibleColumns.team && (
                                                                    <div
                                                                        className="h-full flex items-center justify-center border-l border-gray-300/40 shrink-0"
                                                                        style={{ width: `${EMPLOYEE_COL_WIDTH}px`, minWidth: `${EMPLOYEE_COL_WIDTH}px` }}
                                                                    />
                                                                )}
                                                                {visibleColumns.progress && <div className="h-full flex items-center justify-start border-l border-gray-300/40 text-xs text-blue-700 font-bold font-mono w-20 shrink-0 pl-2 truncate">{(subSummary.avgProgress || 0).toFixed(0)}%</div>}
                                                            </div>
                                                        </div>

                                                        {/* Styled Timeline Bar for Subcategory */}
                                                        <div
                                                            className="flex-none h-full relative overflow-hidden bg-white border-l border-gray-300/90"
                                                            style={{ width: `${timeline.items.length * config.cellWidth}px`, minWidth: `${timeline.items.length * config.cellWidth}px` }}
                                                        >
                                                            <div className="absolute inset-0 flex pointer-events-none">
                                                                {timeline.items.map((item, idx) => (
                                                                    <div key={idx} className={`flex-shrink-0 box-border h-full
                                                                        ${isFourWeekView && viewMode === 'day'
                                                                            ? `${Math.floor(idx / 7) % 4 === 0 ? 'bg-sky-50' : Math.floor(idx / 7) % 4 === 1 ? 'bg-rose-50' : Math.floor(idx / 7) % 4 === 2 ? 'bg-emerald-50' : 'bg-violet-50'} border-r border-slate-300/35`
                                                                            : viewMode === 'week'
                                                                                ? `border-r border-slate-300 ${idx % 2 === 0 ? 'bg-slate-50/60' : 'bg-white'}`
                                                                                : 'border-r border-dashed border-gray-300/60'}
                                                                        ${viewMode === 'day' && !isFourWeekView ? (item.getDay() === 6 ? 'bg-violet-50/35' : item.getDay() === 0 ? 'bg-red-50/35' : '') : ''}`}
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
                                                </div>
                                            );
                                        }

                                        if (row.type === 'subsubcategory') {
                                            const { category, subcategory: subcat, subsubcategory: subsub, tasks, id: uniqueSubsubId } = row;
                                            // Color reuse from parent subcat logic? 
                                            // Need to resolve color again.
                                            const parentSubcatId = `${category}::${subcat}`;
                                            const parentColor = categoryColors[parentSubcatId] || categoryColors[category] || '#3b82f6';
                                            const subColor = categoryColors[uniqueSubsubId] || parentColor;
                                            const subsubSummary = getCategorySummary(tasks, getTaskWeight);
                                            const subsubDateRange = subsubSummary.dateRange;
                                            const isSubsubCollapsed = collapsedSubcategories.has(uniqueSubsubId);

                                            return (
                                                <div key={row.id}>
                                                    <div
                                                        className="h-8 flex items-center bg-white border-b border-dotted border-gray-100 group hover:bg-slate-50 transition-colors"
                                                        draggable={enabledGroupDragId === uniqueSubsubId}
                                                        onDragStart={(e) => handleSubcategoryDragStart(e, uniqueSubsubId, 'subsubcategory')}
                                                        onDragOver={handleCategoryDragOver}
                                                        onDrop={(e) => rowDragState
                                                            ? handleTaskDropToSubsubcategory(e, category, subcat, subsub)
                                                            : handleSubcategoryDrop(e, uniqueSubsubId)}
                                                        onDragEnd={() => setEnabledGroupDragId(null)}
                                                    >
                                                        <div className="sticky left-0 z-[59] h-full flex items-center border-r border-gray-300 pl-2 bg-white group-hover:bg-slate-50"
                                                            style={{ width: stickyWidth, minWidth: stickyWidth, paddingLeft: 40 }}>
                                                            <button
                                                                type="button"
                                                                className="cursor-grab text-gray-400 hover:text-gray-600 mr-1"
                                                                title="Move Sub-subcategory"
                                                                onMouseDown={(e) => {
                                                                    e.stopPropagation();
                                                                    setEnabledGroupDragId(uniqueSubsubId);
                                                                }}
                                                                onMouseUp={() => setEnabledGroupDragId(null)}
                                                                onTouchStart={(e) => {
                                                                    e.stopPropagation();
                                                                    setEnabledGroupDragId(uniqueSubsubId);
                                                                }}
                                                                onTouchEnd={() => setEnabledGroupDragId(null)}
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M8 6h8v2H8V6zm0 4h8v2H8v-2zm0 4h8v2H8v-2z" /></svg>
                                                            </button>
                                                            <button
                                                                className="w-4 h-4 mr-1 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-sm"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    toggleSubcategory(uniqueSubsubId);
                                                                }}
                                                                title={isSubsubCollapsed ? 'Expand children' : 'Collapse children'}
                                                            >
                                                                {isSubsubCollapsed ? (
                                                                    <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor"><path d="M7 5l6 5-6 5V5z" /></svg>
                                                                ) : (
                                                                    <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor"><path d="M5 7l5 6 5-6H5z" /></svg>
                                                                )}
                                                            </button>

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

                                                            <div className="h-full flex-1 flex items-stretch overflow-hidden">
                                                                <div className="h-full flex-1 flex items-center min-w-0 pr-2">
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

                                                                {visibleColumns.cost && <div className="h-full flex items-center justify-end border-l border-gray-300/40 text-[10px] text-gray-900 font-bold font-mono w-20 shrink-0 pr-2 truncate">{(subsubSummary.totalCost || 0).toLocaleString()}</div>}
                                                                {visibleColumns.weight && <div className="h-full flex items-center justify-end border-l border-gray-300/40 text-[10px] text-gray-900 font-bold font-mono w-16 shrink-0 pr-2 truncate">{(subsubSummary.totalWeight || 0).toFixed(2)}%</div>}
                                                                {visibleColumns.quantity && <div className="h-full flex items-center justify-start border-l border-gray-300/40 w-20 shrink-0 text-left pl-2 truncate"></div>}
                                                                {isProcurementMode && visibleColumns.dueProcurement && <div className="h-full flex items-center justify-start border-l border-gray-300/40 w-[78px] shrink-0 text-left pl-2 text-[10px] text-gray-500 truncate">-</div>}
                                                                {isProcurementMode && visibleColumns.dueMaterialOnSite && <div className="h-full flex items-center justify-start border-l border-gray-300/40 w-[78px] shrink-0 text-left pl-2 text-[10px] text-gray-500 truncate">-</div>}
                                                                {isProcurementMode && visibleColumns.dateOfUse && <div className="h-full flex items-center justify-start border-l border-gray-300/40 w-[78px] shrink-0 text-left pl-2 text-[10px] text-gray-500 truncate">-</div>}
                                                                {isProcurementMode && visibleColumns.duration && <div className="h-full flex items-center justify-end border-l border-gray-300/40 w-[62px] shrink-0 text-right pr-2 text-[10px] text-gray-500 truncate">-</div>}
                                                                {isProcurementMode && visibleColumns.procurementStatus && <div className="h-full flex items-center justify-start border-l border-gray-300/40 w-[96px] shrink-0 text-left pl-2 text-[10px] text-gray-500 truncate">-</div>}
                                                                {visibleColumns.period && <div className="h-full flex items-center justify-start border-l border-gray-300/40 w-[150px] shrink-0 text-[9px] text-gray-500 font-mono text-left pl-2 truncate">
                                                                    {subsubDateRange ? formatDateRange(subsubDateRange.start, subsubDateRange.end) : '-'}
                                                                </div>}
                                                                {visibleColumns.team && (
                                                                    <div
                                                                        className="h-full flex items-center justify-center border-l border-gray-300/40 shrink-0"
                                                                        style={{ width: `${EMPLOYEE_COL_WIDTH}px`, minWidth: `${EMPLOYEE_COL_WIDTH}px` }}
                                                                    />
                                                                )}
                                                                {visibleColumns.progress && <div className="h-full flex items-center justify-start border-l border-gray-300/40 text-[10px] text-blue-700 font-bold font-mono w-20 shrink-0 pl-2 truncate">{(subsubSummary.avgProgress || 0).toFixed(0)}%</div>}
                                                            </div>
                                                        </div>

                                                        {/* Timeline Bar for SubSub */}
                                                        <div
                                                            className="flex-none h-full relative overflow-hidden bg-white border-l border-gray-300/90"
                                                            style={{ width: `${timeline.items.length * config.cellWidth}px`, minWidth: `${timeline.items.length * config.cellWidth}px` }}
                                                        >
                                                            <div className="absolute inset-0 flex pointer-events-none">
                                                                {timeline.items.map((item, idx) => (
                                                                    <div key={idx} className={`flex-shrink-0 box-border h-full
                                                                        ${isFourWeekView && viewMode === 'day'
                                                                            ? `${Math.floor(idx / 7) % 4 === 0 ? 'bg-sky-50' : Math.floor(idx / 7) % 4 === 1 ? 'bg-rose-50' : Math.floor(idx / 7) % 4 === 2 ? 'bg-emerald-50' : 'bg-violet-50'} border-r border-slate-300/35`
                                                                            : viewMode === 'week'
                                                                                ? `border-r border-slate-300 ${idx % 2 === 0 ? 'bg-slate-50/60' : 'bg-white'}`
                                                                                : 'border-r border-dashed border-gray-300/60'}
                                                                        ${viewMode === 'day' && !isFourWeekView ? (item.getDay() === 6 ? 'bg-violet-50/30' : item.getDay() === 0 ? 'bg-red-50/30' : '') : ''}`}
                                                                        style={{ width: config.cellWidth }} />
                                                                ))}
                                                            </div>

                                                            {subsubDateRange && (
                                                                <div
                                                                    className="absolute h-2.5 top-[11px] rounded-full border border-gray-400/20"
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
                                                </div>
                                            );
                                        }

                                        if (row.type === 'task') {
                                            const { task: t, level } = row;
                                            return (
                                                <TaskRow
                                                    key={t.id}
                                                    task={t}
                                                    level={level}
                                                    tasks={optimisticTasks}
                                                    config={config}
                                                    viewMode={viewMode}
                                                    isFourWeekView={isFourWeekView}
                                                    isProcurementMode={isProcurementMode}
                                                    procurementOffsets={procurementOffsets}
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
                                                    employees={employees}
                                                />
                                            );
                                        }
                                        return null;
                                    })}
                                </div>
                            </div>
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
                        {visibleColumns.dueProcurement && <div className="w-[78px] shrink-0" />}
                        {visibleColumns.dueMaterialOnSite && <div className="w-[78px] shrink-0" />}
                        {visibleColumns.dateOfUse && <div className="w-[78px] shrink-0" />}
                        {visibleColumns.duration && <div className="w-[62px] shrink-0" />}
                        {visibleColumns.procurementStatus && <div className="w-[96px] shrink-0" />}
                        {visibleColumns.period && <div className="w-[150px] shrink-0" />}
                        {visibleColumns.team && (
                            <div className="shrink-0" style={{ width: `${EMPLOYEE_COL_WIDTH}px`, minWidth: `${EMPLOYEE_COL_WIDTH}px` }} />
                        )}

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


