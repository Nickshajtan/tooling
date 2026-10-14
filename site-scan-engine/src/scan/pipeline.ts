/**
 * One generic Koa-style onion for every stage (`target`, `fetch`, `analyze`).
 *
 * Errors are attributed: a middleware that throws (or misuses `next()`) becomes a PipelineError carrying its
 * extension id; an error from the engine core inside the chain carries `extensionId: null`, so an outer
 * middleware is never blamed for an inner failure.
 */

import type { Middleware, Stage } from '../contract/middleware.js';
import { errorMessage } from '../shared/error-message.js';

export interface TaggedMiddleware<C> {
    readonly extensionId: string;
    readonly stage: Stage;
    readonly run: Middleware<C>;
}

export class PipelineError extends Error {
    constructor(
        /** The extension whose middleware threw; `null` when the engine core inside the chain did. */
        readonly extensionId: string | null,
        readonly stage: Stage,
        readonly original: unknown,
    ) {
        super(errorMessage(original), { cause: original });
        this.name = 'PipelineError';
    }
}

/**
 * Composes `middlewares` around `core`. `next()` may be called again once the previous call has settled
 * (that is how retry works); calling it while a previous call is still running is an error.
 */
export function compose<C>(
    stage: Stage,
    middlewares: readonly TaggedMiddleware<C>[],
    core: (context: C) => Promise<void>,
): (context: C) => Promise<void> {
    const dispatch = async (index: number, context: C): Promise<void> => {
        const current = middlewares[index];
        if (!current) {
            try {
                await core(context);
            } catch (err) {
                throw err instanceof PipelineError ? err : new PipelineError(null, stage, err);
            }

            return;
        }

        let running = false;
        const next = async (): Promise<void> => {
            if (running) {
                throw new Error('next() called while a previous next() call is still running');
            }
            running = true;
            try {
                await dispatch(index + 1, context);
            } finally {
                running = false;
            }
        };

        try {
            await current.run(context, next);
        } catch (err) {
            throw err instanceof PipelineError ? err : new PipelineError(current.extensionId, stage, err);
        }
    };

    return (context) => dispatch(0, context);
}
