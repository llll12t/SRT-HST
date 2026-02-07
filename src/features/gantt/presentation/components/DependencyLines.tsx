import React from 'react';
import { Task } from '@/types/construction';
import { ViewMode, GanttConfig } from './types';
import { differenceInDays, parseISO } from 'date-fns';

interface DependencyLinesProps {
    tasks: Task[];
    visibleRowMap: Map<string, number>;
    config: GanttConfig;
    viewMode: ViewMode;
    timeRange: { start: Date; end: Date };
    stickyWidth: number;
    onDeleteDependency: (taskId: string, predecessorId: string) => void;
    offsetY?: number;
    startIndex: number;

    endIndex: number;
    scrollLeft?: number;
}

export const DependencyLines: React.FC<DependencyLinesProps> = ({
    tasks,
    visibleRowMap,
    config,
    viewMode,
    timeRange,
    stickyWidth,
    onDeleteDependency,
    offsetY = 0,
    startIndex,
    endIndex,
    scrollLeft = 0
}) => {
    const rowHeight = 32;
    const halfRow = rowHeight / 2;

    return (
        <svg className="absolute inset-0 pointer-events-none z-30" style={{ width: '100%', height: '100%', left: stickyWidth, clipPath: `inset(0px 0px 0px ${Math.max(0, scrollLeft)}px)` }}>
            {tasks.flatMap(task => {
                if (!task.predecessors || task.predecessors.length === 0) return [];
                const targetRowIndex = visibleRowMap.get(task.id);
                if (targetRowIndex === undefined) return []; // Target hidden

                return task.predecessors.map(predId => {
                    const predTask = tasks.find(t => t.id === predId);
                    if (!predTask) return null;
                    const sourceRowIndex = visibleRowMap.get(predId);
                    if (sourceRowIndex === undefined) return null; // Source hidden

                    const minRow = Math.min(sourceRowIndex, targetRowIndex);
                    const maxRow = Math.max(sourceRowIndex, targetRowIndex);
                    if (maxRow < startIndex - 20 || minRow > endIndex + 20) return null;

                    // Calculate Coordinates
                    const getX = (t: Task, side: 'start' | 'end') => {
                        const d = side === 'start' ? parseISO(t.planStartDate) : parseISO(t.planEndDate);
                        const diffDays = differenceInDays(d, timeRange.start) + (side === 'end' ? 1 : 0);

                        if (viewMode === 'day') return diffDays * config.cellWidth;
                        if (viewMode === 'week') return (diffDays / 7) * config.cellWidth;
                        return (diffDays / 30.44) * config.cellWidth;
                    };

                    const x1 = getX(predTask, 'end');
                    const y1 = offsetY + (sourceRowIndex * rowHeight) + halfRow;
                    const x2 = getX(task, 'start');
                    const y2 = offsetY + (targetRowIndex * rowHeight) + halfRow;

                    // Clean Orthogonal Routing
                    let path = '';
                    const buffer = 12; // Gap for initial straight line

                    if (x2 >= x1 + (buffer * 2)) {
                        // Standard Forward "S" Shape
                        const midX = x1 + (x2 - x1) / 2;
                        path = `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
                    } else {
                        // Backward or Close Loop
                        const loopX = x1 + buffer;
                        const loopEnterX = x2 - buffer;

                        path = `M ${x1} ${y1} 
                                L ${x1 + buffer} ${y1} 
                                L ${x1 + buffer} ${y2 - (y1 < y2 ? 10 : -10)} 
                                L ${x2 - buffer} ${y2 - (y1 < y2 ? 10 : -10)} 
                                L ${x2 - buffer} ${y2} 
                                L ${x2} ${y2}`;
                    }

                    return (
                        <g key={`${predId}-${task.id}`} className="group/line">
                            {/* Invisible Hit Area (Thicker) */}
                            <path
                                d={path}
                                fill="none"
                                stroke="transparent"
                                strokeWidth="12"
                                className="cursor-pointer pointer-events-auto"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDeleteDependency(task.id, predId);
                                }}
                            >
                                <title>คลิกเพื่อลบการเชื่อมโยง</title>
                            </path>
                            {/* Visible Line */}
                            <path
                                d={path}
                                fill="none"
                                stroke="#9ca3af"
                                strokeWidth="1.5"
                                markerEnd="url(#arrowhead)"
                                className="pointer-events-none group-hover/line:stroke-red-500 group-hover/line:stroke-[2.5px] transition-all"
                            />
                        </g>
                    );
                });
            })}
            <defs>
                <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                    <polygon points="0 0, 6 2, 0 4" fill="#9ca3af" />
                </marker>
            </defs>
        </svg>
    );
};
