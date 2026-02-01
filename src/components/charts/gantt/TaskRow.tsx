import React from 'react';
import { ChevronRight, ChevronDown, Plus, AlertTriangle, X } from 'lucide-react';
import { Task } from '@/types/construction';
import { ViewMode, GanttConfig, DragState, RowDragState, VisibleColumns, DateRange } from './types';
import { format, parseISO, differenceInDays, addDays } from 'date-fns';
import { getBarStyle, getActualDates, isWeekend, isToday, formatDateTH, getGroupSummary, formatDateRange } from './utils';

interface TaskRowProps {
    task: Task;
    level?: number;
    tasks: Task[]; // Needed for recursive calculations/lookups if helpers not passed

    // Config & Context
    config: GanttConfig;
    viewMode: ViewMode;
    timeRange: DateRange;
    visibleColumns: VisibleColumns;
    stickyWidth: number;
    timeline: { items: Date[], groups: Date[], groupFormat: string, itemFormat: string };

    // State
    collapsedTasks: Set<string>;
    dragState: DragState | null;
    rowDragState: RowDragState | null;
    dropTargetId: string | null;
    dropPosition: 'above' | 'below' | 'child' | null;
    isUpdating: boolean;
    showDependencies: boolean;
    dependencySource: { taskId: string, side: 'start' | 'end' } | null;

    // Actions / Handlers
    getTaskWeight: (task: Task) => number;
    hasChildren: (taskId: string) => boolean;
    getChildTasks: (taskId: string) => Task[];
    onTaskUpdate?: (taskId: string, updates: Partial<Task>) => Promise<void>;
    onAddSubTask?: (parentId: string) => void;
    toggleTaskCollapse: (taskId: string) => void;
    handleRowDragStart: (e: React.DragEvent, task: Task) => void;
    handleRowDragOver: (e: React.DragEvent, taskId: string) => void;
    handleRowDragLeave: () => void;
    handleRowDrop: (e: React.DragEvent, taskId: string) => void;
    handleRowDragEnd: () => void;
    handleRemoveFromParent: (taskId: string) => void;
    setActiveColorMenu: (menu: { id: string, type: 'group', top: number, left: number }) => void;
    handleDependencyClick: (taskId: string, side: 'start' | 'end') => void;
    setModalConfig: (config: { isOpen: boolean; title: string; message: string; type: 'confirm' | 'alert'; onConfirm?: () => void; }) => void;
    startDrag: (e: React.MouseEvent, task: Task, type: DragState['type'], barType?: 'plan' | 'actual') => void;
    loadingIds?: Set<string>;
}

export const TaskRow: React.FC<TaskRowProps> = ({
    task: t,
    level = 0,
    tasks,
    config,
    viewMode,
    timeRange,
    visibleColumns,
    stickyWidth,
    timeline,
    collapsedTasks,
    dragState,
    rowDragState,
    dropTargetId,
    dropPosition,
    isUpdating,
    showDependencies,
    dependencySource,
    getTaskWeight,
    hasChildren,
    getChildTasks,
    onTaskUpdate,
    onAddSubTask,
    toggleTaskCollapse,
    handleRowDragStart,
    handleRowDragOver,
    handleRowDragLeave,
    handleRowDrop,
    handleRowDragEnd,
    handleRemoveFromParent,
    setActiveColorMenu,
    handleDependencyClick,
    setModalConfig,
    startDrag,
    loadingIds
}) => {
    const tWeight = getTaskWeight(t);
    const tHasChildren = hasChildren(t.id);
    const tIsCollapsed = collapsedTasks.has(t.id);
    const tIsDropTarget = dropTargetId === t.id;
    const tIsDragging = rowDragState?.taskId === t.id;
    const childTasks = getChildTasks(t.id);

    // Check loading state
    const isLoading = loadingIds?.has(t.id);

    // Calculate group summary for group-type tasks
    const isGroup = t.type === 'group';
    // Note: getGroupSummary moved to utils, requires getTaskWeight
    const groupSummary = isGroup ? getGroupSummary(t, tasks, getTaskWeight) : null;

    // Use summary dates for groups, original dates for tasks
    const displayStartDate = isGroup && groupSummary ? groupSummary.minStartDate : t.planStartDate;
    const displayEndDate = isGroup && groupSummary ? groupSummary.maxEndDate : t.planEndDate;
    const displayProgress = isGroup && groupSummary ? groupSummary.progress : t.progress;
    const displayCost = isGroup && groupSummary ? groupSummary.totalCost : t.cost;

    return (
        <React.Fragment key={t.id}>
            {/* Drop indicator - Above */}
            {tIsDropTarget && dropPosition === 'above' && (
                <div className="h-0.5 bg-blue-500 w-full" />
            )}
            <div
                className={`flex h-8 border-b border-dashed border-gray-200 transition-colors group relative
                ${tIsDragging ? 'opacity-50 bg-gray-100' : 'hover:bg-blue-50/30'}
                ${tIsDropTarget && dropPosition === 'child' ? 'bg-blue-100 ring-2 ring-inset ring-blue-400' : ''}
            `}
                draggable={!!onTaskUpdate}
                onDragStart={(e) => handleRowDragStart(e, t)}
                onDragOver={(e) => handleRowDragOver(e, t.id)}
                onDragLeave={handleRowDragLeave}
                onDrop={(e) => handleRowDrop(e, t.id)}
                onDragEnd={handleRowDragEnd}
            >
                <div className="sticky left-0 z-[60] bg-white group-hover:bg-gray-50 border-r border-gray-300 flex items-center pl-4 shadow-[1px_0_0px_rgba(0,0,0,0.05)]"
                    style={{ width: `${stickyWidth}px`, minWidth: `${stickyWidth}px` }}>

                    {/* Indent + Collapse toggle */}
                    <div className="flex items-center" style={{ paddingLeft: `${level * 20}px` }}>
                        {/* Tree connector line for sub-items */}
                        {level > 0 && (
                            <div className="flex items-center mr-1">
                                <div className="w-3 h-[1px] bg-gray-300"></div>
                            </div>
                        )}
                        {tHasChildren ? (
                            <button
                                className="p-0.5 hover:bg-gray-200 rounded-sm transition-colors text-gray-500"
                                onClick={(e) => { e.stopPropagation(); toggleTaskCollapse(t.id); }}
                            >
                                {tIsCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>
                        ) : (
                            <div className="w-4" />
                        )}

                        {/* Color Picker for Groups */}
                        {t.type === 'group' && (
                            <button
                                className="w-2.5 h-2.5 rounded-full border border-gray-300 hover:scale-110 transition-transform shadow-sm flex-shrink-0 mr-1.5"
                                style={{ backgroundColor: t.color || '#3b82f6' }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    setActiveColorMenu({
                                        id: t.id,
                                        type: 'group',
                                        top: rect.bottom + window.scrollY,
                                        left: rect.left + window.scrollX
                                    });
                                }}
                                title="Change Group Color"
                            />
                        )}

                        {/* Child count badge */}
                        {tHasChildren && (
                            <span className="text-[9px] text-gray-500 bg-gray-200 px-1 rounded-sm ml-0.5 mr-1">
                                {childTasks.length}
                            </span>
                        )}
                    </div>

                    {/* Drag handle */}
                    {onTaskUpdate && (
                        <div className="cursor-grab mr-1 text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                <circle cx="5" cy="5" r="2" /><circle cx="12" cy="5" r="2" /><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="5" cy="19" r="2" /><circle cx="12" cy="19" r="2" />
                            </svg>
                        </div>
                    )}

                    <div className={`flex-1 truncate text-xs transition-colors flex items-center pr-2 
                    ${t.type === 'group' || hasChildren(t.id) ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}
                        title={t.name}>
                        {t.name}

                        {/* Add Task Button for Groups (Moved here) */}
                        {onAddSubTask && t.type === 'group' && (
                            <button
                                className="ml-2 p-0.5 hover:bg-blue-100 rounded-sm transition-colors text-blue-500 opacity-0 group-hover:opacity-100 shrink-0"
                                onClick={(e) => { e.stopPropagation(); onAddSubTask(t.id); }}
                                title="Add Sub-Group/Task"
                            >
                                <Plus className="w-3 h-3" />
                            </button>
                        )}

                        {t.parentTaskId && onTaskUpdate && (
                            <button
                                className="ml-1 text-[9px] text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100"
                                onClick={(e) => { e.stopPropagation(); handleRemoveFromParent(t.id); }}
                                title="Remove from parent"
                            >
                                ✕
                            </button>
                        )}
                        {/* Loading Spinner */}
                        {isLoading && (
                            <svg className="ml-2 animate-spin h-3 w-3 text-blue-500 inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        )}
                    </div>

                    {visibleColumns.cost && (
                        <div className="w-20 h-full flex items-center justify-end border-l border-gray-200 text-xs text-gray-600 font-medium font-mono shrink-0 pr-2 truncate">
                            {isGroup ? (displayCost ? displayCost.toLocaleString() : '-') : (t.cost ? t.cost.toLocaleString() : '-')}
                        </div>
                    )}
                    <div className="w-16 h-full flex items-center justify-end border-l border-gray-200 text-xs text-gray-600 font-medium font-mono shrink-0 pr-2 truncate">
                        {(() => {
                            if (t.type === 'group') {
                                // Recursive sum for groups
                                const { getAllDescendants } = require('./utils');
                                const descendants = getAllDescendants(t.id, tasks) as Task[];
                                const groupWeight = descendants
                                    .filter(d => d.type !== 'group')
                                    .reduce((sum, d) => sum + getTaskWeight(d), 0);
                                return `${groupWeight.toFixed(2)}%`;
                            }
                            return `${tWeight.toFixed(2)}%`;
                        })()}
                    </div>
                    {visibleColumns.quantity && (
                        <div className="w-20 h-full flex items-center justify-start border-l border-gray-200 text-xs text-gray-600 font-medium font-mono shrink-0 pl-2 truncate">
                            {isGroup ? (groupSummary?.count ? `${groupSummary.count} งาน` : '-') : (t.quantity || '-')}
                        </div>
                    )}
                    {visibleColumns.period && (
                        <div className={`w-[130px] h-full flex items-center justify-start border-l border-gray-200 text-[10px] font-mono shrink-0 pl-2 truncate ${isGroup ? 'text-gray-700 font-medium' : 'text-gray-500'}`}>
                            {displayStartDate && displayEndDate ? (
                                formatDateRange(displayStartDate, displayEndDate)
                            ) : '-'}
                        </div>
                    )}
                    {visibleColumns.progress && (
                        <div className="w-20 h-full flex items-center justify-start border-l border-gray-200 shrink-0 gap-1 pl-2">
                            {isGroup ? (
                                // Groups: Show calculated progress (read-only)
                                <>
                                    <span className={`w-[45px] text-left text-xs font-bold font-mono ${displayProgress === 100 ? 'text-green-600' : displayProgress > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                                        {displayProgress}%
                                    </span>
                                    <div className="w-[22px]"></div>
                                </>
                            ) : (
                                // Tasks: Show interactive Start/Reset buttons
                                <>
                                    {!t.actualStartDate && Number(t.progress) === 0 ? (
                                        <>
                                            <div className="w-[45px]"></div>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const startD = t.planStartDate || format(new Date(), 'yyyy-MM-dd');
                                                    onTaskUpdate?.(t.id, {
                                                        actualStartDate: startD,
                                                        progress: 0,
                                                        status: 'in-progress'
                                                    });
                                                }}
                                                className="flex items-center gap-0.5 px-1.5 py-0.5 bg-green-50 text-green-700 text-[9px] font-bold rounded border border-green-200 hover:bg-green-100 transition-colors w-[24px] justify-center"
                                                title="เริ่มงาน"
                                            >
                                                <span className="hidden sm:inline">GO</span>
                                                <svg className="sm:hidden" width="7" height="7" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                                            </button>
                                        </>
                                    ) : (
                                        <div className="flex items-center justify-start w-full group/prog-cell gap-1">
                                            <span className={`w-[45px] text-left text-xs font-bold font-mono ${Number(t.progress) === 100 ? 'text-green-600' : 'text-blue-600'}`}>
                                                {Number(t.progress)}%
                                            </span>
                                            {/* Quick Complete Button */}
                                            {Number(t.progress) < 100 && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setModalConfig({
                                                            isOpen: true,
                                                            title: 'จบงาน (100%)',
                                                            message: 'คุณต้องการจบงานนี้ทันทีหรือไม่? (ระบบจะบันทึกเป็น 100% ณ วันนี้)',
                                                            type: 'confirm',
                                                            onConfirm: () => {
                                                                // Use existing actualEndDate (if dragged) or Today
                                                                const finalDate = t.actualEndDate || format(new Date(), 'yyyy-MM-dd');

                                                                onTaskUpdate?.(t.id, {
                                                                    progress: 100,
                                                                    actualEndDate: finalDate,
                                                                    status: 'completed'
                                                                });
                                                            }
                                                        });
                                                    }}
                                                    className="opacity-0 group-hover/prog-cell:opacity-100 w-[22px] flex justify-center text-gray-400 hover:text-green-600 transition-opacity"
                                                    title="จบงาน (Complete)"
                                                >
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                                </button>
                                            )}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setModalConfig({
                                                        isOpen: true,
                                                        title: 'รีเซ็ตความคืบหน้า',
                                                        message: 'คุณต้องการรีเซ็ตความคืบหน้าของงานนี้ใช่หรือไม่?',
                                                        type: 'confirm',
                                                        onConfirm: () => {
                                                            onTaskUpdate?.(t.id, {
                                                                actualStartDate: '',
                                                                actualEndDate: '',
                                                                progress: 0,
                                                                status: 'not-started'
                                                            });
                                                        }
                                                    });
                                                }}
                                                className="opacity-0 group-hover/prog-cell:opacity-100 w-[22px] flex justify-center text-gray-400 hover:text-red-500 transition-opacity"
                                                title="Reset Progress"
                                            >
                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                                            </button>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}


                </div>

                <div className="relative overflow-hidden" style={{ width: `${timeline.items.length * config.cellWidth}px` }}>
                    <div className="absolute inset-0 flex pointer-events-none">
                        {timeline.items.map((item: any, idx: number) => (
                            <div key={idx} className={`flex-shrink-0 border-r border-dashed border-gray-200 h-full ${viewMode === 'day' && isWeekend(item) ? 'bg-gray-50' : ''
                                } ${viewMode === 'day' && isToday(item) ? 'bg-blue-50/20' : ''}`}
                                style={{ width: config.cellWidth }} />
                        ))}
                    </div>

                    {/* Dependency Dots & Bar Rendering */}
                    {(() => {
                        const isGroup = t.type === 'group';

                        // Calculate Bar Style once
                        let barStyle: any = {};
                        let isVisible = true;

                        if (isGroup) {
                            const groupBarTask = {
                                ...t,
                                planStartDate: displayStartDate || t.planStartDate,
                                planEndDate: displayEndDate || t.planEndDate
                            };
                            if (displayStartDate && displayEndDate) {
                                barStyle = getBarStyle(groupBarTask, 'plan', viewMode, config, timeRange, dragState, isUpdating);
                            } else {
                                isVisible = false;
                            }
                        } else {
                            barStyle = getBarStyle(t, 'plan', viewMode, config, timeRange, dragState, isUpdating);
                        }

                        if (barStyle.display === 'none') {
                            isVisible = false;
                        }

                        return (
                            <>
                                {/* Dependency Dots (Start/End) - Only if dependencies enabled and visible */}
                                {showDependencies && !isGroup && isVisible && (
                                    <>
                                        {/* Start Dot (Left) */}
                                        <div
                                            className={`absolute w-1.5 h-1.5 border rounded-full z-20 cursor-pointer transition-all
                                            ${dependencySource?.taskId === t.id && dependencySource?.side === 'start' ? 'bg-blue-600 border-white scale-125' : 'bg-white border-gray-400 hover:bg-blue-100'}
                                            ${dependencySource && dependencySource.side === 'end' && dependencySource.taskId !== t.id ? 'animate-pulse ring-2 ring-blue-300' : ''}
                                        `}
                                            style={{
                                                left: barStyle.left,
                                                top: '13px',
                                                transform: 'translateX(-120%)',
                                                opacity: 1
                                            }}
                                            onClick={(e) => { e.stopPropagation(); handleDependencyClick(t.id, 'start'); }}
                                            title="Link Target (Start)"
                                        />
                                        {/* End Dot (Right) */}
                                        <div
                                            className={`absolute w-1.5 h-1.5 border rounded-full z-20 cursor-pointer transition-all
                                            ${dependencySource?.taskId === t.id && dependencySource?.side === 'end' ? 'bg-blue-600 border-white scale-125' : 'bg-white border-gray-400 hover:bg-blue-500 hover:border-blue-600'}
                                        `}
                                            style={{
                                                left: `${parseFloat(barStyle.left || '0') + parseFloat(barStyle.width || '0')}px`,
                                                top: '13px',
                                                transform: 'translateX(20%)',
                                                opacity: 1
                                            }}
                                            onClick={(e) => { e.stopPropagation(); handleDependencyClick(t.id, 'end'); }}
                                            title="Link Source (End)"
                                        />
                                    </>
                                )}

                                {/* Main Bar */}
                                {isVisible && (
                                    isGroup ? (
                                        <div
                                            className="absolute h-3 top-[10px] rounded-full border border-gray-500/30"
                                            style={{
                                                ...barStyle,
                                                backgroundColor: t.color ? `${t.color}40` : 'rgba(156, 163, 175, 0.4)'
                                            }}
                                        >
                                            <div
                                                className="absolute left-0 top-0 bottom-0 rounded-full"
                                                style={{
                                                    width: `${displayProgress}%`,
                                                    backgroundColor: t.color || '#3b82f6',
                                                    opacity: 0.8
                                                }}
                                            />
                                        </div>
                                    ) : (
                                        <div
                                            className={`absolute h-5 top-[6px] rounded-[2px] border group/bar z-20
                                            ${dragState?.taskId === t.id && dragState?.barType === 'plan' ? 'z-50 cursor-grabbing' : 'cursor-grab'}
                                            ${isUpdating && (dragState?.taskId === t.id || (dragState?.affectedTaskIds && dragState.affectedTaskIds.has(t.id)))
                                                    ? 'bg-[linear-gradient(45deg,rgba(255,255,255,0.15)25%,transparent_25%,transparent_50%,rgba(255,255,255,0.15)50%,rgba(255,255,255,0.15)75%,transparent_75%,transparent)] bg-[length:10px_10px] animate-pulse'
                                                    : 'hover:brightness-95'} 
                                            transition-colors
                                        `}
                                            style={{
                                                ...barStyle,
                                                backgroundColor: t.color || '#3b82f6',
                                                borderColor: t.color || '#2563eb'
                                            }}
                                            onMouseDown={(e) => startDrag(e, t, 'move')}
                                        >
                                            <div
                                                className="absolute left-0 top-0 bottom-0 w-1.5 cursor-w-resize hover:bg-white/30"
                                                onMouseDown={(e) => startDrag(e, t, 'resize-left')}
                                            />
                                            <div
                                                className="absolute right-0 top-0 bottom-0 w-1.5 cursor-e-resize hover:bg-white/30"
                                                onMouseDown={(e) => startDrag(e, t, 'resize-right')}
                                            />
                                        </div>
                                    )
                                )}
                            </>
                        );
                    })()}

                    {(() => {
                        const actualDates = getActualDates(t, dragState, isUpdating);
                        const isGroup = t.type === 'group';

                        // For groups, determine effective actual dates from summary
                        const groupActualDates = isGroup && groupSummary && groupSummary.minActualDate ? {
                            start: parseISO(groupSummary.minActualDate),
                            end: groupSummary.maxActualDate ? parseISO(groupSummary.maxActualDate) : parseISO(groupSummary.minActualDate)
                        } : null;

                        const finalActualDates = isGroup ? groupActualDates : actualDates;

                        if (isGroup) return null; // Don't render actual bars for groups

                        const isStartMarker = !isGroup && Number(t.progress) === 0; // Groups never just start marker

                        return finalActualDates && (
                            <div
                                className={`absolute h-2 top-[12px] z-[25] rounded-[1px] group/actual-bar
                                ${!isGroup && (dragState?.taskId === t.id && dragState?.barType === 'actual')
                                        ? 'z-50 border-white cursor-grabbing shadow-md'
                                        : isGroup ? 'pointer-events-none opacity-80' : 'cursor-grab border-white shadow-sm'}
                                ${isUpdating && (dragState?.taskId === t.id)
                                        ? `bg-[linear-gradient(45deg,rgba(255,255,255,0.3)25%,transparent_25%,transparent_50%,rgba(255,255,255,0.3)50%,rgba(255,255,255,0.3)75%,transparent_75%,transparent)] bg-[length:10px_10px] animate-pulse ${isStartMarker ? 'bg-orange-500' : 'bg-green-400'}`
                                        : isStartMarker ? 'bg-orange-500 hover:bg-orange-600' : 'bg-green-400 hover:bg-green-500'} 
                                transition-all
                            `}
                                style={{
                                    // Manual getBarStyle logic because getBarStyle expects Task properties
                                    ...(isGroup ? (() => {
                                        const startDiff = differenceInDays(finalActualDates.start, timeRange.start);
                                        const duration = differenceInDays(finalActualDates.end, finalActualDates.start) + 1;
                                        let left = 0, width = 0;
                                        if (viewMode === 'day') { left = startDiff * config.cellWidth; width = duration * config.cellWidth; }
                                        else if (viewMode === 'week') { left = (startDiff / 7) * config.cellWidth; width = (duration / 7) * config.cellWidth; }
                                        else { left = (startDiff / 30.44) * config.cellWidth; width = (duration / 30.44) * config.cellWidth; }
                                        return { left: `${left}px`, width: `${Math.max(4, width)}px` };
                                    })() : (getBarStyle(t, 'actual', viewMode, config, timeRange, dragState, isUpdating) as React.CSSProperties)),
                                    ...(isStartMarker ? { width: '10px' } : {})
                                }}
                                onMouseDown={(e) => !isGroup && startDrag(e, t, 'move', 'actual')}
                            >
                                <div
                                    className="absolute left-0 top-0 bottom-0 w-1 cursor-w-resize hover:bg-white/40"
                                    onMouseDown={(e) => startDrag(e, t, 'resize-left', 'actual')}
                                />
                                <div
                                    className="absolute right-0 top-0 bottom-0 w-1 cursor-e-resize hover:bg-white/40"
                                    onMouseDown={(e) => startDrag(e, t, 'resize-right', 'actual')}
                                />
                            </div>
                        );
                    })()}
                </div>
            </div>

            {/* Drop indicator - Below */}
            {
                tIsDropTarget && dropPosition === 'below' && (
                    <div className="h-0.5 bg-blue-500 w-full" />
                )
            }

            {/* Render children recursively */}
            {
                !tIsCollapsed && childTasks.map(child => (
                    <TaskRow
                        key={child.id}
                        task={child}
                        level={level + 1}
                        tasks={tasks}
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
                        isUpdating={isUpdating}
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
                    />
                ))
            }
        </React.Fragment >
    );
};
