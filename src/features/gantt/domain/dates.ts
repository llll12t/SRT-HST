/**
 * Gantt-specific date helpers - delegates to the central dateUtils library.
 * This file is kept for backwards compatibility with existing Gantt imports.
 */

import { differenceInCalendarDays, isSameDay } from 'date-fns';
import { parseLocalDate, formatDateShort, formatDateRange, todayLocal } from '@/lib/dateUtils';

export { parseLocalDate as parseDate, formatDateShort as formatDateTH, formatDateRange };

export const isWeekend = (date: Date): boolean => {
  const day = date.getDay();
  return day === 0 || day === 6;
};

export const isToday = (date: Date): boolean => isSameDay(date, todayLocal());
