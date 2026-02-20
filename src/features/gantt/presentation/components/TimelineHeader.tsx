import React from 'react';
import { format, isSameDay } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { ViewMode, GanttConfig, VisibleColumns } from './types';

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
    referenceDate?: Date | null;
    visibleColumns?: VisibleColumns;
    hideSidebar?: boolean;
    employeeColumnWidth?: number;
    isFourWeekView?: boolean;
    isProcurementMode?: boolean;
}

export default function TimelineHeader({
    viewMode,
    timeline,
    config,
    stickyWidth,
    referenceDate,
    visibleColumns,
    hideSidebar = false,
    employeeColumnWidth = 92,
    isFourWeekView = false,
    isProcurementMode = false
}: TimelineHeaderProps) {
    const commonHeaderClass = 'text-xs font-semibold text-gray-700 h-full border-l border-gray-200 bg-gray-50/80 flex items-center';
    const timelineWidth = timeline.items.length * config.cellWidth;

    return (
        <div className="sticky top-0 z-[60] flex bg-white border-b border-gray-200 shadow-sm h-12">
            {!hideSidebar && (
                <div
                    className="sticky left-0 z-[70] bg-white border-r border-gray-200 flex items-center h-full"
                    style={{ width: `${stickyWidth}px`, minWidth: `${stickyWidth}px` }}
                >
                    <div className="flex-1 px-4 text-xs font-bold text-gray-900 truncate">Project List</div>
                    {visibleColumns && (
                        <div className="flex items-center h-full">
                            {visibleColumns.cost && <div className={`w-20 justify-end px-2 ${commonHeaderClass}`}>Budget</div>}
                            {visibleColumns.weight && <div className={`w-16 justify-end px-2 ${commonHeaderClass}`}>Weight</div>}
                            {visibleColumns.quantity && <div className={`w-20 justify-start pl-2 ${commonHeaderClass}`}>Quantity</div>}
                            {isProcurementMode && visibleColumns.dueProcurement && <div className={`w-[78px] justify-start pl-2 ${commonHeaderClass}`}>Due Proc.</div>}
                            {isProcurementMode && visibleColumns.dueMaterialOnSite && <div className={`w-[78px] justify-start pl-2 ${commonHeaderClass}`}>On Site</div>}
                            {isProcurementMode && visibleColumns.dateOfUse && <div className={`w-[78px] justify-start pl-2 ${commonHeaderClass}`}>Use Date</div>}
                            {isProcurementMode && visibleColumns.duration && <div className={`w-[62px] justify-end px-2 ${commonHeaderClass}`}>Duration</div>}
                            {isProcurementMode && visibleColumns.procurementStatus && <div className={`w-[96px] justify-start pl-2 ${commonHeaderClass}`}>Proc. Status</div>}
                            {visibleColumns.planDuration && <div className={`w-[60px] justify-end px-1 ${commonHeaderClass}`}>Plan (d)</div>}
                            {visibleColumns.actualDuration && <div className={`w-[60px] justify-end px-1 ${commonHeaderClass}`}>Actual (d)</div>}
                            {visibleColumns.period && <div className={`w-[150px] justify-start pl-2 ${commonHeaderClass}`}>Period</div>}
                            {visibleColumns.team && (
                                <div
                                    className={`justify-center ${commonHeaderClass}`}
                                    style={{ width: `${employeeColumnWidth}px`, minWidth: `${employeeColumnWidth}px` }}
                                >
                                    Team
                                </div>
                            )}
                            {visibleColumns.progress && <div className={`w-20 justify-start pl-2 ${commonHeaderClass}`}>Status</div>}
                        </div>
                    )}
                </div>
            )}

            <div className="flex flex-col h-full flex-none relative overflow-hidden" style={{ width: `${timelineWidth}px`, minWidth: `${timelineWidth}px` }}>
                <div className="flex h-6 border-b border-gray-200">
                    {isFourWeekView && viewMode === 'day' ? (
                        ['Last Week', 'This Week', 'Next Week', '2 Next Week'].map((label, idx) => (
                            <div
                                key={label}
                                className={`box-border flex items-center justify-center px-2 text-[11px] font-bold border-r border-slate-300/35 truncate ${idx === 0 ? 'bg-sky-100 text-sky-800' : idx === 1 ? 'bg-rose-100 text-rose-800' : idx === 2 ? 'bg-emerald-100 text-emerald-800' : 'bg-violet-100 text-violet-800'}`}
                                style={{ width: `${7 * config.cellWidth}px`, minWidth: `${7 * config.cellWidth}px` }}
                            >
                                {label}
                            </div>
                        ))
                    ) : (
                        timeline.groups.map((group, idx) => {
                            let width = 0;
                            if (viewMode === 'day') {
                                const daysInMonth = timeline.items.filter(item => item.getMonth() === group.getMonth() && item.getFullYear() === group.getFullYear()).length;
                                width = daysInMonth * config.cellWidth;
                            } else if (viewMode === 'week') {
                                const weeksInMonth = timeline.items.filter(item => item.getMonth() === group.getMonth() && item.getFullYear() === group.getFullYear()).length;
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
                                <div
                                    key={idx}
                                    className="box-border flex items-center justify-center px-2 text-[10px] font-bold text-gray-600 bg-gray-50 border-r border-gray-200 truncate"
                                    style={{ width: `${width}px`, minWidth: `${width}px` }}
                                >
                                    {format(group, timeline.groupFormat, { locale: enUS })}
                                </div>
                            );
                        })
                    )}
                </div>

                <div className="flex h-6">
                    {timeline.items.map((item, idx) => {
                        const effectiveReferenceDate = referenceDate || new Date();
                        const isTodayDay = viewMode === 'day' && isSameDay(item, effectiveReferenceDate);
                        const isSaturday = viewMode === 'day' && item.getDay() === 6;
                        const isSunday = viewMode === 'day' && item.getDay() === 0;

                        let label = '';
                        if (viewMode === 'day') label = format(item, 'd');
                        else if (viewMode === 'week') {
                            const weekInMonth = timeline.items
                                .slice(0, idx + 1)
                                .filter(week => week.getMonth() === item.getMonth() && week.getFullYear() === item.getFullYear()).length;
                            label = String(weekInMonth);
                        } else label = format(item, 'MMM', { locale: enUS });

                        return (
                            <div
                                key={idx}
                                className={`flex-shrink-0 box-border border-r border-gray-100 flex items-center justify-center text-[10px] ${isTodayDay ? 'bg-blue-600 text-white font-bold' : (isFourWeekView && viewMode === 'day') ? 'text-gray-600' : isSaturday ? 'bg-violet-50 text-violet-500' : isSunday ? 'bg-red-50 text-red-500' : 'text-gray-500 bg-white'} ${isFourWeekView && viewMode === 'day' ? `${Math.floor(idx / 7) % 4 === 0 ? 'bg-sky-50' : Math.floor(idx / 7) % 4 === 1 ? 'bg-rose-50' : Math.floor(idx / 7) % 4 === 2 ? 'bg-emerald-50' : 'bg-violet-50'} border-slate-300/35` : ''} ${viewMode === 'week' ? `${idx % 2 === 0 ? 'bg-slate-50/90' : 'bg-white'} border-gray-300` : ''}`}
                                style={{ width: config.cellWidth }}
                            >
                                {label}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
