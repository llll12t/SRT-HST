/**
 * @file dateUtils.ts
 * Centralized, timezone-safe date utilities for SRT-HST App.
 *
 * CRITICAL: All date strings in the DB are stored as "YYYY-MM-DD" (ISO Local).
 * DO NOT use `new Date('YYYY-MM-DD')` because it is parsed as UTC midnight,
 * which shifts one day back in UTC+7 (Thailand) timezone.
 *
 * ALWAYS use the helpers in this file.
 */

import { format, parseISO, differenceInCalendarDays, addDays, isValid } from 'date-fns';

// ──────────────────────────────────────────────
// PARSING
// ──────────────────────────────────────────────

/**
 * Safely parse a "YYYY-MM-DD" string to a LOCAL Date object.
 * Avoids the UTC-midnight timezone shift bug inherent in `new Date('YYYY-MM-DD')`.
 */
export function parseLocalDate(dateStr: string | null | undefined): Date | null {
    if (!dateStr) return null;
    // Try YYYY-MM-DD (most common in our DB)
    const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
        const year = parseInt(isoMatch[1], 10);
        const month = parseInt(isoMatch[2], 10) - 1; // 0-indexed
        const day = parseInt(isoMatch[3], 10);
        const d = new Date(year, month, day);
        return isValid(d) ? d : null;
    }
    // Try DD/MM/YYYY (Thai display format)
    const thaiMatch = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (thaiMatch) {
        const day = parseInt(thaiMatch[1], 10);
        const month = parseInt(thaiMatch[2], 10) - 1;
        const year = parseInt(thaiMatch[3], 10);
        const d = new Date(year, month, day);
        return isValid(d) ? d : null;
    }
    // Try DD/MM/YY (short Thai display format)
    const shortThaiMatch = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
    if (shortThaiMatch) {
        const day = parseInt(shortThaiMatch[1], 10);
        const month = parseInt(shortThaiMatch[2], 10) - 1;
        const year = 2000 + parseInt(shortThaiMatch[3], 10);
        const d = new Date(year, month, day);
        return isValid(d) ? d : null;
    }
    return null;
}

// ──────────────────────────────────────────────
// TODAY / NOW
// ──────────────────────────────────────────────

/**
 * Returns today's date as a local "YYYY-MM-DD" string.
 * Replaces: `new Date().toISOString().split('T')[0]` (which uses UTC day).
 */
export function todayISO(): string {
    const now = new Date();
    return format(now, 'yyyy-MM-dd');
}

/**
 * Returns a new Date object representing local midnight today.
 * Replaces: `new Date()` when used for date-only comparisons.
 */
export function todayLocal(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// ──────────────────────────────────────────────
// FORMATTING (Display)
// ──────────────────────────────────────────────

/**
 * Format a date string or Date to "dd/MM/yy" (Thai short format, e.g. 15/01/25).
 * Replaces: ad-hoc formatDateTH functions scattered across files.
 */
export function formatDateShort(dateStr: string | Date | null | undefined): string {
    if (!dateStr) return '-';
    const d = typeof dateStr === 'string' ? parseLocalDate(dateStr) : dateStr;
    if (!d || !isValid(d)) return '-';
    return format(d, 'dd/MM/yy');
}

/**
 * Format a date string or Date to "dd/MM/yyyy" (Thai long format).
 */
export function formatDateLong(dateStr: string | Date | null | undefined): string {
    if (!dateStr) return '-';
    const d = typeof dateStr === 'string' ? parseLocalDate(dateStr) : dateStr;
    if (!d || !isValid(d)) return '-';
    return format(d, 'dd/MM/yyyy');
}

/**
 * Format a date string or Date to full Thai month name, e.g. "15 มกราคม 2568".
 * Uses Buddhist Era (BE) year.
 */
export function formatDateThai(dateStr: string | Date | null | undefined): string {
    if (!dateStr) return '-';
    const d = typeof dateStr === 'string' ? parseLocalDate(dateStr) : dateStr;
    if (!d || !isValid(d)) return '-';

    const THAI_MONTHS = [
        'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน',
        'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม',
        'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
    ];
    const day = d.getDate().toString().padStart(2, '0');
    const month = THAI_MONTHS[d.getMonth()];
    const yearBE = d.getFullYear() + 543;
    return `${day} ${month} ${yearBE}`;
}

/**
 * Format to "YYYY-MM-DD" for saving to Firestore / input[type=date] values.
 * Replaces: `date.toISOString().split('T')[0]`
 */
export function formatToISO(date: Date | null | undefined): string {
    if (!date || !isValid(date)) return '';
    return format(date, 'yyyy-MM-dd');
}

/**
 * Format a date range: "dd/MM - dd/MM (Nd)"
 */
export function formatDateRange(
    startStr: string | Date | null | undefined,
    endStr: string | Date | null | undefined
): string {
    const start = typeof startStr === 'string' ? parseLocalDate(startStr) : startStr;
    const end = typeof endStr === 'string' ? parseLocalDate(endStr) : endStr;
    if (!start || !end || !isValid(start) || !isValid(end)) return '-';
    const diff = differenceInCalendarDays(end, start) + 1;
    return `${formatDateShort(start)} - ${formatDateShort(end)} (${diff}d)`;
}

// ──────────────────────────────────────────────
// ARITHMETIC
// ──────────────────────────────────────────────

/**
 * Calculate duration in calendar days between two "YYYY-MM-DD" strings (inclusive).
 * Returns 0 if either date is missing/invalid.
 */
export function calcDurationDays(
    startStr: string | null | undefined,
    endStr: string | null | undefined
): number {
    if (!startStr || !endStr) return 0;
    const start = parseLocalDate(startStr);
    const end = parseLocalDate(endStr);
    if (!start || !end) return 0;
    return Math.max(0, differenceInCalendarDays(end, start) + 1);
}

/**
 * Add N days to a "YYYY-MM-DD" string and return the new "YYYY-MM-DD".
 */
export function addDaysToISO(dateStr: string, days: number): string {
    const d = parseLocalDate(dateStr);
    if (!d) return dateStr;
    return formatToISO(addDays(d, days));
}

// ──────────────────────────────────────────────
// COMPARISONS
// ──────────────────────────────────────────────

/**
 * Check if a date string is today (local).
 */
export function isISOToday(dateStr: string | null | undefined): boolean {
    if (!dateStr) return false;
    return dateStr === todayISO();
}

/**
 * Check if a date string represents a past date (before today, local).
 */
export function isOverdue(
    dateStr: string | null | undefined,
    progress: number = 0
): boolean {
    if (!dateStr || progress >= 100) return false;
    return dateStr < todayISO();
}
