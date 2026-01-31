import React from 'react';
import { ChevronRight, ChevronDown, Plus } from 'lucide-react';
import { VisibleColumns } from '../gantt/types';

export interface ChartCategoryRowProps {
    category: string;
    stickyWidth: number;
    visibleColumns: VisibleColumns;
    isCollapsed: boolean;
    onToggle: () => void;
    color: string;
    onColorClick?: (e: React.MouseEvent) => void;
    count: number;
    onAddClick?: (e: React.MouseEvent) => void;

    // Display Values
    totalCost: string | number;
    totalWeight: number;
    avgProgress: number;
    dateRangeString: string;
    children?: React.ReactNode;
}

export const ChartCategoryRow: React.FC<ChartCategoryRowProps> = ({
    category,
    stickyWidth,
    visibleColumns,
    isCollapsed,
    onToggle,
    color,
    onColorClick,
    count,
    onAddClick,
    totalCost,
    totalWeight,
    avgProgress,
    dateRangeString,
    children
}) => {
    return (
        <div
            className="flex bg-white border-b border-dashed border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors h-8 group"
            onClick={onToggle}
        >
            <div className="sticky left-0 z-50 bg-white group-hover:bg-gray-50 border-r border-gray-300 px-4 shadow-[1px_0_0px_rgba(0,0,0,0.05)] flex items-center gap-2"
                style={{ width: `${stickyWidth}px`, minWidth: `${stickyWidth}px` }}>

                {/* Indent Level 0 */}
                <div className="w-4 flex justify-center">
                    <button className="p-0.5 hover:bg-gray-200 rounded-sm transition-colors text-gray-500">
                        {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                </div>

                {/* Color Picker for Category */}
                <button
                    className="w-3 h-3 rounded-full border border-gray-300 hover:scale-110 transition-transform shadow-sm flex-shrink-0"
                    style={{ backgroundColor: color || '#3b82f6' }}
                    onClick={(e) => {
                        if (onColorClick) {
                            e.stopPropagation();
                            onColorClick(e);
                        }
                    }}
                    title="Change Category Color"
                />

                <div className="flex-1 truncate text-xs font-bold text-gray-900 uppercase tracking-wide group/cat-header flex items-center" title={category}>
                    {category}
                    <span className="ml-2 text-[9px] text-gray-500 font-normal bg-gray-100 px-1.5 rounded-full">{count}</span>
                    {onAddClick && (
                        <button
                            className="ml-2 p-0.5 hover:bg-blue-100 rounded-sm transition-colors text-blue-500 opacity-0 group-hover/cat-header:opacity-100"
                            onClick={(e) => { e.stopPropagation(); onAddClick(e); }}
                            title="Add Task to Category"
                        >
                            <Plus className="w-3 h-3" />
                        </button>
                    )}
                </div>

                {/* Columns */}
                {visibleColumns.cost && (
                    <div className="w-20 text-right text-xs text-gray-900 font-bold font-mono shrink-0">
                        {typeof totalCost === 'number' ? totalCost.toLocaleString() : totalCost}
                    </div>
                )}
                {visibleColumns.weight && (
                    <div className="w-14 text-right text-xs text-gray-900 font-bold font-mono shrink-0">
                        {totalWeight.toFixed(2)}%
                    </div>
                )}
                {visibleColumns.quantity && (
                    <div className="w-16 shrink-0"></div>
                )}
                {visibleColumns.period && (
                    <div className="w-[110px] text-right text-[10px] text-gray-600 font-mono shrink-0">
                        {dateRangeString}
                    </div>
                )}
                {visibleColumns.progress && (
                    <div className="w-20 flex items-center justify-end shrink-0 gap-1 pr-1">
                        <span className="w-[45px] text-right text-xs text-blue-700 font-bold font-mono">
                            {avgProgress.toFixed(0)}%
                        </span>
                        <div className="w-[22px]"></div>
                    </div>
                )}
            </div>

            {/* Right Side Content (Grid, Charts, etc.) */}
            {children}
        </div>
    );
};
