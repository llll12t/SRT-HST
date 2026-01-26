import React from 'react';
import { ChevronRight, ChevronDown, Plus, AlertTriangle, X } from 'lucide-react';
import { Task } from '@/types/construction';
import { VisibleColumns } from '../gantt/types';

export interface ChartRowProps {
    task: Task;
    level?: number;
    stickyWidth: number;
    visibleColumns: VisibleColumns;

    // Status / State
    hasChildren: boolean;
    isCollapsed: boolean;
    isGroup: boolean;
    childCount: number;
    groupColor?: string;

    // Display Values (Pre-calculated by parent)
    displayCost: string | number;
    displayWeight: number; // Percentage 0-100
    displayQuantity: string | number;
    displayPeriod: string; // Formatted date range string
    displayProgress: number; // 0-100

    // Actions
    onToggleCollapse?: (taskId: string) => void;
    onAddSubTask?: (taskId: string) => void;
    onRemoveFromParent?: (taskId: string) => void;
    setActiveColorMenu?: (config: { id: string, type: 'group', top: number, left: number }) => void;

    // Interactive Actions (Optional - if provided, UI shows buttons)
    onTaskUpdate?: (taskId: string, updates: Partial<Task>) => void;
    onResetProgress?: (taskId: string) => void;
    onStartTask?: (taskId: string) => void;

    // Drag Handles
    enableDrag?: boolean;
    isDragging?: boolean;
    onDragHandleMouseDown?: (e: React.DragEvent | any) => void; // Using any to support custom events if needed
}

export const ChartRow: React.FC<ChartRowProps> = ({
    task,
    level = 0,
    stickyWidth,
    visibleColumns,
    hasChildren,
    isCollapsed,
    isGroup,
    childCount,
    groupColor,
    displayCost,
    displayWeight,
    displayQuantity,
    displayPeriod,
    displayProgress,
    onToggleCollapse,
    onAddSubTask,
    onRemoveFromParent,
    setActiveColorMenu,
    onTaskUpdate,
    onResetProgress,
    onStartTask,
    enableDrag = false,
    isDragging = false,
}) => {
    return (
        <div className="sticky left-0 z-[60] bg-white group-hover:bg-gray-50 border-r border-gray-300 flex items-center px-4 shadow-[1px_0_0px_rgba(0,0,0,0.05)]"
            style={{ width: `${stickyWidth}px`, minWidth: `${stickyWidth}px` }}>

            {/* Indent + Collapse toggle */}
            <div className="flex items-center" style={{ paddingLeft: `${level * 20}px` }}>
                {/* Tree connector line for sub-items */}
                {level > 0 && (
                    <div className="flex items-center mr-1">
                        <div className="w-3 h-[1px] bg-gray-300"></div>
                    </div>
                )}
                {hasChildren ? (
                    <button
                        className="p-0.5 hover:bg-gray-200 rounded-sm transition-colors text-gray-500"
                        onClick={(e) => { e.stopPropagation(); onToggleCollapse?.(task.id); }}
                    >
                        {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                ) : (
                    <div className="w-4" />
                )}

                {/* Color Picker for Groups */}
                {isGroup && (
                    <button
                        className="w-2.5 h-2.5 rounded-full border border-gray-300 hover:scale-110 transition-transform shadow-sm flex-shrink-0 mr-1.5"
                        style={{ backgroundColor: groupColor || '#3b82f6' }}
                        onClick={(e) => {
                            if (!setActiveColorMenu) return;
                            e.stopPropagation();
                            const rect = e.currentTarget.getBoundingClientRect();
                            setActiveColorMenu({
                                id: task.id,
                                type: 'group',
                                top: rect.bottom + window.scrollY,
                                left: rect.left + window.scrollX
                            });
                        }}
                        title={setActiveColorMenu ? "Change Group Color" : undefined}
                    />
                )}

                {/* Child count badge */}
                {hasChildren && (
                    <span className="text-[9px] text-gray-500 bg-gray-200 px-1 rounded-sm ml-0.5 mr-1">
                        {childCount}
                    </span>
                )}
                {onAddSubTask && isGroup && (
                    <button
                        className="p-0.5 ml-1 hover:bg-blue-100 rounded-sm transition-colors text-blue-500 opacity-0 group-hover:opacity-100"
                        onClick={(e) => { e.stopPropagation(); onAddSubTask(task.id); }}
                        title="Add Sub-Group/Task"
                    >
                        <Plus className="w-3 h-3" />
                    </button>
                )}
            </div>

            {/* Drag handle */}
            {enableDrag && (
                <div className="cursor-grab mr-1 text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                        <circle cx="5" cy="5" r="2" /><circle cx="12" cy="5" r="2" /><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="5" cy="19" r="2" /><circle cx="12" cy="19" r="2" />
                    </svg>
                </div>
            )}

            <div className={`flex-1 truncate text-xs transition-colors 
                ${isGroup || hasChildren ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}
                title={task.name}>
                {task.name}
                {task.parentTaskId && onRemoveFromParent && (
                    <button
                        className="ml-1 text-[9px] text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100"
                        onClick={(e) => { e.stopPropagation(); onRemoveFromParent(task.id); }}
                        title="Remove from parent"
                    >
                        ✕
                    </button>
                )}
            </div>

            {visibleColumns.cost && (
                <div className="w-20 text-right text-xs text-gray-600 font-medium font-mono shrink-0">
                    {typeof displayCost === 'number' ? displayCost.toLocaleString() : displayCost}
                </div>
            )}
            {visibleColumns.weight && (
                <div className="w-14 text-right text-xs text-gray-600 font-medium font-mono shrink-0">
                    {displayWeight.toFixed(2)}%
                </div>
            )}
            {visibleColumns.quantity && (
                <div className="w-16 text-right text-xs text-gray-600 font-medium font-mono shrink-0">
                    {displayQuantity}
                </div>
            )}
            {visibleColumns.period && (
                <div className={`w-[110px] text-right text-[10px] font-mono shrink-0 ${isGroup ? 'text-gray-700 font-medium' : 'text-gray-500'}`}>
                    {displayPeriod}
                </div>
            )}
            {visibleColumns.progress && (
                <div className="w-20 flex items-center justify-end shrink-0 gap-1 pr-1">
                    {isGroup || !onStartTask ? (
                        // Read-only / Group view
                        <>
                            <span className={`w-[45px] text-right text-xs font-bold font-mono ${displayProgress === 100 ? 'text-green-600' : displayProgress > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                                {displayProgress}%
                            </span>
                            <div className="w-[22px]"></div>
                        </>
                    ) : (
                        // Interactive Task View
                        <>
                            {!task.actualStartDate && Number(task.progress) === 0 ? (
                                <>
                                    <div className="w-[45px]"></div>
                                    {onStartTask && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onStartTask(task.id);
                                            }}
                                            className="flex items-center gap-0.5 px-1.5 py-0.5 bg-green-50 text-green-700 text-[9px] font-bold rounded border border-green-200 hover:bg-green-100 transition-colors w-[24px] justify-center"
                                            title="เริ่มงาน"
                                        >
                                            <span className="hidden sm:inline">GO</span>
                                            <svg className="sm:hidden" width="7" height="7" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                                        </button>
                                    )}
                                </>
                            ) : (
                                <div className="flex items-center justify-end w-full group/prog-cell gap-1">
                                    <span className={`w-[45px] text-right text-xs font-bold font-mono ${Number(task.progress) === 100 ? 'text-green-600' : 'text-blue-600'}`}>
                                        {Number(task.progress)}%
                                    </span>
                                    {onResetProgress && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onResetProgress(task.id);
                                            }}
                                            className="opacity-0 group-hover/prog-cell:opacity-100 w-[22px] flex justify-center text-gray-400 hover:text-red-500 transition-opacity"
                                            title="Reset Progress"
                                        >
                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                                        </button>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
};
