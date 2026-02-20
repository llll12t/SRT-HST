export interface GoogleSheetExpense {
    date: string;
    description: string;
    amount: number;
    projectCode?: string; // Optional: to map to specific projects if multi-project sheet
}

export interface GoogleSheetProjectActualExpense {
    projectCode: string;
    projectName: string;
    actualExpense: number;
    costCode?: string;
    costName?: string;
}

export interface CostCodeColumnMapping {
    costCode: string;
    costName: string;
    column: string; // e.g. "L", "AB"
}

function formatDateParts(year: number, month: number, day: number): string {
    return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

function normalizeGoogleSheetDate(raw: string): string {
    const value = raw.trim().replace(/^"|"$/g, '');
    if (!value) return '';

    const isoMatch = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (isoMatch) {
        const year = Number(isoMatch[1]);
        const month = Number(isoMatch[2]);
        const day = Number(isoMatch[3]);
        const date = new Date(year, month - 1, day);
        const isSame =
            date.getFullYear() === year &&
            date.getMonth() === month - 1 &&
            date.getDate() === day;
        return isSame ? formatDateParts(year, month, day) : '';
    }

    const slashMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (slashMatch) {
        const day = Number(slashMatch[1]);
        const month = Number(slashMatch[2]);
        const yearRaw = Number(slashMatch[3]);
        const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
        const date = new Date(year, month - 1, day);
        const isSame =
            date.getFullYear() === year &&
            date.getMonth() === month - 1 &&
            date.getDate() === day;
        return isSame ? formatDateParts(year, month, day) : '';
    }

    const numericValue = Number(value);
    if (!Number.isNaN(numericValue) && Number.isFinite(numericValue) && numericValue > 0) {
        // Google Sheets serial date epoch: 1899-12-30
        const epoch = Date.UTC(1899, 11, 30);
        const millis = epoch + Math.floor(numericValue) * 24 * 60 * 60 * 1000;
        const date = new Date(millis);
        const year = date.getUTCFullYear();
        const month = date.getUTCMonth() + 1;
        const day = date.getUTCDate();
        return formatDateParts(year, month, day);
    }

    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
        return formatDateParts(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
    }

    return '';
}

function parseAmount(raw: string): number {
    const cleaned = raw.replace(/[^0-9.-]/g, '');
    return parseFloat(cleaned);
}

function columnLabelToIndex(columnLabel: string): number {
    const normalized = columnLabel.trim().toUpperCase();
    if (!/^[A-Z]+$/.test(normalized)) {
        return -1;
    }

    let index = 0;
    for (let i = 0; i < normalized.length; i++) {
        index = index * 26 + (normalized.charCodeAt(i) - 64);
    }
    return index - 1;
}

function parseCsvLine(line: string): string[] {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];

        if (char === '"' && inQuotes && nextChar === '"') {
            current += '"';
            i++;
            continue;
        }

        if (char === '"') {
            inQuotes = !inQuotes;
            continue;
        }

        if (char === ',' && !inQuotes) {
            cells.push(current.trim());
            current = '';
            continue;
        }

        current += char;
    }

    cells.push(current.trim());
    return cells;
}

function parseCellReference(cellReference: string): { rowIndex: number; colIndex: number } {
    const match = cellReference.trim().toUpperCase().match(/^([A-Z]+)(\d+)$/);
    if (!match) {
        throw new Error(`Invalid cell reference "${cellReference}". Use A1 format, e.g. C9.`);
    }

    const [, colLetters, rowNumber] = match;
    const parsedRow = parseInt(rowNumber, 10);
    if (parsedRow < 1) {
        throw new Error(`Invalid row in cell reference "${cellReference}". Row must be >= 1.`);
    }

    const rowIndex = parsedRow - 1;

    let colIndex = 0;
    for (let i = 0; i < colLetters.length; i++) {
        colIndex = colIndex * 26 + (colLetters.charCodeAt(i) - 64);
    }
    colIndex -= 1;

    return { rowIndex, colIndex };
}

interface GoogleSheetFetchOptions {
    sheetName?: string;
    sheetGid?: string;
}

function buildSheetCsvUrls(sheetId: string, options?: GoogleSheetFetchOptions): string[] {
    const baseUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export`;
    const urls: string[] = [];
    const gid = options?.sheetGid?.trim();
    const sheetName = options?.sheetName?.trim();

    if (gid) {
        urls.push(`${baseUrl}?format=csv&gid=${encodeURIComponent(gid)}`);
    }

    if (sheetName) {
        urls.push(`${baseUrl}?format=csv&sheet=${encodeURIComponent(sheetName)}`);
    }

    urls.push(`${baseUrl}?format=csv`);
    return Array.from(new Set(urls));
}

async function fetchFirstAvailableSheetCsv(sheetId: string, options?: GoogleSheetFetchOptions): Promise<string> {
    const urls = buildSheetCsvUrls(sheetId, options);
    let lastError: unknown = null;

    for (const url of urls) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                lastError = new Error(`Failed to fetch Google Sheet (${response.status} ${response.statusText})`);
                continue;
            }
            return await response.text();
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError ?? new Error('Failed to fetch Google Sheet CSV');
}

/**
 * Fetches expenses from a public Google Sheet CSV export.
 * Expected columns: Date, Description, Amount, [Project Code]
 * @param sheetId The ID of the Google Sheet (from URL)
 * @param sheetName Optional sheet/tab name
 * @param sheetGid Optional gid of sheet tab (preferred in browser)
 */
export async function fetchGoogleSheetExpenses(
    sheetId: string,
    sheetName?: string,
    sheetGid?: string
): Promise<GoogleSheetExpense[]> {
    try {
        const text = await fetchFirstAvailableSheetCsv(sheetId, { sheetName, sheetGid });
        const rows = text.split('\n');

        // Remove header row
        const dataRows = rows.slice(1);

        return dataRows
            .map(row => {
                const cols = parseCsvLine(row);

                if (cols.length < 3) return null;

                const dateStr = normalizeGoogleSheetDate(cols[0]);
                const amount = parseAmount(cols[2]);

                return {
                    date: dateStr,
                    description: cols[1] || 'Imported Expense',
                    amount: Number.isFinite(amount) ? amount : 0,
                    projectCode: cols[3]
                } as GoogleSheetExpense;
            })
            .filter((item): item is GoogleSheetExpense =>
                item !== null &&
                item.date.length > 0 &&
                !isNaN(item.amount) &&
                item.amount > 0
            );

    } catch (error) {
        console.error("Google Sheet Import Error:", error);
        throw error;
    }
}

/**
 * Fetch project actual expenses from Google Sheet.
 * Expected columns:
 * A = Project Code
 * B = Project Name
 * C = Actual Expenses
 * D = Cost Code (optional)
 */
export async function fetchGoogleSheetProjectActualExpenses(
    sheetId: string,
    sheetName?: string,
    sheetGid?: string
): Promise<GoogleSheetProjectActualExpense[]> {
    try {
        const text = await fetchFirstAvailableSheetCsv(sheetId, { sheetName, sheetGid });
        const rows = text
            .split('\n')
            .map(row => row.replace(/\r$/, ''));

        const dataRows = rows.slice(1);

        return dataRows
            .map(row => {
                const cols = parseCsvLine(row);
                if (cols.length < 3) return null;

                const projectCode = (cols[0] || '').trim();
                const projectName = (cols[1] || '').trim();
                const actualExpense = parseAmount(cols[2]);
                const costCode = (cols[3] || '').trim();

                return {
                    projectCode,
                    projectName,
                    actualExpense: Number.isFinite(actualExpense) ? actualExpense : 0,
                    costCode: costCode || undefined
                } as GoogleSheetProjectActualExpense;
            })
            .filter((item): item is GoogleSheetProjectActualExpense =>
                item !== null &&
                item.projectCode.length > 0 &&
                !Number.isNaN(item.actualExpense) &&
                item.actualExpense > 0
            );
    } catch (error) {
        console.error('Google Sheet Project-Actual Import Error:', error);
        throw error;
    }
}

/**
 * Fetch project actual expenses by fixed cost-code columns.
 * Expected base columns:
 * A = Project Code
 * B = Project Name
 * Cost amounts are read from configured columns (e.g. L, N, P...)
 */
export async function fetchGoogleSheetProjectActualExpensesByColumns(
    sheetId: string,
    mappings: CostCodeColumnMapping[],
    sheetName?: string,
    sheetGid?: string
): Promise<GoogleSheetProjectActualExpense[]> {
    try {
        const text = await fetchFirstAvailableSheetCsv(sheetId, { sheetName, sheetGid });
        const rows = text
            .split('\n')
            .map(row => row.replace(/\r$/, ''));

        const dataRows = rows.slice(1);
        const results: GoogleSheetProjectActualExpense[] = [];

        dataRows.forEach(row => {
            const cols = parseCsvLine(row);
            if (cols.length < 2) return;

            const projectCode = (cols[0] || '').trim();
            const projectName = (cols[1] || '').trim();
            if (!projectCode) return;

            mappings.forEach(mapping => {
                const colIndex = columnLabelToIndex(mapping.column);
                if (colIndex < 0) return;

                const rawAmount = cols[colIndex] || '';
                const actualExpense = parseAmount(rawAmount);
                if (!Number.isFinite(actualExpense) || actualExpense <= 0) return;

                results.push({
                    projectCode,
                    projectName,
                    actualExpense,
                    costCode: mapping.costCode,
                    costName: mapping.costName
                });
            });
        });

        return results;
    } catch (error) {
        console.error('Google Sheet Project-Actual (Column Mapping) Import Error:', error);
        throw error;
    }
}

/**
 * Fetch a single cell value from a public Google Sheet CSV export.
 * Example: C9
 */
export async function fetchGoogleSheetCellValue(
    sheetId: string,
    cellReference: string = 'C9',
    sheetName?: string,
    sheetGid?: string
): Promise<string> {
    const text = await fetchFirstAvailableSheetCsv(sheetId, { sheetName, sheetGid });
    const rows = text
        .split('\n')
        .map(row => row.replace(/\r$/, ''));

    const { rowIndex, colIndex } = parseCellReference(cellReference);
    const row = rows[rowIndex];
    if (!row) {
        return '';
    }

    const cols = parseCsvLine(row);
    return cols[colIndex] ?? '';
}

/**
 * Extract Sheet ID from a full Google Sheet URL
 */
export function extractSheetId(url: string): string | null {
    const matches = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    return matches ? matches[1] : null;
}

export function extractSheetGid(url: string): string | null {
    const match = url.match(/[?#&]gid=(\d+)/) || url.match(/#gid=(\d+)/);
    return match ? match[1] : null;
}
