'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    addDays,
    differenceInCalendarDays,
    differenceInDays,
    eachDayOfInterval,
    endOfDay,
    format,
    getISOWeek,
    isAfter,
    isBefore,
    parseISO,
    startOfDay
} from 'date-fns';
import { ChevronDown, ChevronRight, FolderKanban, Maximize2, Minimize2 } from 'lucide-react';
import { updateTask, updateProject } from '@/lib/firestore';
import { Project, Task } from '@/types/construction';

interface Procurement4WeekGanttTableProps {
    projects: Project[];
    tasks: Task[];
    windowStart: Date;
    windowEnd: Date;
    onProjectUpdate?: (project: Project) => void;
}

type ProjectSection = {
    project: Project;
    rows: TaskTreeRow[];
    leafTasks: Task[];
    visibleLeafCount: number;
};

type TaskTreeRow = {
    id: string;
    label: string;
    level: number;
    hasChildren: boolean;
    isGroup: boolean;
    descendantLeafCount: number;
    period: string;
    task?: Task;
};

type ProcurementStatusKey = 'to-order' | 'ordered' | 'delivered' | 'ready' | 'in-stock';
type DateEditMode = 'all' | 'item';
type TaskDateField = 'dueProcurementDate' | 'dueMaterialOnSiteDate' | 'dateOfUse';

const BASE_DAY_CELL_WIDTH = 24;
const BASE_LEFT_COL_WIDTH = 520;
const BASE_DUE_COL_WIDTH = 74;
const BASE_ONSITE_COL_WIDTH = 74;
const BASE_USEDATE_COL_WIDTH = 74;
const BASE_STATUS_COL_WIDTH = 100;
const BASE_PERIOD_COL_WIDTH = 160;
const BASE_RIGHT_PANEL_WIDTH =
    BASE_DUE_COL_WIDTH + BASE_ONSITE_COL_WIDTH + BASE_USEDATE_COL_WIDTH + BASE_STATUS_COL_WIDTH + BASE_PERIOD_COL_WIDTH;
const PROJECT_ROW_HEIGHT = 36;
const GROUP_ROW_HEIGHT = 40;
const TASK_ROW_HEIGHT = 44;
const HEADER_WEEK_ROW_HEIGHT = 28;
const HEADER_DAY_ROW_HEIGHT = 24;
const TASK_BAR_HEIGHT = 20;
const TASK_BAR_TOP = Math.floor((TASK_ROW_HEIGHT - TASK_BAR_HEIGHT) / 2);
const MARKER_SIZE = 10;
const MARKER_TOP = TASK_BAR_TOP + Math.floor((TASK_BAR_HEIGHT - MARKER_SIZE) / 2);

const DUE_PROCUREMENT_DAYS = -5;
const DUE_ONSITE_DAYS = -1;
const USE_DATE_DAYS = 0;

const GANTT_COLORS = [
    '#3b82f6', // Blue
    '#ef4444', // Red
    '#22c55e', // Green
    '#eab308', // Yellow
    '#a855f7', // Purple
    '#ec4899', // Pink
    '#f97316', // Orange
    '#6b7280'  // Gray
];

const parseTaskDate = (value?: string) => {
    if (!value) return null;
    try {
        const parsed = parseISO(value);
        return isNaN(parsed.getTime()) ? null : parsed;
    } catch {
        return null;
    }
};

const formatDayMonth = (date: Date) => format(date, 'dd/MM');

const buildPeriod = (start: Date, end: Date) => {
    const duration = Math.max(1, differenceInDays(end, start) + 1);
    return `${formatDayMonth(start)} - ${formatDayMonth(end)} (${duration}d)`;
};

const overlapsWindow = (task: Task, windowStart: Date, windowEnd: Date) => {
    const start = parseTaskDate(task.planStartDate);
    const end = parseTaskDate(task.planEndDate);
    if (!start || !end) return false;
    if (isBefore(endOfDay(end), startOfDay(windowStart))) return false;
    if (isAfter(startOfDay(start), endOfDay(windowEnd))) return false;
    return true;
};

const getBarLayout = (task: Task, windowStart: Date, windowEnd: Date, dayCellWidth: number) => {
    const taskStart = parseTaskDate(task.planStartDate);
    const taskEnd = parseTaskDate(task.planEndDate);
    if (!taskStart || !taskEnd) return null;

    const clampedStart = isBefore(taskStart, windowStart) ? windowStart : taskStart;
    const clampedEnd = isAfter(taskEnd, windowEnd) ? windowEnd : taskEnd;

    const leftDays = Math.max(0, differenceInCalendarDays(startOfDay(clampedStart), startOfDay(windowStart)));
    const spanDays = Math.max(1, differenceInCalendarDays(startOfDay(clampedEnd), startOfDay(clampedStart)) + 1);

    return {
        left: leftDays * dayCellWidth,
        width: Math.max(6, spanDays * dayCellWidth)
    };
};

const normalizeProcStatus = (value?: Task['procurementStatus']): ProcurementStatusKey => {
    if (!value) return 'to-order';
    if (value === 'plan-a' || value === 'plan-b' || value === 'plan-c') return 'ordered';
    if (value === 'actual') return 'ready';
    if (value === 'to-order' || value === 'ordered' || value === 'delivered' || value === 'ready' || value === 'in-stock') return value;
    return 'to-order';
};

const getStatusClass = (key: ProcurementStatusKey) => {
    if (key === 'in-stock') return 'text-slate-700 bg-slate-100 border-slate-300';
    if (key === 'ready') return 'text-emerald-700 bg-emerald-50 border-emerald-200';
    if (key === 'delivered') return 'text-indigo-700 bg-indigo-50 border-indigo-200';
    if (key === 'ordered') return 'text-cyan-700 bg-cyan-50 border-cyan-200';
    return 'text-amber-700 bg-amber-50 border-amber-200';
};

const deriveTaskStatus = (task: Task, override?: ProcurementStatusKey): ProcurementStatusKey => {
    if (override) return override;
    if (task.procurementStatus) return normalizeProcStatus(task.procurementStatus);
    if (task.status === 'completed') return 'ready';
    if (task.status === 'in-progress') return 'ordered';
    return 'to-order';
};

const getMarkerLeft = (date: Date | null, windowStart: Date, windowEnd: Date, dayCellWidth: number) => {
    if (!date) return null;
    if (isBefore(endOfDay(date), startOfDay(windowStart))) return null;
    if (isAfter(startOfDay(date), endOfDay(windowEnd))) return null;
    const dayIndex = differenceInCalendarDays(startOfDay(date), startOfDay(windowStart));
    return dayIndex * dayCellWidth + dayCellWidth / 2;
};

export default function Procurement4WeekGanttTable({
    projects,
    tasks,
    windowStart,
    windowEnd,
    onProjectUpdate
}: Procurement4WeekGanttTableProps) {
    const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());
    const [collapsedTaskGroups, setCollapsedTaskGroups] = useState<Set<string>>(new Set());
    const [statusOverrides, setStatusOverrides] = useState<Record<string, ProcurementStatusKey>>({});
    const [savingTaskIds, setSavingTaskIds] = useState<Set<string>>(new Set());
    const [dateOverrides, setDateOverrides] = useState<Record<string, Partial<Pick<Task, TaskDateField>>>>({});
    const [savingDateTaskIds, setSavingDateTaskIds] = useState<Set<string>>(new Set());
    const [activeColorProjectId, setActiveColorProjectId] = useState<string | null>(null);
    const [isApplyingAllDates, setIsApplyingAllDates] = useState(false);
    const [showAllTasks, setShowAllTasks] = useState(false);
    const [dateEditMode, setDateEditMode] = useState<DateEditMode>('all');
    const [isExpanded, setIsExpanded] = useState(false);
    const tableContainerRef = useRef<HTMLDivElement | null>(null);
    const [tableContainerWidth, setTableContainerWidth] = useState(0);
    const [globalOffsets, setGlobalOffsets] = useState({
        dueProcurementDays: DUE_PROCUREMENT_DAYS,
        dueMaterialOnSiteDays: DUE_ONSITE_DAYS,
        dateOfUseDays: USE_DATE_DAYS
    });

    const days = useMemo(() => eachDayOfInterval({ start: windowStart, end: windowEnd }), [windowStart, windowEnd]);
    const baseTimelineWidth = days.length * BASE_DAY_CELL_WIDTH;
    const baseTotalWidth = BASE_LEFT_COL_WIDTH + baseTimelineWidth + BASE_RIGHT_PANEL_WIDTH;
    const widthScale = tableContainerWidth > 0 ? (tableContainerWidth / baseTotalWidth) : 1;

    const dayCellWidth = BASE_DAY_CELL_WIDTH * widthScale;
    const leftColWidth = BASE_LEFT_COL_WIDTH * widthScale;
    const dueColWidth = BASE_DUE_COL_WIDTH * widthScale;
    const onSiteColWidth = BASE_ONSITE_COL_WIDTH * widthScale;
    const useDateColWidth = BASE_USEDATE_COL_WIDTH * widthScale;
    const statusColWidth = BASE_STATUS_COL_WIDTH * widthScale;
    const periodColWidth = BASE_PERIOD_COL_WIDTH * widthScale;
    const rightPanelWidth = dueColWidth + onSiteColWidth + useDateColWidth + statusColWidth + periodColWidth;
    const timelineWidth = days.length * dayCellWidth;
    const tableWidth = leftColWidth + timelineWidth + rightPanelWidth;
    const rightColumnGridStyle = useMemo<React.CSSProperties>(() => ({
        gridTemplateColumns: `${dueColWidth}px ${onSiteColWidth}px ${useDateColWidth}px ${statusColWidth}px ${periodColWidth}px`
    }), [dueColWidth, onSiteColWidth, useDateColWidth, statusColWidth, periodColWidth]);

    useEffect(() => {
        const element = tableContainerRef.current;
        if (!element) return;

        const updateWidth = () => {
            setTableContainerWidth(element.clientWidth);
        };

        updateWidth();
        const observer = new ResizeObserver(updateWidth);
        observer.observe(element);

        return () => {
            observer.disconnect();
        };
    }, []);

    useEffect(() => {
        if (!isExpanded) return;
        const prevOverflow = document.body.style.overflow;
        document.body.classList.add('gantt-fullscreen');
        document.body.style.overflow = 'hidden';

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setIsExpanded(false);
        };
        window.addEventListener('keydown', onKeyDown);

        return () => {
            document.body.style.overflow = prevOverflow;
            document.body.classList.remove('gantt-fullscreen');
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [isExpanded]);

    const todayLineLeft = useMemo(() => {
        const today = startOfDay(new Date());
        if (isBefore(today, startOfDay(windowStart))) return null;
        if (isAfter(today, endOfDay(windowEnd))) return null;
        const dayOffset = differenceInCalendarDays(today, startOfDay(windowStart));
        return dayOffset * dayCellWidth + dayCellWidth / 2;
    }, [windowStart, windowEnd, dayCellWidth]);

    const weekSegments = useMemo(() => {
        const segments: Array<{ label: string; span: number }> = [];
        for (let i = 0; i < days.length; i += 7) {
            const weekStart = days[i];
            const weekEnd = addDays(weekStart, Math.min(6, days.length - i - 1));
            const span = Math.min(7, days.length - i);
            segments.push({
                label: `W${getISOWeek(weekStart)} (${format(weekStart, 'dd/MM')} - ${format(weekEnd, 'dd/MM')})`,
                span
            });
        }
        return segments;
    }, [days]);

    const getOffsetForField = (field: TaskDateField) => {
        if (field === 'dueProcurementDate') return globalOffsets.dueProcurementDays;
        if (field === 'dueMaterialOnSiteDate') return globalOffsets.dueMaterialOnSiteDays;
        return globalOffsets.dateOfUseDays;
    };

    const getEffectiveTaskDate = (task: Task, field: TaskDateField) => {
        const overrideValue = dateOverrides[task.id]?.[field];
        const taskValue = overrideValue !== undefined ? overrideValue : task[field];
        const parsedTaskValue = parseTaskDate(taskValue);
        if (parsedTaskValue) return parsedTaskValue;

        const start = parseTaskDate(task.planStartDate);
        if (!start) return null;

        const offset = dateEditMode === 'all'
            ? getOffsetForField(field)
            : field === 'dueProcurementDate'
                ? DUE_PROCUREMENT_DAYS
                : field === 'dueMaterialOnSiteDate'
                    ? DUE_ONSITE_DAYS
                    : USE_DATE_DAYS;
        return addDays(start, offset);
    };

    const getTaskDateInfo = (task: Task) => {
        const dueProcDate = getEffectiveTaskDate(task, 'dueProcurementDate');
        const onSiteDate = getEffectiveTaskDate(task, 'dueMaterialOnSiteDate');
        const useDateDate = getEffectiveTaskDate(task, 'dateOfUse');

        const start = parseTaskDate(task.planStartDate);
        const end = parseTaskDate(task.planEndDate);
        return {
            dueProc: dueProcDate ? formatDayMonth(dueProcDate) : '-',
            onSite: onSiteDate ? formatDayMonth(onSiteDate) : '-',
            useDate: useDateDate ? formatDayMonth(useDateDate) : '-',
            period: start && end ? buildPeriod(start, end) : '-',
            dueProcDate,
            onSiteDate,
            useDateDate
        };
    };

    const taskSort = (a: Task, b: Task) => {
        const orderDiff = (a.order || 0) - (b.order || 0);
        if (orderDiff !== 0) return orderDiff;
        if (a.planStartDate !== b.planStartDate) return a.planStartDate.localeCompare(b.planStartDate);
        return a.name.localeCompare(b.name);
    };

    const treeData = useMemo(() => {
        let hiddenInStockCount = 0;
        let totalInWindowCount = 0;
        let totalVisibleCount = 0;
        const sections: ProjectSection[] = [];

        for (const project of projects) {
            const projectTasks = tasks
                .filter((task) => task.projectId === project.id)
                .sort(taskSort);

            if (projectTasks.length === 0) continue;
            const inWindowLeafTasks = projectTasks
                .filter((task) => task.type !== 'group')
                .filter((task) => overlapsWindow(task, windowStart, windowEnd));

            if (inWindowLeafTasks.length === 0) continue;
            totalInWindowCount += inWindowLeafTasks.length;

            const visibleLeafTasks = inWindowLeafTasks.filter((task) => {
                const status = deriveTaskStatus(task, statusOverrides[task.id]);
                const shouldHide = !showAllTasks && status === 'in-stock';
                if (shouldHide) hiddenInStockCount += 1;
                return !shouldHide;
            });

            if (visibleLeafTasks.length === 0) continue;
            totalVisibleCount += visibleLeafTasks.length;

            const buildTaskPeriod = (items: Task[]) => {
                const starts = items.map((item) => parseTaskDate(item.planStartDate)).filter(Boolean) as Date[];
                const ends = items.map((item) => parseTaskDate(item.planEndDate)).filter(Boolean) as Date[];
                if (starts.length === 0 || ends.length === 0) return '-';
                return buildPeriod(
                    new Date(Math.min(...starts.map((d) => d.getTime()))),
                    new Date(Math.max(...ends.map((d) => d.getTime())))
                );
            };

            const rows: TaskTreeRow[] = [];
            const categoryMap = new Map<string, Task[]>();
            for (const task of visibleLeafTasks) {
                const key = task.category?.trim() || 'General';
                const existing = categoryMap.get(key) ?? [];
                existing.push(task);
                categoryMap.set(key, existing);
            }

            for (const [categoryLabel, categoryTasks] of categoryMap.entries()) {
                const categoryId = `cat:${project.id}:${categoryLabel}`;
                const categoryCollapsed = collapsedTaskGroups.has(categoryId);
                rows.push({
                    id: categoryId,
                    label: categoryLabel,
                    level: 0,
                    hasChildren: true,
                    isGroup: true,
                    descendantLeafCount: categoryTasks.length,
                    period: buildTaskPeriod(categoryTasks)
                });
                if (categoryCollapsed) continue;

                const subcategoryMap = new Map<string, Task[]>();
                for (const task of categoryTasks) {
                    const key = task.subcategory?.trim() || 'General';
                    const existing = subcategoryMap.get(key) ?? [];
                    existing.push(task);
                    subcategoryMap.set(key, existing);
                }

                for (const [subcategoryLabel, subcategoryTasks] of subcategoryMap.entries()) {
                    const subcategoryId = `sub:${project.id}:${categoryLabel}:${subcategoryLabel}`;
                    const subcategoryCollapsed = collapsedTaskGroups.has(subcategoryId);
                    rows.push({
                        id: subcategoryId,
                        label: subcategoryLabel,
                        level: 1,
                        hasChildren: true,
                        isGroup: true,
                        descendantLeafCount: subcategoryTasks.length,
                        period: buildTaskPeriod(subcategoryTasks)
                    });
                    if (subcategoryCollapsed) continue;

                    const subsubcategoryMap = new Map<string, Task[]>();
                    for (const task of subcategoryTasks) {
                        const key = task.subsubcategory?.trim() || '__leaf__';
                        const existing = subsubcategoryMap.get(key) ?? [];
                        existing.push(task);
                        subsubcategoryMap.set(key, existing);
                    }

                    for (const [subsubcategoryLabel, leafTasks] of subsubcategoryMap.entries()) {
                        const hasSubsubcategory = subsubcategoryLabel !== '__leaf__';
                        if (hasSubsubcategory) {
                            const subsubcategoryId = `sub2:${project.id}:${categoryLabel}:${subcategoryLabel}:${subsubcategoryLabel}`;
                            const subsubcategoryCollapsed = collapsedTaskGroups.has(subsubcategoryId);
                            rows.push({
                                id: subsubcategoryId,
                                label: subsubcategoryLabel,
                                level: 2,
                                hasChildren: true,
                                isGroup: true,
                                descendantLeafCount: leafTasks.length,
                                period: buildTaskPeriod(leafTasks)
                            });
                            if (subsubcategoryCollapsed) continue;
                        }

                        for (const task of leafTasks) {
                            const taskStart = parseTaskDate(task.planStartDate);
                            const taskEnd = parseTaskDate(task.planEndDate);
                            rows.push({
                                id: `task:${task.id}`,
                                label: task.name,
                                level: hasSubsubcategory ? 3 : 2,
                                hasChildren: false,
                                isGroup: false,
                                descendantLeafCount: 0,
                                period: taskStart && taskEnd ? buildPeriod(taskStart, taskEnd) : '-',
                                task
                            });
                        }
                    }
                }
            }

            sections.push({
                project,
                rows,
                leafTasks: visibleLeafTasks,
                visibleLeafCount: visibleLeafTasks.length
            });
        }

        return {
            sections,
            hiddenInStockCount,
            totalInWindowCount,
            totalVisibleCount
        };
    }, [projects, tasks, windowStart, windowEnd, statusOverrides, showAllTasks, collapsedTaskGroups]);

    const toggleProject = (projectId: string) => {
        setCollapsedProjects((prev) => {
            const next = new Set(prev);
            if (next.has(projectId)) next.delete(projectId);
            else next.add(projectId);
            return next;
        });
    };

    const toggleTaskGroup = (taskId: string) => {
        setCollapsedTaskGroups((prev) => {
            const next = new Set(prev);
            if (next.has(taskId)) next.delete(taskId);
            else next.add(taskId);
            return next;
        });
    };

    const getTaskStatus = (task: Task): ProcurementStatusKey => {
        return deriveTaskStatus(task, statusOverrides[task.id]);
    };

    const handleStatusChange = async (task: Task, nextStatus: ProcurementStatusKey) => {
        const previous = getTaskStatus(task);
        setStatusOverrides((prev) => ({ ...prev, [task.id]: nextStatus }));
        setSavingTaskIds((prev) => {
            const next = new Set(prev);
            next.add(task.id);
            return next;
        });

        try {
            await updateTask(task.id, { procurementStatus: nextStatus });
        } catch (error) {
            console.error('Failed to update procurement status:', error);
            setStatusOverrides((prev) => ({ ...prev, [task.id]: previous }));
        } finally {
            setSavingTaskIds((prev) => {
                const next = new Set(prev);
                next.delete(task.id);
                return next;
            });
        }
    };

    const visibleLeafTasks = useMemo(
        () => treeData.sections.flatMap((section) => section.leafTasks),
        [treeData.sections]
    );

    const toInputDate = (date: Date | null) => (date ? format(date, 'yyyy-MM-dd') : '');

    const handleTaskDateChange = async (task: Task, field: TaskDateField, nextValue: string) => {
        const previousOverride = dateOverrides[task.id]?.[field];
        setDateOverrides((prev) => ({
            ...prev,
            [task.id]: {
                ...prev[task.id],
                [field]: nextValue
            }
        }));
        setSavingDateTaskIds((prev) => {
            const next = new Set(prev);
            next.add(task.id);
            return next;
        });

        try {
            await updateTask(task.id, { [field]: nextValue } as Partial<Task>);
        } catch (error) {
            console.error('Failed to update procurement date:', error);
            setDateOverrides((prev) => ({
                ...prev,
                [task.id]: {
                    ...prev[task.id],
                    [field]: previousOverride
                }
            }));
        } finally {
            setSavingDateTaskIds((prev) => {
                const next = new Set(prev);
                next.delete(task.id);
                return next;
            });
        }
    };

    const handleApplyAllDates = async () => {
        setIsApplyingAllDates(true);
        const successOverrides: Record<string, Partial<Pick<Task, TaskDateField>>> = {};

        try {
            const results = await Promise.all(
                visibleLeafTasks.map(async (task) => {
                    const start = parseTaskDate(task.planStartDate);
                    if (!start) return { taskId: task.id, ok: false as const };

                    const payload: Partial<Pick<Task, TaskDateField>> = {
                        dueProcurementDate: format(addDays(start, globalOffsets.dueProcurementDays), 'yyyy-MM-dd'),
                        dueMaterialOnSiteDate: format(addDays(start, globalOffsets.dueMaterialOnSiteDays), 'yyyy-MM-dd'),
                        dateOfUse: format(addDays(start, globalOffsets.dateOfUseDays), 'yyyy-MM-dd')
                    };

                    try {
                        await updateTask(task.id, payload);
                        return { taskId: task.id, ok: true as const, payload };
                    } catch {
                        return { taskId: task.id, ok: false as const };
                    }
                })
            );

            for (const result of results) {
                if (result.ok) {
                    successOverrides[result.taskId] = result.payload;
                }
            }

            setDateOverrides((prev) => ({ ...prev, ...successOverrides }));
        } finally {
            setIsApplyingAllDates(false);
        }
    };

    if (treeData.totalInWindowCount === 0) {
        return (
            <div className="bg-white rounded border border-gray-300 p-12 text-center">
                <FolderKanban className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">No tasks found in the selected 4-week window.</p>
            </div>
        );
    }

    return (
        <div
            className={`relative bg-white border border-gray-300 rounded w-full min-w-0 max-w-full ${isExpanded
                ? 'fixed inset-0 z-[1200] h-screen w-screen rounded-none border-0 shadow-none overflow-auto'
                : 'overflow-hidden'
                }`}
        >
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-gray-200 bg-gray-50">
                <p className="text-xs text-gray-600">
                    {!showAllTasks && treeData.hiddenInStockCount > 0
                        ? `Hidden ${treeData.hiddenInStockCount} item(s) with status In Stock`
                        : `Showing ${treeData.totalVisibleCount} item(s)`}
                </p>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setIsExpanded((prev) => !prev)}
                        title={isExpanded ? 'Exit full screen' : 'Full screen'}
                        className="h-7 px-2.5 text-xs font-semibold rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 inline-flex items-center gap-1.5"
                    >
                        {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                        {isExpanded ? 'Exit' : 'Full Screen'}
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowAllTasks((prev) => !prev)}
                        className="px-3 py-1.5 text-xs font-semibold rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
                    >
                        {showAllTasks ? 'Hide In Stock' : 'Show All'}
                    </button>
                </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-gray-200 bg-white">
                <span className="text-xs font-semibold text-gray-600">Date Mode</span>
                <button
                    type="button"
                    onClick={() => setDateEditMode('all')}
                    className={`px-2.5 py-1 text-xs rounded border ${dateEditMode === 'all'
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                        }`}
                >
                    Apply All
                </button>
                <button
                    type="button"
                    onClick={() => setDateEditMode('item')}
                    className={`px-2.5 py-1 text-xs rounded border ${dateEditMode === 'item'
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                        }`}
                >
                    Edit Per Item
                </button>

                {dateEditMode === 'all' && (
                    <>
                        <label className="text-[11px] text-gray-600 ml-2">Due</label>
                        <input
                            type="number"
                            value={globalOffsets.dueProcurementDays}
                            onChange={(event) => setGlobalOffsets((prev) => ({
                                ...prev,
                                dueProcurementDays: Number(event.target.value) || 0
                            }))}
                            className="w-14 h-7 text-xs border border-gray-300 rounded px-1"
                        />
                        <label className="text-[11px] text-gray-600">On Site</label>
                        <input
                            type="number"
                            value={globalOffsets.dueMaterialOnSiteDays}
                            onChange={(event) => setGlobalOffsets((prev) => ({
                                ...prev,
                                dueMaterialOnSiteDays: Number(event.target.value) || 0
                            }))}
                            className="w-14 h-7 text-xs border border-gray-300 rounded px-1"
                        />
                        <label className="text-[11px] text-gray-600">Use</label>
                        <input
                            type="number"
                            value={globalOffsets.dateOfUseDays}
                            onChange={(event) => setGlobalOffsets((prev) => ({
                                ...prev,
                                dateOfUseDays: Number(event.target.value) || 0
                            }))}
                            className="w-14 h-7 text-xs border border-gray-300 rounded px-1"
                        />
                        <button
                            type="button"
                            onClick={handleApplyAllDates}
                            disabled={isApplyingAllDates || visibleLeafTasks.length === 0}
                            className="ml-2 px-3 py-1.5 text-xs font-semibold rounded border border-blue-600 bg-blue-600 text-white disabled:opacity-60"
                        >
                            {isApplyingAllDates ? 'Applying...' : 'Apply To All'}
                        </button>
                    </>
                )}
            </div>

            {treeData.sections.length === 0 ? (
                <div className="p-12 text-center">
                    <FolderKanban className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-600 text-sm">All items in this 4-week window are marked as In Stock.</p>
                    <p className="text-gray-500 text-xs mt-1">Use Show All to display them.</p>
                </div>
            ) : (
                <div ref={tableContainerRef} className="w-full min-w-0 max-w-full overflow-x-auto overflow-y-hidden">
                    <div style={{ width: `${tableWidth}px`, minWidth: `${tableWidth}px` }}>
                        <div className="flex border-b border-slate-300 bg-slate-100">
                            <div
                                className="shrink-0 border-r border-slate-300 px-3 py-2 text-[11px] font-semibold text-slate-700 tracking-wide"
                                style={{ width: `${leftColWidth}px` }}
                            >
                                Project / Task
                            </div>

                            <div className="min-w-0 border-r border-slate-300 relative" style={{ width: `${timelineWidth}px` }}>
                                <div className="flex border-b border-slate-300" style={{ height: `${HEADER_WEEK_ROW_HEIGHT}px` }}>
                                    {weekSegments.map((segment) => (
                                        <div
                                            key={segment.label}
                                            className="text-[11px] font-semibold text-slate-700 border-r border-slate-300 px-2 h-full flex items-center"
                                            style={{ width: `${segment.span * dayCellWidth}px` }}
                                        >
                                            {segment.label}
                                        </div>
                                    ))}
                                </div>
                                <div className="flex" style={{ height: `${HEADER_DAY_ROW_HEIGHT}px` }}>
                                    {days.map((day) => (
                                        <div
                                            key={day.toISOString()}
                                            className="text-[10px] text-slate-500 border-r border-slate-200 h-full flex items-center justify-center"
                                            style={{ width: `${dayCellWidth}px` }}
                                        >
                                            {format(day, 'dd')}
                                        </div>
                                    ))}
                                </div>
                                {todayLineLeft !== null && (
                                    <div
                                        className="absolute z-30 pointer-events-none -translate-x-1/2"
                                        style={{ left: `${todayLineLeft}px`, top: `${HEADER_WEEK_ROW_HEIGHT}px`, bottom: 0 }}
                                    >
                                        <div className="h-full w-[2px] bg-rose-600 shadow-[0_0_0_1px_rgba(255,255,255,0.35)]" />
                                    </div>
                                )}
                            </div>

                            <div className="shrink-0 grid bg-slate-100" style={{ ...rightColumnGridStyle, width: `${rightPanelWidth}px` }}>
                                <div className="px-2 py-2 text-[11px] font-semibold text-slate-700 border-r border-slate-300 text-center">Due Proc.</div>
                                <div className="px-2 py-2 text-[11px] font-semibold text-slate-700 border-r border-slate-300 text-center">On Site</div>
                                <div className="px-2 py-2 text-[11px] font-semibold text-slate-700 border-r border-slate-300 text-center">Use Date</div>
                                <div className="px-2 py-2 text-[11px] font-semibold text-slate-700 border-r border-slate-300 text-center">Proc. Status</div>
                                <div className="px-2 py-2 text-[11px] font-semibold text-slate-700 text-left">Period</div>
                            </div>
                        </div>
                        {treeData.sections.map(({ project, rows, leafTasks, visibleLeafCount }) => {
                            const isCollapsed = collapsedProjects.has(project.id);
                            const projectStarts = leafTasks.map((task) => parseTaskDate(task.planStartDate)).filter(Boolean) as Date[];
                            const projectEnds = leafTasks.map((task) => parseTaskDate(task.planEndDate)).filter(Boolean) as Date[];
                            const periodText = projectStarts.length > 0 && projectEnds.length > 0
                                ? buildPeriod(
                                    new Date(Math.min(...projectStarts.map((d) => d.getTime()))),
                                    new Date(Math.max(...projectEnds.map((d) => d.getTime())))
                                )
                                : '-';

                            const handleProjectColorChange = async (newColor: string) => {
                                if (onProjectUpdate) {
                                    onProjectUpdate({ ...project, color: newColor });
                                }
                                setActiveColorProjectId(null);
                                try {
                                    await updateProject(project.id, { color: newColor });
                                } catch (error) {
                                    console.error('Failed to update project color', error);
                                }
                            };

                            return (
                                <React.Fragment key={project.id}>
                                    <div className="flex border-b border-gray-200 bg-slate-50 relative">
                                        <div
                                            className="shrink-0 border-r border-gray-300 px-4 h-full flex items-center"
                                            style={{ width: `${leftColWidth}px`, height: `${PROJECT_ROW_HEIGHT}px` }}
                                        >
                                            <button
                                                type="button"
                                                className="inline-flex items-center gap-2 text-xs font-semibold text-gray-900 hover:text-blue-700"
                                                onClick={() => toggleProject(project.id)}
                                                draggable={false}
                                            >
                                                <span className="text-gray-300 text-xs">::</span>
                                                {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}

                                                <div
                                                    className="relative h-3 w-3 rounded-full overflow-hidden shadow-sm shrink-0 hover:scale-110 transition-transform cursor-pointer border border-gray-200"
                                                    style={{ backgroundColor: project.color || '#3b82f6' }}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setActiveColorProjectId(activeColorProjectId === project.id ? null : project.id);
                                                    }}
                                                />
                                                {activeColorProjectId === project.id && (
                                                    <>
                                                        <div
                                                            className="fixed inset-0 z-[90]"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setActiveColorProjectId(null);
                                                            }}
                                                        />
                                                        <div
                                                            className="absolute z-[100] top-8 left-12 bg-white rounded-lg shadow-xl border border-gray-200 p-2 w-32 grid grid-cols-4 gap-1"
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            {GANTT_COLORS.map(color => (
                                                                <div
                                                                    key={color}
                                                                    className="w-6 h-6 rounded-full cursor-pointer hover:scale-110 transition-transform border border-gray-100"
                                                                    style={{ backgroundColor: color }}
                                                                    onClick={() => handleProjectColorChange(color)}
                                                                />
                                                            ))}
                                                        </div>
                                                    </>
                                                )}

                                                <span>{project.name}</span>
                                                <span className="text-[9px] text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded">{visibleLeafCount}</span>
                                            </button>
                                        </div>

                                        <div className="relative border-r border-gray-200" style={{ width: `${timelineWidth}px`, height: `${PROJECT_ROW_HEIGHT}px` }}>
                                            <div className="absolute inset-0 flex">
                                                {days.map((day) => (
                                                    <div
                                                        key={`${project.id}-${day.toISOString()}`}
                                                        className="border-r border-gray-200"
                                                        style={{ width: `${dayCellWidth}px` }}
                                                    />
                                                ))}
                                            </div>
                                            {todayLineLeft !== null && (
                                                <div
                                                    className="absolute inset-y-0 z-30 pointer-events-none -translate-x-1/2"
                                                    style={{ left: `${todayLineLeft}px` }}
                                                >
                                                    <div className="h-full w-[2px] bg-rose-600 shadow-[0_0_0_1px_rgba(255,255,255,0.35)]" />
                                                </div>
                                            )}
                                        </div>

                                        <div
                                            className="shrink-0 grid text-xs bg-slate-50"
                                            style={{ ...rightColumnGridStyle, width: `${rightPanelWidth}px`, height: `${PROJECT_ROW_HEIGHT}px` }}
                                        >
                                            <div className="px-2 border-r border-gray-200 text-gray-500 flex items-center">-</div>
                                            <div className="px-2 border-r border-gray-200 text-gray-500 flex items-center">-</div>
                                            <div className="px-2 border-r border-gray-200 text-gray-500 flex items-center">-</div>
                                            <div className="px-2 border-r border-gray-200 text-gray-500 flex items-center">-</div>
                                            <div className="px-2 text-gray-700 font-semibold flex items-center">{periodText}</div>
                                        </div>
                                    </div>

                                    {
                                        !isCollapsed && rows.map((row) => {
                                            const isTaskGroupCollapsed = collapsedTaskGroups.has(row.id);

                                            if (row.isGroup) {
                                                return (
                                                    <div key={row.id} className="flex border-b border-gray-100 bg-white" style={{ height: `${GROUP_ROW_HEIGHT}px` }}>
                                                        <div
                                                            className="shrink-0 border-r border-gray-200 px-3 text-xs h-full flex items-center"
                                                            style={{ width: `${leftColWidth}px` }}
                                                        >
                                                            <div
                                                                className="flex items-center min-w-0"
                                                                style={{ paddingLeft: `${8 + row.level * 18}px` }}
                                                            >
                                                                <span className="text-gray-300 text-[10px] shrink-0 mr-1">::</span>
                                                                {row.hasChildren ? (
                                                                    <button
                                                                        type="button"
                                                                        className="w-4 h-4 inline-flex items-center justify-center text-gray-500 hover:text-blue-600 shrink-0 mr-1"
                                                                        onClick={() => toggleTaskGroup(row.id)}
                                                                        draggable={false}
                                                                    >
                                                                        {isTaskGroupCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                                                    </button>
                                                                ) : (
                                                                    <span className="w-4 shrink-0 mr-1" />
                                                                )}
                                                                <span
                                                                    className={`truncate text-[11px] ${row.level === 2 ? 'font-semibold italic' : 'font-semibold'}`}
                                                                    style={{ color: project.color || '#1d4ed8' }}
                                                                >
                                                                    {row.label}
                                                                </span>
                                                                {row.descendantLeafCount > 0 && (
                                                                    <span className="ml-2 text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                                                                        {row.descendantLeafCount}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>

                                                        <div className="relative border-r border-gray-100 bg-gray-50/50" style={{ width: `${timelineWidth}px`, height: `${GROUP_ROW_HEIGHT}px` }}>
                                                            <div className="absolute inset-0 flex">
                                                                {days.map((day) => (
                                                                    <div
                                                                        key={`${row.id}-${day.toISOString()}`}
                                                                        className="border-r border-gray-100"
                                                                        style={{ width: `${dayCellWidth}px` }}
                                                                    />
                                                                ))}
                                                            </div>
                                                            {todayLineLeft !== null && (
                                                                <div
                                                                    className="absolute inset-y-0 z-30 pointer-events-none -translate-x-1/2"
                                                                    style={{ left: `${todayLineLeft}px` }}
                                                                >
                                                                    <div className="h-full w-[2px] bg-rose-600 shadow-[0_0_0_1px_rgba(255,255,255,0.35)]" />
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div
                                                            className="shrink-0 grid text-xs bg-white"
                                                            style={{ ...rightColumnGridStyle, width: `${rightPanelWidth}px`, height: `${GROUP_ROW_HEIGHT}px` }}
                                                        >
                                                            <div className="px-2 border-r border-gray-100 text-gray-500 flex items-center">-</div>
                                                            <div className="px-2 border-r border-gray-100 text-gray-500 flex items-center">-</div>
                                                            <div className="px-2 border-r border-gray-100 text-gray-500 flex items-center">-</div>
                                                            <div className="px-2 border-r border-gray-100 text-gray-500 flex items-center">-</div>
                                                            <div className="px-2 text-gray-700 flex items-center">{row.period}</div>
                                                        </div>
                                                    </div>
                                                );
                                            }

                                            const task = row.task;
                                            if (!task) return null;

                                            const bar = getBarLayout(task, windowStart, windowEnd, dayCellWidth);
                                            if (!bar) return null;

                                            const dateInfo = getTaskDateInfo(task);
                                            const milestoneDates = {
                                                dueProc: dateInfo.dueProcDate,
                                                onSite: dateInfo.onSiteDate
                                            };
                                            const dueProcLeft = getMarkerLeft(milestoneDates.dueProc, windowStart, windowEnd, dayCellWidth);
                                            const onSiteLeft = getMarkerLeft(milestoneDates.onSite, windowStart, windowEnd, dayCellWidth);
                                            const status = getTaskStatus(task);
                                            const isSaving = savingTaskIds.has(task.id);
                                            const isSavingDate = savingDateTaskIds.has(task.id);

                                            return (
                                                <div key={task.id} className="flex border-b border-gray-100 hover:bg-gray-50/50" style={{ height: `${TASK_ROW_HEIGHT}px` }}>
                                                    <div
                                                        className="shrink-0 border-r border-gray-200 px-3 text-xs h-full flex items-center"
                                                        style={{ width: `${leftColWidth}px` }}
                                                    >
                                                        <div
                                                            className="flex items-center min-w-0"
                                                            style={{ paddingLeft: `${8 + row.level * 18}px` }}
                                                        >
                                                            <span className="text-gray-300 text-[10px] shrink-0 mr-1">::</span>
                                                            <span className="w-4 shrink-0 mr-1" />
                                                            <span className="h-2.5 w-2.5 rounded-full bg-slate-300 shrink-0 mr-2" />
                                                            <span className="text-[11px] font-medium text-gray-800 truncate">{task.name}</span>
                                                        </div>
                                                    </div>

                                                    <div className="relative border-r border-gray-100" style={{ width: `${timelineWidth}px`, height: `${TASK_ROW_HEIGHT}px` }}>
                                                        <div className="absolute inset-0 flex">
                                                            {days.map((day) => (
                                                                <div
                                                                    key={`${task.id}-${day.toISOString()}`}
                                                                    className="border-r border-gray-100"
                                                                    style={{ width: `${dayCellWidth}px` }}
                                                                />
                                                            ))}
                                                        </div>
                                                        {todayLineLeft !== null && (
                                                            <div
                                                                className="absolute inset-y-0 z-30 pointer-events-none -translate-x-1/2"
                                                                style={{ left: `${todayLineLeft}px` }}
                                                            >
                                                                <div className="h-full w-[2px] bg-rose-600 shadow-[0_0_0_1px_rgba(255,255,255,0.35)]" />
                                                            </div>
                                                        )}
                                                        <div
                                                            className="absolute rounded border"
                                                            style={{
                                                                left: `${bar.left}px`,
                                                                width: `${bar.width}px`,
                                                                top: `${TASK_BAR_TOP}px`,
                                                                height: `${TASK_BAR_HEIGHT}px`,
                                                                backgroundColor: project.color || '#3b82f6',
                                                                borderColor: project.color || '#2563eb'
                                                            }}
                                                            title={`${task.name} (${task.planStartDate} - ${task.planEndDate})`}
                                                        >
                                                            <div
                                                                className="h-full rounded bg-white/30"
                                                                style={{ width: `${Math.max(0, Math.min(100, task.progress || 0))}%` }}
                                                            />
                                                        </div>

                                                        {dueProcLeft !== null && (
                                                            <div
                                                                className="absolute -translate-x-1/2"
                                                                style={{ left: `${dueProcLeft}px`, top: `${MARKER_TOP}px` }}
                                                                title={`Due Proc.: ${format(milestoneDates.dueProc as Date, 'dd/MM/yyyy')}`}
                                                            >
                                                                <div
                                                                    className="rounded-full bg-red-500 border border-white shadow-sm"
                                                                    style={{ width: `${MARKER_SIZE}px`, height: `${MARKER_SIZE}px` }}
                                                                />
                                                            </div>
                                                        )}

                                                        {onSiteLeft !== null && (
                                                            <div
                                                                className="absolute -translate-x-1/2"
                                                                style={{ left: `${onSiteLeft}px`, top: `${MARKER_TOP}px` }}
                                                                title={`On Site: ${format(milestoneDates.onSite as Date, 'dd/MM/yyyy')}`}
                                                            >
                                                                <div
                                                                    className="rounded-full bg-amber-500 border border-white shadow-sm"
                                                                    style={{ width: `${MARKER_SIZE}px`, height: `${MARKER_SIZE}px` }}
                                                                />
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div
                                                        className="shrink-0 grid text-xs"
                                                        style={{ ...rightColumnGridStyle, width: `${rightPanelWidth}px`, height: `${TASK_ROW_HEIGHT}px` }}
                                                    >
                                                        <div className="px-2 border-r border-gray-100 text-gray-700 flex items-center">
                                                            {dateEditMode === 'item' ? (
                                                                <input
                                                                    type="date"
                                                                    value={toInputDate(dateInfo.dueProcDate)}
                                                                    onChange={(event) => handleTaskDateChange(task, 'dueProcurementDate', event.target.value)}
                                                                    disabled={isSavingDate || isApplyingAllDates}
                                                                    className="w-full h-6 text-[10px] border border-gray-200 rounded px-1 bg-white disabled:opacity-60"
                                                                />
                                                            ) : dateInfo.dueProc}
                                                        </div>
                                                        <div className="px-2 border-r border-gray-100 text-gray-700 flex items-center">
                                                            {dateEditMode === 'item' ? (
                                                                <input
                                                                    type="date"
                                                                    value={toInputDate(dateInfo.onSiteDate)}
                                                                    onChange={(event) => handleTaskDateChange(task, 'dueMaterialOnSiteDate', event.target.value)}
                                                                    disabled={isSavingDate || isApplyingAllDates}
                                                                    className="w-full h-6 text-[10px] border border-gray-200 rounded px-1 bg-white disabled:opacity-60"
                                                                />
                                                            ) : dateInfo.onSite}
                                                        </div>
                                                        <div className="px-2 border-r border-gray-100 text-gray-700 flex items-center">
                                                            {dateEditMode === 'item' ? (
                                                                <input
                                                                    type="date"
                                                                    value={toInputDate(dateInfo.useDateDate)}
                                                                    onChange={(event) => handleTaskDateChange(task, 'dateOfUse', event.target.value)}
                                                                    disabled={isSavingDate || isApplyingAllDates}
                                                                    className="w-full h-6 text-[10px] border border-gray-200 rounded px-1 bg-white disabled:opacity-60"
                                                                />
                                                            ) : dateInfo.useDate}
                                                        </div>
                                                        <div className="px-2 border-r border-gray-100 flex items-center">
                                                            <select
                                                                value={status}
                                                                onChange={(event) => handleStatusChange(task, event.target.value as ProcurementStatusKey)}
                                                                disabled={isSaving}
                                                                className={`w-full text-[11px] rounded border px-1 py-1 ${getStatusClass(status)} disabled:opacity-60`}
                                                            >
                                                                <option value="to-order">To Order</option>
                                                                <option value="ordered">Ordered</option>
                                                                <option value="delivered">Delivered</option>
                                                                <option value="ready">Ready</option>
                                                                <option value="in-stock">In Stock</option>
                                                            </select>
                                                        </div>
                                                        <div className="px-2 text-gray-700 flex items-center">{dateInfo.period}</div>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    }
                                </React.Fragment >
                            );
                        })}
                    </div >
                </div >
            )}
        </div >
    );
}

