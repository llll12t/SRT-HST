import React from 'react';
import { format, isToday, isWeekend } from 'date-fns';
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
        planDuration?: boolean;
        actualDuration?: boolean;
    };
    hideSidebar?: boolean;
}

export default function TimelineHeader({
    viewMode,
    timeline,
    config,
    stickyWidth,
    visibleColumns,
    hideSidebar = false
}: TimelineHeaderProps) {
    const commonHeaderClass = "text-xs font-semibold text-gray-700 h-full border-l border-gray-200 bg-gray-50/80 flex items-center";

    return (
        <div className="sticky top-0 z-[60] flex bg-white border-b border-gray-200 shadow-sm h-12">
            {/* Sticky Left Corner - Fixed Height to match Timeline height (h-12) */}
            {!hideSidebar && (
                <div className="sticky left-0 z-[70] bg-white border-r border-gray-200 flex items-center h-full"
                    style={{ width: `${stickyWidth}px`, minWidth: `${stickyWidth}px` }}>
                    <div className="flex-1 px-4 text-xs font-bold text-gray-900 truncate">
                        รายชื่อโครงการ
                    </div>
                    {visibleColumns && (
                        <div className="flex items-center h-full">
                            {visibleColumns.cost && (
                                <div className={`w-20 justify-end px-2 ${commonHeaderClass}`}>
                                    งบประมาณ
                                </div>
                            )}
                            {visibleColumns.weight && (
                                <div className={`w-16 justify-end px-2 ${commonHeaderClass}`}>
                                    น้ำหนัก
                                </div>
                            )}
                            {visibleColumns.quantity && (
                                <div className={`w-20 justify-start pl-2 ${commonHeaderClass}`}>
                                    ปริมาณ
                                </div>
                            )}
                            {visibleColumns.planDuration && (
                                <div className={`w-[60px] justify-end px-1 ${commonHeaderClass}`}>
                                    แผน(วัน)
                                </div>
                            )}
                            {visibleColumns.actualDuration && (
                                <div className={`w-[60px] justify-end px-1 ${commonHeaderClass}`}>
                                    จริง(วัน)
                                </div>
                            )}
                            {visibleColumns.period && (
                                <div className={`w-[130px] justify-start pl-2 ${commonHeaderClass}`}>
                                    ระยะเวลา
                                </div>
                            )}
                            {visibleColumns.progress && (
                                <div className={`w-20 justify-start pl-2 ${commonHeaderClass}`}>
                                    สถานะ
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Timeline Headers */}
            <div className="flex flex-col h-full flex-1 relative overflow-hidden">
                {/* Top Row: Groups (Months/Years) */}
                <div className="flex h-6 border-b border-gray-200">
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
                            if (viewMode === 'month') {
                                const monthsInYear = timeline.items.filter(m => m.getFullYear() === group.getFullYear()).length;
                                width = monthsInYear * config.cellWidth;
                            } else {
                                width = 12 * config.cellWidth;
                            }
                        }

                        return (
                            <div key={idx} className="flex items-center justify-center px-2 text-[10px] font-bold text-gray-600 bg-gray-50 border-r border-gray-200 truncate"
                                style={{ width: `${width}px`, minWidth: `${width}px` }}>
                                {format(group, timeline.groupFormat, { locale: th })}
                            </div>
                        );
                    })}
                </div>
                {/* Bottom Row: Items (Days/Weeks/Months) */}
                <div className="flex h-6">
                    {timeline.items.map((item, idx) => {
                        const isTodayDay = viewMode === 'day' && isToday(item);
                        const isWeekendDay = viewMode === 'day' && isWeekend(item);

                        let label = '';
                        if (viewMode === 'day') label = format(item, 'd');
                        else if (viewMode === 'week') label = format(item, 'w');
                        else label = format(item, 'MMM', { locale: th });

                        return (
                            <div key={idx} className={`flex-shrink-0 border-r border-gray-100 flex items-center justify-center text-[10px] 
                                ${isTodayDay ? 'bg-blue-600 text-white font-bold' : isWeekendDay ? 'bg-gray-50 text-gray-400' : 'text-gray-500 bg-white'}
                                `} style={{ width: config.cellWidth }}>
                                {label}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
