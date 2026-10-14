import { defineBuiltinExtension } from '../../contract/extension.js';
import { OptionType } from '../../contract/options.js';
import { FetchError, type FetchResponse } from '../../contract/fetch.js';
import { OptionReader } from '../../shared/option-reader.js';
import { sleep } from '../../shared/sleep.js';
import { BUILTIN_ENGINE_RANGE } from '../../shared/version.js';

export const RetryReason = {
    TIMEOUT: 'timeout',
    DNS: 'dns',
    SERVER_ERROR: '5xx',
} as const;

export type RetryReason = (typeof RetryReason)[keyof typeof RetryReason];

const REASONS: readonly RetryReason[] = Object.values(RetryReason);
export const DEFAULT_ATTEMPTS = 2;
const DEFAULT_BACKOFF_MS = 500;
const DEFAULT_REASONS: readonly RetryReason[] = [RetryReason.TIMEOUT, RetryReason.SERVER_ERROR];

/** Strategy per retry reason: does this response qualify? */
const MATCHERS = {
    [RetryReason.TIMEOUT]: (response) => response.error === FetchError.TIMEOUT,
    [RetryReason.DNS]: (response) => response.error === FetchError.DNS,
    [RetryReason.SERVER_ERROR]: (response) => response.status >= 500 && response.status <= 599,
} as const satisfies Record<RetryReason, (response: FetchResponse) => boolean>;

function readReasons(raw: readonly string[]): readonly RetryReason[] {
    return raw.map((value) => {
        const reason = REASONS.find((candidate) => candidate === value);
        if (reason === undefined) {
            throw new TypeError(`retry: option "on" has unknown reason "${value}" (known: ${REASONS.join(', ')})`);
        }

        return reason;
    });
}

export interface RetryAttemptEvent {
    readonly url: string;
    /** The attempt about to start (2 = first retry). */
    readonly attempt: number;
    readonly reason: string;
    readonly waitMs: number;
}

declare module '../../contract/events.js' {
    interface EngineEvents {
        'ext:retry:attempt': RetryAttemptEvent;
    }
}

/**
 * Re-calls `next()` with a fresh request and sleeps between attempts (backoff doubles). Respects the abort signal.
 * Options: attempts (extra tries, default 2), backoffMs (default 500), on (timeout|dns|5xx, default timeout+5xx).
 */
export const retryExtension = defineBuiltinExtension({
    id: 'retry',
    description: 'Retries failed fetches. Options: attempts, backoffMs, on.',
    engine: BUILTIN_ENGINE_RANGE,
    options: {
        attempts: { type: OptionType.INTEGER, default: DEFAULT_ATTEMPTS, min: 0, summary: 'Extra tries after the first' },
        backoffMs: { type: OptionType.INTEGER, default: DEFAULT_BACKOFF_MS, min: 0, summary: 'Wait before the first retry; doubled each time' },
        on: { type: OptionType.STRING_ARRAY, default: DEFAULT_REASONS, enumValues: REASONS, summary: 'What to retry: timeout, dns, 5xx' },
    },
    setup(api) {
        const reader = new OptionReader('retry', api.options);
        const attempts = reader.integer('attempts', DEFAULT_ATTEMPTS, 0);
        const backoffMs = reader.integer('backoffMs', DEFAULT_BACKOFF_MS, 0);
        const reasons = readReasons(reader.stringArray('on', DEFAULT_REASONS));

        api.use('fetch', async (context, next) => {
            const original = context.request;
            await next();

            for (let retry = 1; retry <= attempts; retry += 1) {
                const response = context.response;
                const reason = response ? reasons.find((candidate) => MATCHERS[candidate](response)) : undefined;
                if (!response || reason === undefined) {
                    return;
                }
                const waitMs = backoffMs * 2 ** (retry - 1);
                api.emit('ext:retry:attempt', { url: original.url, attempt: retry + 1, reason, waitMs });
                if (!(await sleep(waitMs, context.signal))) {
                    return;
                }
                context.request = original;
                context.response = null;
                await next();
            }
        });
    },
});
