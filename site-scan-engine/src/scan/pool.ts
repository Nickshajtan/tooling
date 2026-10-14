/**
 * Generic bounded-concurrency pool exposed as an async generator.
 */

export interface PoolOptions {
    readonly concurrency?: number;
    readonly delayMs?: number;
    readonly signal?: AbortSignal | undefined;
}

type Settled<R> = { readonly id: number; readonly value: R } | { readonly id: number; readonly error: unknown };

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs `worker` over `items`, yielding results as they complete. Never more than
 * `concurrency` tasks are in flight. When `signal` aborts, no new items are dispatched
 * and in-flight tasks finish.
 */
export async function* runPool<T, R>(
    items: Iterable<T>,
    worker: (item: T) => Promise<R>,
    { concurrency = 3, delayMs = 0, signal }: PoolOptions = {},
): AsyncGenerator<R> {
    const iterator = items[Symbol.iterator]();
    const inFlight = new Map<number, Promise<Settled<R>>>();
    let nextId = 0;
    let exhausted = false;

    const launch = (): void => {
        const next = iterator.next();
        if (next.done) {
            exhausted = true;

            return;
        }
        const id = nextId++;
        const promise = (async (): Promise<Settled<R>> => {
            try {
                return { id, value: await worker(next.value) };
            } catch (error) {
                return { id, error };
            } finally {
                if (delayMs > 0 && !signal?.aborted) {
                    await sleep(delayMs);
                }
            }
        })();
        inFlight.set(id, promise);
    };

    while (true) {
        while (!exhausted && !signal?.aborted && inFlight.size < Math.max(1, concurrency)) {
            launch();
        }
        if (inFlight.size === 0) {
            return;
        }

        const settled = await Promise.race(inFlight.values());
        inFlight.delete(settled.id);
        if ('error' in settled) {
            // Drain remaining tasks so nothing runs unobserved, then surface the failure.
            await Promise.allSettled(inFlight.values());
            throw settled.error;
        }
        yield settled.value;
    }
}
