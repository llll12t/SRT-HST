import { useMemo } from 'react';
import {
    startOfMonth,
    endOfMonth,
    addMonths,
    eachDayOfInterval,
    eachWeekOfInterval,
    eachMonthOfInterval,
    eachYearOfInterval
} from 'date-fns';
import { parseDate } from '../utils';
import { ViewMode, GanttConfig } from '../types';

interface UseGanttTimelineProps {
    startDate?: string;
    endDate?: string;
    viewMode: ViewMode;
    containerWidth: number;
}

export function useGanttTimeline({ startDate, endDate, viewMode, containerWidth }: UseGanttTimelineProps) {
    // 1. Calculate range based on Project Start/End
    const timeRange = useMemo(() => {
        let pStart = startDate ? parseDate(startDate) : startOfMonth(new Date());
        let pEnd = endDate ? parseDate(endDate) : endOfMonth(addMonths(new Date(), 12));

        if (isNaN(pStart.getTime())) pStart = startOfMonth(new Date());
        if (isNaN(pEnd.getTime())) pEnd = endOfMonth(addMonths(new Date(), 12));

        return {
            start: pStart,
            end: pEnd
        };
    }, [startDate, endDate]);

    // 2. Generate timeline items
    const timeline = useMemo(() => {
        if (viewMode === 'day') {
            const days = eachDayOfInterval({ start: timeRange.start, end: timeRange.end });
            const months = eachMonthOfInterval({ start: timeRange.start, end: timeRange.end });
            return { items: days, groups: months, groupFormat: 'MMMM yyyy', itemFormat: 'd' };
        } else if (viewMode === 'week') {
            const weeks = eachWeekOfInterval({ start: timeRange.start, end: timeRange.end }, { weekStartsOn: 1 });
            const months = eachMonthOfInterval({ start: timeRange.start, end: timeRange.end });
            return { items: weeks, groups: months, groupFormat: 'MMMM yyyy', itemFormat: 'w' };
        } else {
            const months = eachMonthOfInterval({ start: timeRange.start, end: timeRange.end });
            const years = eachYearOfInterval({ start: timeRange.start, end: timeRange.end });
            return { items: months, groups: years, groupFormat: 'yyyy', itemFormat: 'MMM' };
        }
    }, [viewMode, timeRange]);

    // 3. Configuration with Auto-Fit
    const config = useMemo(() => {
        let base;
        switch (viewMode) {
            case 'day': base = { cellWidth: 30, label: 'วัน' }; break;
            case 'week': base = { cellWidth: 40, label: 'สัปดาห์' }; break;
            case 'month': base = { cellWidth: 100, label: 'เดือน' }; break;
            default: base = { cellWidth: 40, label: 'สัปดาห์' };
        }

        if (containerWidth > 0 && timeline.items.length > 0) {
            const totalRequired = timeline.items.length * base.cellWidth;
            if (totalRequired < containerWidth) {
                const fitWidth = (containerWidth - 2) / timeline.items.length;
                return { ...base, cellWidth: Math.max(base.cellWidth, fitWidth) };
            }
        }
        return base;
    }, [viewMode, containerWidth, timeline.items.length]);

    return {
        timeRange,
        timeline,
        config
    };
}
