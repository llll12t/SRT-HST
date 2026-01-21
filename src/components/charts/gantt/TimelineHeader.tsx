import React from 'react';
import { format, eachDayOfInterval, isToday, isWeekend, startOfMonth, endOfMonth } from 'date-fns';
import { th } from 'date-fns/locale';
import { ViewMode, GanttConfig } from './types';

interface TimelineHeaderProps {
    viewMode: ViewMode;
    timeline: {
        items: Date[];
        groups: Date[];
        groupFormat: string;
        itemFormat: string;
    };
    config: GanttConfig;
    stickyWidth: number;
    showDates: boolean;
    visibleColumns?: {
        cost: boolean;
        weight: boolean;
        quantity: boolean;
        period: boolean;
        progress: boolean;
    };
    hideSidebar?: boolean;
}

export default function TimelineHeader({
    viewMode,
    timeline,
    config,
    stickyWidth,
    showDates,
    visibleColumns,
    hideSidebar = false
}: TimelineHeaderProps) {
    return (
        <div className="sticky top-0 z-30 flex bg-white border-b border-gray-300">
            {/* Sticky Left Corner */}
            {!hideSidebar && (
                <div className="sticky left-0 z-40 bg-gray-50 border-r border-gray-300 flex items-end pb-2 px-4 shadow-[1px_0_0px_rgba(0,0,0,0.05)] h-12"
                    style={{ width: `${stickyWidth}px`, minWidth: `${stickyWidth}px` }}>
                    <div className="flex-1 text-[11px] font-bold text-gray-800 uppercase tracking-wide">Task Name</div>
                    {visibleColumns && (
                        <>
                            {visibleColumns.cost && <div className="w-20 text-right text-[11px] font-bold text-gray-800 uppercase tracking-wide shrink-0">Cost</div>}
                            {visibleColumns.weight && <div className="w-14 text-right text-[11px] font-bold text-gray-800 uppercase tracking-wide shrink-0">Weight</div>}
                            {visibleColumns.quantity && <div className="w-16 text-right text-[11px] font-bold text-gray-800 uppercase tracking-wide shrink-0">Q'ty</div>}
                            {visibleColumns.period && <div className="w-[110px] text-right text-[11px] font-bold text-gray-800 uppercase tracking-wide shrink-0">Period</div>}
                            {visibleColumns.progress && <div className="w-20 text-right text-[11px] font-bold text-gray-800 uppercase tracking-wide shrink-0">%Prog</div>}
                        </>
                    )}
                    {!visibleColumns && showDates && (
                        <>
                            <div className="w-20 text-right text-[11px] font-bold text-gray-800 uppercase tracking-wide shrink-0">Cost</div>
                            <div className="w-14 text-right text-[11px] font-bold text-gray-800 uppercase tracking-wide shrink-0">Weight</div>
                            <div className="w-16 text-right text-[11px] font-bold text-gray-800 uppercase tracking-wide shrink-0">Q'ty</div>
                            <div className="w-[110px] text-right text-[11px] font-bold text-gray-800 uppercase tracking-wide shrink-0">Period</div>
                            <div className="w-20 text-right text-[11px] font-bold text-gray-800 uppercase tracking-wide shrink-0">%Prog</div>
                        </>
                    )}

                </div>
            )}

            {/* Timeline Headers */}
            <div className="flex flex-col h-12 bg-white relative">
                <div className="flex h-6 border-b border-gray-300">
                    {timeline.groups.map((group, idx) => {
                        let width = 0;
                        if (viewMode === 'day') {
                            const daysInMonth = timeline.items.filter(item =>
                                item.getMonth() === group.getMonth() &&
                                item.getFullYear() === group.getFullYear()
                            ).length;
                            width = daysInMonth * config.cellWidth;
                        } else if (viewMode === 'week') {
                            const weeksInMonth = timeline.items.filter(item =>
                                item.getMonth() === group.getMonth() &&
                                item.getFullYear() === group.getFullYear()
                            ).length;
                            width = weeksInMonth * config.cellWidth;
                        } else {
                            width = 12 * config.cellWidth;
                            if (viewMode === 'month') {
                                const monthsInYear = timeline.items.filter(m => m.getFullYear() === group.getFullYear()).length;
                                width = monthsInYear * config.cellWidth;
                            }
                        }

                        return (
                            <div key={idx} className="flex items-center justify-center px-1 text-[10px] font-bold text-gray-700 bg-gray-100 border-r border-gray-300 truncate"
                                style={{ width: `${width}px`, minWidth: `${width}px` }}>
                                {format(group, timeline.groupFormat, { locale: th })}
                            </div>
                        );
                    })}
                </div>
                <div className="flex h-6">
                    {timeline.items.map((item, idx) => {
                        const isTodayDay = viewMode === 'day' && isToday(item);
                        const isWeekendDay = viewMode === 'day' && isWeekend(item);

                        let label = '';
                        if (viewMode === 'day') label = format(item, 'd');
                        else if (viewMode === 'week') label = format(item, 'w');
                        else label = format(item, 'MMM', { locale: th });

                        return (
                            <div key={idx} className={`flex-shrink-0 border-r border-gray-200 flex items-center justify-center text-[10px] ${isTodayDay ? 'bg-blue-600 text-white font-bold' : isWeekendDay ? 'bg-gray-50 text-gray-500' : 'text-gray-600'
                                }`} style={{ width: config.cellWidth }}>
                                {label}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
