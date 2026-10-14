/** Narrows `unknown` to a non-null, non-array object so its keys can be read safely. */
export function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
