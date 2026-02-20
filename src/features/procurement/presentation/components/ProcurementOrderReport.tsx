'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import {
    addDays,
    addWeeks,
    differenceInCalendarDays,
    endOfDay,
    format,
    isAfter,
    parseISO,
    startOfDay
} from 'date-fns';
import {
    AlertTriangle,
    CalendarClock,
    CircleAlert,
    FolderKanban,
    Loader2,
    PackageCheck
} from 'lucide-react';
import { updateTask } from '@/lib/firestore';
import { Project, Task } from '@/types/construction';

type ProcurementStatusKey = 'to-order' | 'ordered' | 'delivered' | 'ready' | 'in-stock';
type ReportViewMode = 'alert' | 'project';
type ScopeMode = '4weeks' | 'all';

interface ProcurementOrderReportProps {
    projects: Project[];
    tasks: Task[];
}

type ReportItem = {
    task: Task;
    projectName: string;
    categoryPath: string;
    status: ProcurementStatusKey;
    dueProcDate: Date | null;
    onSiteDate: Date | null;
    useDate: Date | null;
    daysUntilDueProc: number | null;
    priority: 'overdue' | 'urgent' | 'soon' | 'planned';
};

const DUE_PROCUREMENT_DAYS = -5;
const DUE_ONSITE_DAYS = -1;
const USE_DATE_DAYS = 0;

const parseTaskDate = (value?: string) => {
    if (!value) return null;
    try {
        const parsed = parseISO(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    } catch {
        return null;
    }
};

const normalizeProcStatus = (value?: Task['procurementStatus']): ProcurementStatusKey => {
    if (!value) return 'to-order';
    if (value === 'plan-a' || value === 'plan-b' || value === 'plan-c') return 'ordered';
    if (value === 'actual') return 'ready';
    if (value === 'to-order' || value === 'ordered' || value === 'delivered' || value === 'ready' || value === 'in-stock') return value;
    return 'to-order';
};

const deriveTaskStatus = (task: Task): ProcurementStatusKey => {
    if (task.procurementStatus) return normalizeProcStatus(task.procurementStatus);
    if (task.status === 'completed') return 'ready';
    if (task.status === 'in-progress') return 'ordered';
    return 'to-order';
};

const getStatusLabel = (status: ProcurementStatusKey) => {
    if (status === 'to-order') return 'To Order';
    if (status === 'ordered') return 'Ordered';
    if (status === 'delivered') return 'Delivered';
    if (status === 'in-stock') return 'In Stock';
    return 'Ready';
};

const getStatusClass = (status: ProcurementStatusKey) => {
    if (status === 'ordered') return 'text-cyan-700 bg-cyan-50 border-cyan-200';
    if (status === 'delivered') return 'text-indigo-700 bg-indigo-50 border-indigo-200';
    if (status === 'ready') return 'text-emerald-700 bg-emerald-50 border-emerald-200';
    if (status === 'in-stock') return 'text-slate-700 bg-slate-100 border-slate-300';
    return 'text-amber-700 bg-amber-50 border-amber-200';
};

const getPriorityClass = (priority: ReportItem['priority']) => {
    if (priority === 'overdue') return 'text-rose-700 bg-rose-50 border-rose-200';
    if (priority === 'urgent') return 'text-orange-700 bg-orange-50 border-orange-200';
    if (priority === 'soon') return 'text-blue-700 bg-blue-50 border-blue-200';
    return 'text-gray-700 bg-gray-100 border-gray-200';
};

const getPriorityLabel = (priority: ReportItem['priority']) => {
    if (priority === 'overdue') return 'Overdue';
    if (priority === 'urgent') return 'Urgent';
    if (priority === 'soon') return 'Soon';
    return 'Planned';
};

const formatDateCell = (date: Date | null) => (date ? format(date, 'dd/MM') : '-');

const getEffectiveDate = (task: Task, field: 'dueProcurementDate' | 'dueMaterialOnSiteDate' | 'dateOfUse') => {
    const direct = parseTaskDate(task[field]);
    if (direct) return direct;

    const start = parseTaskDate(task.planStartDate);
    if (!start) return null;

    if (field === 'dueProcurementDate') return addDays(start, DUE_PROCUREMENT_DAYS);
    if (field === 'dueMaterialOnSiteDate') return addDays(start, DUE_ONSITE_DAYS);
    return addDays(start, USE_DATE_DAYS);
};

const getPriority = (daysUntilDueProc: number | null): ReportItem['priority'] => {
    if (daysUntilDueProc === null) return 'planned';
    if (daysUntilDueProc < 0) return 'overdue';
    if (daysUntilDueProc <= 2) return 'urgent';
    if (daysUntilDueProc <= 7) return 'soon';
    return 'planned';
};

const getDaysText = (daysUntilDueProc: number | null) => {
    if (daysUntilDueProc === null) return '-';
    if (daysUntilDueProc < 0) return `${Math.abs(daysUntilDueProc)}d late`;
    if (daysUntilDueProc === 0) return 'Today';
    return `${daysUntilDueProc}d`;
};

const priorityRank: Record<ReportItem['priority'], number> = {
    overdue: 0,
    urgent: 1,
    soon: 2,
    planned: 3
};

const statusOptions: ProcurementStatusKey[] = ['to-order', 'ordered', 'delivered', 'ready', 'in-stock'];

export default function ProcurementOrderReport({ projects, tasks }: ProcurementOrderReportProps) {
    const [viewMode, setViewMode] = useState<ReportViewMode>('alert');
    const [scopeMode, setScopeMode] = useState<ScopeMode>('4weeks');
    const [statusOverrides, setStatusOverrides] = useState<Record<string, ProcurementStatusKey>>({});
    const [savingTaskIds, setSavingTaskIds] = useState<Set<string>>(new Set());

    const today = useMemo(() => startOfDay(new Date()), []);
    const fourWeekEnd = useMemo(() => endOfDay(addWeeks(today, 4)), [today]);

    const handleStatusChange = async (task: Task, nextStatus: ProcurementStatusKey) => {
        const previousOverride = statusOverrides[task.id];
        const currentStatus = statusOverrides[task.id] ?? deriveTaskStatus(task);
        if (nextStatus === currentStatus) return;

        setStatusOverrides((prev) => ({ ...prev, [task.id]: nextStatus }));
        setSavingTaskIds((prev) => {
            const next = new Set(prev);
            next.add(task.id);
            return next;
        });

        try {
            await updateTask(task.id, { procurementStatus: nextStatus });
        } catch (error) {
            console.error('Failed to update procurement status from order report:', error);
            setStatusOverrides((prev) => {
                const next = { ...prev };
                if (previousOverride === undefined) {
                    delete next[task.id];
                } else {
                    next[task.id] = previousOverride;
                }
                return next;
            });
        } finally {
            setSavingTaskIds((prev) => {
                const next = new Set(prev);
                next.delete(task.id);
                return next;
            });
        }
    };

    const items = useMemo(() => {
        const projectMap = new Map(projects.map((project) => [project.id, project.name]));

        const result = tasks.reduce<ReportItem[]>((acc, task) => {
            if (task.type === 'group') return acc;

                const status = statusOverrides[task.id] ?? deriveTaskStatus(task);

                const dueProcDate = getEffectiveDate(task, 'dueProcurementDate');
                const onSiteDate = getEffectiveDate(task, 'dueMaterialOnSiteDate');
                const useDate = getEffectiveDate(task, 'dateOfUse');
                const isPastUseDate = useDate ? isAfter(startOfDay(today), endOfDay(useDate)) : false;

                if (status === 'in-stock') return acc;
                if (status === 'ready' && isPastUseDate) return acc;

                const anchorDate = dueProcDate ?? onSiteDate ?? useDate;
                if (scopeMode === '4weeks' && anchorDate && isAfter(startOfDay(anchorDate), fourWeekEnd)) {
                    return acc;
                }

                const daysUntilDueProc = dueProcDate
                    ? differenceInCalendarDays(startOfDay(dueProcDate), today)
                    : null;

                const categoryPath = [task.category, task.subcategory, task.subsubcategory]
                    .filter((value): value is string => Boolean(value && value.trim()))
                    .join(' / ');

                acc.push({
                    task,
                    projectName: projectMap.get(task.projectId) || 'Unknown Project',
                    categoryPath: categoryPath || '-',
                    status,
                    dueProcDate,
                    onSiteDate,
                    useDate,
                    daysUntilDueProc,
                    priority: getPriority(daysUntilDueProc)
                });

                return acc;
            }, []);

        result.sort((a, b) => {
            const priorityDiff = priorityRank[a.priority] - priorityRank[b.priority];
            if (priorityDiff !== 0) return priorityDiff;

            const dueA = a.dueProcDate?.getTime() ?? Number.POSITIVE_INFINITY;
            const dueB = b.dueProcDate?.getTime() ?? Number.POSITIVE_INFINITY;
            if (dueA !== dueB) return dueA - dueB;

            if (a.projectName !== b.projectName) return a.projectName.localeCompare(b.projectName);
            return (a.task.order || 0) - (b.task.order || 0);
        });

        return result;
    }, [projects, tasks, scopeMode, fourWeekEnd, today, statusOverrides]);

    const groupedByProject = useMemo(() => {
        const map = new Map<string, ReportItem[]>();
        for (const item of items) {
            const existing = map.get(item.projectName) ?? [];
            existing.push(item);
            map.set(item.projectName, existing);
        }
        return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
    }, [items]);

    const stats = useMemo(() => {
        const overdue = items.filter((item) => item.priority === 'overdue').length;
        const urgent = items.filter((item) => item.priority === 'urgent').length;
        const soon = items.filter((item) => item.priority === 'soon').length;
        return {
            total: items.length,
            overdue,
            urgent,
            soon
        };
    }, [items]);

    return (
        <div className="w-full min-w-0 max-w-full space-y-3">
            <div className="rounded border border-gray-300 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-gray-200 bg-gray-50">
                    <div className="text-xs text-gray-700">
                        <span className="font-semibold">Action Items:</span> {stats.total}
                        <span className="mx-2 text-gray-300">|</span>
                        <span className="text-rose-700 font-semibold">{stats.overdue} overdue</span>
                        <span className="mx-2 text-gray-300">|</span>
                        <span className="text-orange-700 font-semibold">{stats.urgent} urgent</span>
                        <span className="mx-2 text-gray-300">|</span>
                        <span className="text-blue-700 font-semibold">{stats.soon} soon</span>
                    </div>
                    <Link
                        href="/procurement"
                        className="h-8 px-3 rounded border border-gray-300 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-100 inline-flex items-center"
                    >
                        Open 4-Week Gantt
                    </Link>
                </div>

                <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-gray-200">
                    <span className="text-xs font-semibold text-gray-600">View</span>
                    <div className="inline-flex rounded border border-gray-300 overflow-hidden">
                        <button
                            type="button"
                            onClick={() => setViewMode('alert')}
                            className={`px-3 h-8 text-xs font-semibold ${
                                viewMode === 'alert' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
                            }`}
                        >
                            Alert List
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode('project')}
                            className={`px-3 h-8 text-xs font-semibold border-l border-gray-300 ${
                                viewMode === 'project' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
                            }`}
                        >
                            By Project
                        </button>
                    </div>

                    <span className="text-xs font-semibold text-gray-600 ml-3">Scope</span>
                    <div className="inline-flex rounded border border-gray-300 overflow-hidden">
                        <button
                            type="button"
                            onClick={() => setScopeMode('4weeks')}
                            className={`px-3 h-8 text-xs font-semibold ${
                                scopeMode === '4weeks' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
                            }`}
                        >
                            Next 4 Weeks
                        </button>
                        <button
                            type="button"
                            onClick={() => setScopeMode('all')}
                            className={`px-3 h-8 text-xs font-semibold border-l border-gray-300 ${
                                scopeMode === 'all' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
                            }`}
                        >
                            All
                        </button>
                    </div>
                </div>
                <div className="px-4 py-2 border-b border-gray-100 bg-white">
                    <p className="text-[11px] text-gray-500">
                        You can edit <span className="font-semibold">Proc. Status</span> directly. Items set to
                        <span className="font-semibold"> In Stock </span>
                        are hidden immediately, while
                        <span className="font-semibold"> Ready </span>
                        will be hidden only after the
                        <span className="font-semibold"> Use Date </span>
                        has passed.
                    </p>
                </div>

                {items.length === 0 ? (
                    <div className="p-10 text-center">
                        <PackageCheck className="w-10 h-10 mx-auto text-emerald-500 mb-2" />
                        <p className="text-sm font-semibold text-gray-700">No procurement action items found.</p>
                        <p className="text-xs text-gray-500 mt-1">
                            All current tasks are ready/in stock, or outside selected scope.
                        </p>
                    </div>
                ) : viewMode === 'alert' ? (
                    <div className="w-full overflow-x-auto">
                        <table className="w-full min-w-[980px] text-xs">
                            <thead className="bg-slate-100 text-slate-700">
                                <tr>
                                    <th className="px-3 py-2 border-b border-slate-300 text-left font-semibold">Priority</th>
                                    <th className="px-3 py-2 border-b border-slate-300 text-left font-semibold">Project</th>
                                    <th className="px-3 py-2 border-b border-slate-300 text-left font-semibold">Task</th>
                                    <th className="px-3 py-2 border-b border-slate-300 text-left font-semibold">Category</th>
                                    <th className="px-3 py-2 border-b border-slate-300 text-center font-semibold">Due Proc.</th>
                                    <th className="px-3 py-2 border-b border-slate-300 text-center font-semibold">On Site</th>
                                    <th className="px-3 py-2 border-b border-slate-300 text-center font-semibold">Use Date</th>
                                    <th className="px-3 py-2 border-b border-slate-300 text-left font-semibold">Proc. Status</th>
                                    <th className="px-3 py-2 border-b border-slate-300 text-left font-semibold">Action In</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item) => (
                                    <tr key={item.task.id} className="border-b border-gray-100 hover:bg-gray-50/60">
                                        <td className="px-3 py-2 align-top">
                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border font-semibold ${getPriorityClass(item.priority)}`}>
                                                {item.priority === 'overdue' ? (
                                                    <AlertTriangle className="w-3 h-3" />
                                                ) : item.priority === 'urgent' ? (
                                                    <CircleAlert className="w-3 h-3" />
                                                ) : (
                                                    <CalendarClock className="w-3 h-3" />
                                                )}
                                                {getPriorityLabel(item.priority)}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 align-top text-gray-700 font-medium">{item.projectName}</td>
                                        <td className="px-3 py-2 align-top text-gray-900">{item.task.name}</td>
                                        <td className="px-3 py-2 align-top text-gray-600">{item.categoryPath}</td>
                                        <td className="px-3 py-2 align-top text-center text-gray-700">{formatDateCell(item.dueProcDate)}</td>
                                        <td className="px-3 py-2 align-top text-center text-gray-700">{formatDateCell(item.onSiteDate)}</td>
                                        <td className="px-3 py-2 align-top text-center text-gray-700">{formatDateCell(item.useDate)}</td>
                                        <td className="px-3 py-2 align-top">
                                            <div className="inline-flex items-center gap-1">
                                                <select
                                                    value={item.status}
                                                    onChange={(event) => void handleStatusChange(item.task, event.target.value as ProcurementStatusKey)}
                                                    disabled={savingTaskIds.has(item.task.id)}
                                                    className={`h-7 rounded border px-2 text-[11px] font-semibold bg-white ${getStatusClass(item.status)} disabled:opacity-60`}
                                                >
                                                    {statusOptions.map((status) => (
                                                        <option key={status} value={status}>
                                                            {getStatusLabel(status)}
                                                        </option>
                                                    ))}
                                                </select>
                                                {savingTaskIds.has(item.task.id) && (
                                                    <Loader2 className="w-3 h-3 text-blue-600 animate-spin" />
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-3 py-2 align-top text-gray-700 font-semibold">{getDaysText(item.daysUntilDueProc)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="p-3 space-y-3">
                        {groupedByProject.map(([projectName, projectItems]) => (
                            <section key={projectName} className="border border-gray-200 rounded bg-white">
                                <header className="px-3 py-2 bg-slate-50 border-b border-gray-200 flex items-center justify-between">
                                    <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                                        <FolderKanban className="w-4 h-4 text-blue-600" />
                                        {projectName}
                                    </h3>
                                    <span className="text-[11px] text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                                        {projectItems.length} item(s)
                                    </span>
                                </header>
                                <div className="w-full overflow-x-auto">
                                    <table className="w-full min-w-[820px] text-xs">
                                        <thead className="bg-gray-50 text-gray-700">
                                            <tr>
                                                <th className="px-3 py-2 border-b border-gray-200 text-left font-semibold">Task</th>
                                                <th className="px-3 py-2 border-b border-gray-200 text-left font-semibold">Category</th>
                                                <th className="px-3 py-2 border-b border-gray-200 text-center font-semibold">Due Proc.</th>
                                                <th className="px-3 py-2 border-b border-gray-200 text-center font-semibold">On Site</th>
                                                <th className="px-3 py-2 border-b border-gray-200 text-center font-semibold">Use Date</th>
                                                <th className="px-3 py-2 border-b border-gray-200 text-left font-semibold">Status</th>
                                                <th className="px-3 py-2 border-b border-gray-200 text-left font-semibold">Priority</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {projectItems.map((item) => (
                                                <tr key={item.task.id} className="border-b border-gray-100 last:border-b-0">
                                                    <td className="px-3 py-2 text-gray-900">{item.task.name}</td>
                                                    <td className="px-3 py-2 text-gray-600">{item.categoryPath}</td>
                                                    <td className="px-3 py-2 text-center text-gray-700">{formatDateCell(item.dueProcDate)}</td>
                                                    <td className="px-3 py-2 text-center text-gray-700">{formatDateCell(item.onSiteDate)}</td>
                                                    <td className="px-3 py-2 text-center text-gray-700">{formatDateCell(item.useDate)}</td>
                                                    <td className="px-3 py-2">
                                                        <div className="inline-flex items-center gap-1">
                                                            <select
                                                                value={item.status}
                                                                onChange={(event) => void handleStatusChange(item.task, event.target.value as ProcurementStatusKey)}
                                                                disabled={savingTaskIds.has(item.task.id)}
                                                                className={`h-7 rounded border px-2 text-[11px] font-semibold bg-white ${getStatusClass(item.status)} disabled:opacity-60`}
                                                            >
                                                                {statusOptions.map((status) => (
                                                                    <option key={status} value={status}>
                                                                        {getStatusLabel(status)}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                            {savingTaskIds.has(item.task.id) && (
                                                                <Loader2 className="w-3 h-3 text-blue-600 animate-spin" />
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <span className={`inline-flex px-2 py-0.5 rounded border font-semibold ${getPriorityClass(item.priority)}`}>
                                                            {getPriorityLabel(item.priority)}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </section>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
