import { differenceInDays, format, isSameDay, parseISO } from 'date-fns';

export const parseDate = (dateStr: string): Date => {
  if (!dateStr) return new Date(NaN);
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    return new Date(year, month, day);
  }
  return parseISO(dateStr);
};

export const isWeekend = (date: Date) => {
  const day = date.getDay();
  return day === 0 || day === 6;
};

export const isToday = (date: Date) => isSameDay(date, new Date());

export const formatDateTH = (dateStr: string | Date | undefined | null) => {
  if (!dateStr) return '-';
  const date = typeof dateStr === 'string' ? parseDate(dateStr) : dateStr;
  if (isNaN(date.getTime())) return '-';
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  return `${day}/${month}`;
};

export const formatDateRange = (startStr: string | Date | undefined | null, endStr: string | Date | undefined | null) => {
  if (!startStr || !endStr) return '-';

  const start = typeof startStr === 'string' ? parseDate(startStr) : startStr;
  const end = typeof endStr === 'string' ? parseDate(endStr) : endStr;

  if (isNaN(start.getTime()) || isNaN(end.getTime())) return '-';

  const diff = differenceInDays(end, start) + 1;
  return `${formatDateTH(start)} - ${formatDateTH(end)} (${diff}d)`;
};
