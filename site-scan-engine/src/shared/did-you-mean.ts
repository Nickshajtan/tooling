/** Levenshtein distance (insert/delete/substitute). */
export function editDistance(a: string, b: string): number {
    let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i += 1) {
        const current = [i];
        for (let j = 1; j <= b.length; j += 1) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            current[j] = Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, (previous[j - 1] ?? 0) + cost);
        }
        previous = current;
    }

    return previous[b.length] ?? 0;
}

const MAX_DISTANCE = 2;

/** The closest valid value within edit distance 2, or `undefined` when nothing is close. Ties go to the first. */
export function didYouMean(input: string, valid: readonly string[]): string | undefined {
    let best: { value: string; distance: number } | undefined;
    for (const candidate of valid) {
        const distance = editDistance(input.toLowerCase(), candidate.toLowerCase());
        if (distance <= MAX_DISTANCE && (best === undefined || distance < best.distance)) {
            best = { value: candidate, distance };
        }
    }

    return best?.value;
}
