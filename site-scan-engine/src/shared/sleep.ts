/**
 * Resolves after `ms`, or as soon as `signal` aborts. Returns whether the full time elapsed
 * (false = interrupted by the abort), so callers can stop retrying instead of throwing.
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<boolean> {
    if (signal?.aborted) {
        return Promise.resolve(false);
    }

    return new Promise((resolve) => {
        const onAbort = (): void => {
            clearTimeout(timer);
            resolve(false);
        };
        const timer = setTimeout(() => {
            signal?.removeEventListener('abort', onAbort);
            resolve(true);
        }, ms);
        signal?.addEventListener('abort', onAbort, { once: true });
    });
}
