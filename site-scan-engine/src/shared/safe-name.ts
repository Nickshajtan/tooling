/** Files the run store owns; no reporter may write them. */
export const RESERVED_NAMES: ReadonlySet<string> = new Set(['run.json', 'raw.jsonl']);

/**
 * Problems with a reporter-supplied file name (empty = safe): it must be a relative path that stays inside
 * the run location and does not collide with `run.json` / `raw.jsonl`.
 */
export function unsafeNameProblems(name: string): string[] {
    const problems: string[] = [];
    const segments = name.split(/[\\/]/);

    if (name === '' || segments.some((segment) => segment === '')) {
        problems.push('name must be a non-empty relative path');
    }
    if (name.startsWith('/') || name.startsWith('\\') || /^[a-zA-Z]:/.test(name)) {
        problems.push('name must not be absolute');
    }
    if (segments.includes('..')) {
        problems.push('name must not contain ".." segments');
    }
    if (RESERVED_NAMES.has(name)) {
        problems.push(`name "${name}" is reserved for the run store`);
    }

    return problems;
}

/** Throws when `name` is not a safe artifact name (see `unsafeNameProblems`). Used by every store's `writeArtifact`. */
export function assertSafeArtifactName(name: string): void {
    const problems = unsafeNameProblems(name);
    if (problems.length > 0) {
        throw new Error(`Unsafe artifact name "${name}": ${problems.join('; ')}`);
    }
}
