import type { FetchContext, TargetContext } from '../scan/contexts.js';

/** Koa-style onion: code before `await next()` runs on the way in, code after it on the way out. */
export type Middleware<C> = (context: C, next: () => Promise<void>) => Promise<void>;

export const Stage = {
    /** The whole page: fetch + analyze + record. */
    TARGET: 'target',
    /** One HTTP request, page or side. */
    FETCH: 'fetch',
    /** Running the adapters, after the page response exists. */
    ANALYZE: 'analyze',
} as const;

export type Stage = (typeof Stage)[keyof typeof Stage];

/** The context each stage's middleware receives. */
export interface StageContexts {
    readonly target: TargetContext;
    readonly fetch: FetchContext;
    readonly analyze: TargetContext;
}
