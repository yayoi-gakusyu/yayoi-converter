import { describe, it, expect } from 'vitest';
import { normalizeDescription, escapeCsvCell } from './format';

describe('Format Utilities', () => {
  describe('normalizeDescription', () => {
    it('should truncate text to 64 characters', () => {
        const longText = 'あ'.repeat(100);
        const result = normalizeDescription(longText);
        expect(result.length).toBe(64);
        expect(result).toBe('あ'.repeat(64));
    });

    it('should remove newlines', () => {
        const text = 'Line1\nLine2\r\nLine3';
        const result = normalizeDescription(text);
        expect(result).toBe('Line1Line2Line3');
    });

    it('should trim trailing spaces', () => {
        const text = '  Text with spaces  ';
        // Note: normalizeDescription currently implements trim() which removes leading and trailing
        const result = normalizeDescription(text);
        expect(result).toBe('Text with spaces');
    });

    it('should handle null or undefined gracefully', () => {
        expect(normalizeDescription(null as any)).toBe('');
        expect(normalizeDescription(undefined as any)).toBe('');
    });
  });

  describe('escapeCsvCell', () => {
    it('should escape double quotes by doubling them', () => {
        const text = 'He said "Hello"';
        const result = escapeCsvCell(text);
        expect(result).toBe('He said ""Hello""');
    });

    it('should return plain text if no quotes present', () => {
        const text = 'Normal text';
        const result = escapeCsvCell(text);
        expect(result).toBe('Normal text');
    });

    it('should handle empty string', () => {
        expect(escapeCsvCell('')).toBe('');
    });
    
    it('should handle string with only quotes', () => {
        expect(escapeCsvCell('""')).toBe('""""');
    });
  });
});
