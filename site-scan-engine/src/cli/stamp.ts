/** Local-time `YYYYMMDD-HHmmss`, used in default run directory names. */
export function stamp(date: Date): string {
    const p = (n: number): string => String(n).padStart(2, '0');

    return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}
