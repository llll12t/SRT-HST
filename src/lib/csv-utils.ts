
/**
 * Simple CSV Parser keeping quoted fields intact.
 * Handles:
 * - Quotes wrapping fields
 * - Commas inside quotes
 * - Escaped quotes ("")
 */
export function parseCSV(text: string): Record<string, string>[] {
    const lines = text.split(/\r?\n/).filter(line => line.trim());
    if (lines.length < 2) return [];

    const headers = parseCSVLine(lines[0]);
    const result: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
        const currentLine = lines[i];
        if (!currentLine.trim()) continue;

        const values = parseCSVLine(currentLine);
        const obj: Record<string, string> = {};

        headers.forEach((header, index) => {
            obj[header] = values[index] || '';
        });

        result.push(obj);
    }

    return result;
}

function parseCSVLine(text: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                // Escaped quote
                current += '"';
                i++; // Skip next quote
            } else {
                // Toggle quote mode
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            // End of field
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    return result;
}
