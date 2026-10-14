import { FetchError } from '../contract/fetch.js';
import { errorMessage } from '../shared/error-message.js';
import { isRecord } from '../shared/is-record.js';

export interface ClassifiedError {
    readonly error: FetchError;
    /** Raw message for humans. */
    readonly detail: string;
}

/** Maps a thrown value to a stable error, or `null` when it does not recognise it. */
export interface ErrorClassifier {
    classify(err: unknown): FetchError | null;
}

function property(value: unknown, key: string): unknown {
    return isRecord(value) ? value[key] : undefined;
}

function errorCode(err: unknown): string {
    return String(property(property(err, 'cause'), 'code') ?? property(err, 'code') ?? '');
}

const timeoutByName: ErrorClassifier = {
    classify(err) {
        const name = property(err, 'name');

        return name === 'TimeoutError' || name === 'AbortError' ? FetchError.TIMEOUT : null;
    },
};

const dns: ErrorClassifier = {
    classify(err) {
        const code = errorCode(err);

        return code === 'ENOTFOUND' || code === 'EAI_AGAIN' ? FetchError.DNS : null;
    },
};

const tls: ErrorClassifier = {
    classify(err) {
        const code = errorCode(err);
        const isTls = code.startsWith('CERT_') || code.startsWith('ERR_TLS_') || code.includes('SELF_SIGNED') || code.startsWith('UNABLE_TO_');

        return isTls ? FetchError.TLS : null;
    },
};

const connectTimeout: ErrorClassifier = {
    classify: (err) => (errorCode(err) === 'UND_ERR_CONNECT_TIMEOUT' ? FetchError.TIMEOUT : null),
};

/** Chain of responsibility: first classifier that recognises the error wins; anything else is `other`. */
const CLASSIFIERS: readonly ErrorClassifier[] = [timeoutByName, dns, tls, connectTimeout];

function rawMessage(err: unknown): string {
    const causeMessage = property(property(err, 'cause'), 'message');

    return typeof causeMessage === 'string' ? causeMessage : errorMessage(err);
}

export function classifyError(err: unknown): ClassifiedError {
    for (const classifier of CLASSIFIERS) {
        const error = classifier.classify(err);
        if (error !== null) {
            return { error, detail: rawMessage(err) };
        }
    }

    return { error: FetchError.OTHER, detail: rawMessage(err) };
}
