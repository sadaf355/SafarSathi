/** Utility functions for concise user-facing explanation presentation.
 * Ensures all explanations across the UI are short, scannable, single-line or max 2-3 bullet points.
 */

/** Break a potentially long explanation or narrative paragraph into 1-3 concise bullet items. */
export function toConciseBullets(text: string | null | undefined, maxItems = 3): string[] {
  if (!text || !text.trim()) return [];

  // If already formatted with bullet characters or newlines
  const lines = text
    .split(/\n|•|\*|(?<=[.!?])\s+(?=[A-Z0-9"“])/)
    .map((s) => s.replace(/^[\s•*-]+/, '').trim())
    .filter((s) => s.length > 0 && !/^based on your preferences,?$/i.test(s));

  if (lines.length === 0) return [];

  const items: string[] = [];
  for (const line of lines) {
    if (items.length >= maxItems) break;
    // Clean up trailing punctuation if necessary and ensure brevity
    const trimmed = line.replace(/\s+/g, ' ');
    if (trimmed.length > 0 && !items.includes(trimmed)) {
      items.push(trimmed);
    }
  }

  return items.slice(0, maxItems);
}

/** Summarize an explanation into a single concise scannable line. */
export function toConciseLine(text: string | null | undefined, maxChars = 120): string {
  if (!text || !text.trim()) return '';
  const first = toConciseBullets(text, 1)[0] ?? text.trim();
  if (first.length <= maxChars) return first;
  return `${first.slice(0, maxChars - 1).trim()}…`;
}
