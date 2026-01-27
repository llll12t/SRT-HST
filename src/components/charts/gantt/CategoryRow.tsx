import React from 'react';
import { ChevronRight, ChevronDown, Plus, GripVertical } from 'lucide-react';
import { format } from 'date-fns';
import { Task } from '@/types/construction';
import { VisibleColumns, GanttConfig, ViewMode, DateRange, ColorMenuConfig } from './types';
import { getCategorySummary, getCategoryBarStyle, isWeekend, formatDateRange } from './utils';

interface CategoryRowProps {
    category: string;
    catData: { tasks: Task[]; subcategories: Record<string, any> }; // Use proper type if available
    collapsedCategories: Set<string>;
    toggleCategory: (category: string) => void;
    categoryColors: Record<string, string>;
    setActiveColorMenu: (config: ColorMenuConfig) => void;
    onAddTaskToCategory?: (category: string, subcategory?: string) => void;
    visibleColumns: VisibleColumns;
    stickyWidth: number;
    timeline: { items: Date[] }; // Check strict type
    config: GanttConfig;
    viewMode: ViewMode;
    timeRange: DateRange;
    getTaskWeight: (task: Task) => number;
    // Drag handlers for category reordering
    onCategoryDragStart?: (e: React.DragEvent, category: string) => void;
    onCategoryDragOver?: (e: React.DragEvent) => void;
    onCategoryDrop?: (e: React.DragEvent, category: string) => void;
    isDragging?: boolean;
    loadingIds?: Set<string>;
}

export const CategoryRow: React.FC<CategoryRowProps> = ({
    category,
    catData,
    collapsedCategories,
    toggleCategory,
    categoryColors,
    setActiveColorMenu,
    onAddTaskToCategory,
    visibleColumns,
    stickyWidth,
    timeline,
    config,
    viewMode,
    timeRange,
    getTaskWeight,
    onCategoryDragStart,
    onCategoryDragOver,
    onCategoryDrop,
    isDragging,
    loadingIds
}) => {
    const isCollapsed = collapsedCategories.has(category);
    // Combine all tasks for summary
    const allCatTasks = [
        ...catData.tasks,
        ...Object.values(catData.subcategories).flatMap((sub: any) => [
            ...sub.tasks,
            ...Object.values(sub.subsubcategories || {}).flat()
        ])
    ] as Task[];

    const categorySummary = getCategorySummary(allCatTasks as Task[], getTaskWeight);

    // Check if any task in this category is loading
    const isCategoryLoading = loadingIds && allCatTasks.some(t => loadingIds.has(t.id));

    return (
        <div key={category}>
            {/* Category Header */}
            <div
                className={`flex bg-white border-b border-dashed border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors h-8 group ${isDragging ? 'opacity-40 bg-blue-50' : ''}`}
                onClick={() => toggleCategory(category)}
                draggable={!!onCategoryDragStart}
                onDragStart={(e) => onCategoryDragStart?.(e, category)}
                onDragOver={(e) => onCategoryDragOver?.(e)}
                onDrop={(e) => onCategoryDrop?.(e, category)}
            >
                <div className="sticky left-0 z-[60] bg-white group-hover:bg-gray-50 border-r border-gray-300 px-2 shadow-[1px_0_0px_rgba(0,0,0,0.05)] flex items-center gap-1"
                    style={{ width: `${stickyWidth}px`, minWidth: `${stickyWidth}px` }}>

                    {/* Drag Handle */}
                    {onCategoryDragStart && (
                        <div
                            className="cursor-move text-gray-300 hover:text-gray-500 p-0.5"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <GripVertical className="w-3.5 h-3.5" />
                        </div>
                    )}

                    {/* Collapse Button */}
                    <div className="w-4 flex justify-center">
                        <button className="p-0.5 hover:bg-gray-200 rounded-sm transition-colors text-gray-500">
                            {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                    </div>

                    {/* Color Picker for Category */}
                    <button
                        className="w-3 h-3 rounded-full border border-gray-300 hover:scale-110 transition-transform shadow-sm flex-shrink-0"
                        style={{ backgroundColor: categoryColors[category] || '#3b82f6' }}
                        onClick={(e) => {
                            e.stopPropagation();
                            const rect = e.currentTarget.getBoundingClientRect();
                            setActiveColorMenu({
                                id: category,
                                type: 'category',
                                top: rect.bottom + window.scrollY,
                                left: rect.left + window.scrollX
                            });
                        }}
                        title="Change Category Color"
                    />

                    <div className="flex-1 truncate text-xs font-bold text-gray-900 uppercase tracking-wide group/cat-header flex items-center" title={category}>
                        {category}
                        {/* Loading Indicator */}
                        {isCategoryLoading && (
                            <div className="ml-2">
                                <svg className="animate-spin h-3 w-3 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                            </div>
                        )}
                        <span className="ml-2 text-[9px] text-gray-500 font-normal bg-gray-100 px-1.5 rounded-full">{categorySummary.count}</span>
                        {onAddTaskToCategory && (
                            <button
                                className="ml-2 p-0.5 hover:bg-blue-100 rounded-sm transition-colors text-blue-500 opacity-0 group-hover/cat-header:opacity-100"
                                onClick={(e) => { e.stopPropagation(); onAddTaskToCategory(category); }}
                                title="Add Task to Category"
                            >
                                <Plus className="w-3 h-3" />
                            </button>
                        )}
                    </div>

                    {/* Columns */}
                    {visibleColumns.cost && (
                        <div className="w-20 text-right text-xs text-gray-900 font-bold font-mono shrink-0">
                            {categorySummary.totalCost.toLocaleString()}
                        </div>
                    )}
                    {visibleColumns.weight && (
                        <div className="w-14 text-right text-xs text-gray-900 font-bold font-mono shrink-0">
                            {categorySummary.totalWeight.toFixed(2)}%
                        </div>
                    )}
                    {visibleColumns.quantity && (
                        <div className="w-16 shrink-0"></div>
                    )}
                    {visibleColumns.period && (
                        <div className="w-[110px] text-right text-[10px] text-gray-600 font-mono shrink-0">
                            {categorySummary.dateRange ? (
                                formatDateRange(categorySummary.dateRange.start, categorySummary.dateRange.end)
                            ) : '-'}
                        </div>
                    )}
                    {visibleColumns.progress && (
                        <div className="w-20 flex items-center justify-end shrink-0 gap-1 pr-1">
                            <span className="w-[45px] text-right text-xs text-blue-700 font-bold font-mono">
                                {categorySummary.avgProgress.toFixed(0)}%
                            </span>
                            <div className="w-[22px]"></div>
                        </div>
                    )}
                </div>

                {/* Category Summary Bar on Chart */}
                <div className="flex-1 bg-white relative" style={{ width: `${timeline.items.length * config.cellWidth}px` }}>
                    {/* Grid lines background */}
                    <div className="absolute inset-0 flex pointer-events-none">
                        {timeline.items.map((item, idx) => (
                            <div key={idx} className={`flex-shrink-0 border-r border-dashed border-gray-200 h-full ${viewMode === 'day' && isWeekend(item) ? 'bg-gray-50/50' : ''
                                }`}
                                style={{ width: config.cellWidth }} />
                        ))}
                    </div>

                    {/* Summary Bar */}
                    {categorySummary.dateRange && (
                        <div
                            className="absolute h-3 top-[10px] rounded-full border border-gray-400/30"
                            style={{
                                ...getCategoryBarStyle(categorySummary.dateRange, viewMode, config, timeRange),
                                backgroundColor: categoryColors[category] ? `${categoryColors[category]}40` : 'rgba(209, 213, 219, 0.5)',
                                zIndex: 30
                            }}
                        >
                            <div
                                className="absolute left-0 top-0 bottom-0 rounded-full"
                                style={{
                                    width: `${categorySummary.avgProgress}%`,
                                    backgroundColor: categoryColors[category] || '#3b82f6',
                                    opacity: 0.8
                                }}
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
