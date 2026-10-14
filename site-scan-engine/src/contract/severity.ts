export const Severity = {
    ERROR: 'error',
    WARNING: 'warning',
    INFO: 'info',
} as const;

export type Severity = (typeof Severity)[keyof typeof Severity];

const SEVERITY_VALUES: ReadonlySet<string> = new Set(Object.values(Severity));

/** Runtime guard for values that arrive from config, flags or plugin code. */
export function isSeverity(value: unknown): value is Severity {
    return typeof value === 'string' && SEVERITY_VALUES.has(value);
}
