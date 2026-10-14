/**
 * Turns whatever was thrown, per place it was thrown from, into an `engine.*` finding (a page never aborts the run).
 */

import { finding, type Finding } from '../contract/adapter.js';
import { EngineCode } from '../contract/engine-code.js';
import type { Stage } from '../contract/middleware.js';
import { Severity } from '../contract/severity.js';
import { errorMessage } from '../shared/error-message.js';
import { PipelineError } from './pipeline.js';

export const FailureSite = {
    /** A fetch middleware or the transport. */
    FETCH: 'fetch',
    /** A page that loaded with a non-2xx status (no throw, `response.error === ''`). */
    HTTP_STATUS: 'http_status',
    /** A target or analyze middleware. */
    MIDDLEWARE: 'middleware',
    /** An adapter's `scan()`. */
    ADAPTER: 'adapter',
} as const;

export type FailureSite = (typeof FailureSite)[keyof typeof FailureSite];

export interface FailureInput {
    readonly error: unknown;
    /** Adapter id for `adapter` failures. */
    readonly adapterId?: string;
    /** HTTP status for `http_status` findings. */
    readonly status?: number;
    /** Already-described reason for `fetch` failures that come from a response rather than a throw. */
    readonly detail?: string;
}

export interface FailureMapper {
    map(input: FailureInput): Finding;
}

function unwrap(error: unknown): { extensionId: string | null; stage: Stage | null; message: string } {
    if (error instanceof PipelineError) {
        return { extensionId: error.extensionId, stage: error.stage, message: errorMessage(error.original) };
    }

    return { extensionId: null, stage: null, message: errorMessage(error) };
}

const fetchMapper: FailureMapper = {
    map({ error, detail: given }) {
        const { extensionId, message } = unwrap(error);
        const detail = given ?? (extensionId === null ? message : `${extensionId}: ${message}`);

        return finding(EngineCode.FETCH_FAILED, Severity.ERROR, `Fetch failed: ${detail}`, detail);
    },
};

const httpStatusMapper: FailureMapper = {
    map({ status = 0 }) {
        return finding(EngineCode.HTTP_STATUS, Severity.WARNING, `HTTP ${status}`, String(status));
    },
};

const middlewareMapper: FailureMapper = {
    map({ error }) {
        const { extensionId, stage, message } = unwrap(error);
        const detail = `${extensionId ?? 'engine'}@${stage ?? 'target'}: ${message}`;

        return finding(EngineCode.MIDDLEWARE_FAILED, Severity.ERROR, `Middleware failed: ${detail}`, detail);
    },
};

const adapterMapper: FailureMapper = {
    map({ error, adapterId = '' }) {
        return finding(EngineCode.ADAPTER_FAILED, Severity.ERROR, errorMessage(error), adapterId);
    },
};

export const FAILURE_MAPPERS = {
    [FailureSite.FETCH]: fetchMapper,
    [FailureSite.HTTP_STATUS]: httpStatusMapper,
    [FailureSite.MIDDLEWARE]: middlewareMapper,
    [FailureSite.ADAPTER]: adapterMapper,
} as const satisfies Record<FailureSite, FailureMapper>;
