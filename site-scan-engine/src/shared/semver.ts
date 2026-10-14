/**
 * Minimal semver range support. Only two forms exist on purpose (plugins declare `engine: "^0.2.0"`):
 * an exact `x.y.z` and a caret `^x.y.z`. Anything else is a TypeError, so a typo cannot silently pass.
 */

export interface SemVer {
    readonly major: number;
    readonly minor: number;
    readonly patch: number;
}

export const RangeKind = {
    EXACT: 'exact',
    CARET: 'caret',
} as const;

export type RangeKind = (typeof RangeKind)[keyof typeof RangeKind];

export interface ParsedRange {
    readonly kind: RangeKind;
    readonly base: SemVer;
}

const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

export function parseVersion(text: string): SemVer {
    const match = VERSION_PATTERN.exec(text);
    if (!match) {
        throw new TypeError(`Invalid version "${text}": expected "x.y.z"`);
    }

    return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

export function parseRange(range: string): ParsedRange {
    const kind: RangeKind = range.startsWith('^') ? RangeKind.CARET : RangeKind.EXACT;
    const versionText = kind === RangeKind.CARET ? range.slice(1) : range;
    if (!VERSION_PATTERN.test(versionText)) {
        throw new TypeError(`Unsupported version range "${range}": only "x.y.z" and "^x.y.z" are supported`);
    }

    return { kind, base: parseVersion(versionText) };
}

function compare(a: SemVer, b: SemVer): number {
    return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

/** Exclusive upper bound of a caret range: 0.x ranges are pinned to their minor, 0.0.x to their patch. */
function caretUpperBound({ major, minor, patch }: SemVer): SemVer {
    if (major > 0) {
        return { major: major + 1, minor: 0, patch: 0 };
    }

    return minor > 0 ? { major: 0, minor: minor + 1, patch: 0 } : { major: 0, minor: 0, patch: patch + 1 };
}

type RangeMatcher = (base: SemVer, version: SemVer) => boolean;

const MATCHERS = {
    [RangeKind.EXACT]: (base, version) => compare(base, version) === 0,
    [RangeKind.CARET]: (base, version) => compare(version, base) >= 0 && compare(version, caretUpperBound(base)) < 0,
} as const satisfies Record<RangeKind, RangeMatcher>;

/** True when `version` ("x.y.z") is inside `range`. Throws TypeError on an unsupported range or version. */
export function satisfies(range: string, version: string): boolean {
    const { kind, base } = parseRange(range);

    return MATCHERS[kind](base, parseVersion(version));
}
