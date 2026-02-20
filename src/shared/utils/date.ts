/**
 * Shared date utilities - single import point for the whole app.
 * All implementations live in @/lib/dateUtils.ts
 */
export {
    parseLocalDate,
    todayISO,
    todayLocal,
    formatDateShort,
    formatDateLong,
    formatDateThai,
    formatToISO,
    formatDateRange,
    calcDurationDays,
    addDaysToISO,
    isISOToday,
    isOverdue,
} from '@/lib/dateUtils';

// Backward-compatible alias — keeps existing imports working
export { parseLocalDate as parseDate } from '@/lib/dateUtils';
// Backward-compatible alias for formatDateTH used in gantt/scurve features
export { formatDateShort as formatDateTH } from '@/lib/dateUtils';

