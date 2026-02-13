
export function normalizeDescription(text: string, maxLength: number = 64): string {
    if (!text) return '';
    // 1. Remove newlines and tabs
    let normalized = text.replace(/[\r\n\t]+/g, '');
    
    // 2. Trim
    normalized = normalized.trim();

    // 3. Truncate (naive slice, usually fine for JS strings, though surrogate pairs might be an issue but rare in this context)
    if (normalized.length > maxLength) {
        normalized = normalized.slice(0, maxLength);
    }
    
    return normalized;
}

export function escapeCsvCell(text: string): string {
    if (!text) return '';
    // If it contains double quotes, escape them by doubling them
    const escaped = text.replace(/"/g, '""');
    return escaped;
}
