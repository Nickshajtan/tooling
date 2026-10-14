/**
 * Synchronous, observe-only event bus. Payloads are deep-frozen before any listener sees them. Listeners are
 * never awaited; one that throws (or returns a rejected promise) becomes a `warning` event and the run continues.
 */

import type { EngineEvents, EventListener } from '../contract/events.js';
import type { TextSink } from '../contract/text-sink.js';
import { deepFreeze } from '../shared/deep-freeze.js';
import { errorMessage } from '../shared/error-message.js';

type StoredListener = (payload: unknown) => unknown;

const WARNING_EVENT = 'warning';

function isThenable(value: unknown): value is PromiseLike<unknown> {
    return typeof value === 'object' && value !== null && 'then' in value && typeof value.then === 'function';
}

export class EventBus {
    private readonly listeners = new Map<string, StoredListener[]>();

    /** `stderr` is the last resort: it receives the failure of a `warning` listener, which cannot warn about itself. */
    constructor(private readonly stderr?: TextSink) {}

    /** Returns an unsubscribe function. Listeners run in registration order. */
    on<K extends keyof EngineEvents>(name: K, listener: EventListener<K>): () => void {
        // The payload type is tied to `name` by emit()'s signature, so storing it as (unknown) => unknown is safe.
        const stored = listener as unknown as StoredListener;
        const list = this.listeners.get(name) ?? [];
        list.push(stored);
        this.listeners.set(name, list);

        return () => {
            const current = this.listeners.get(name) ?? [];
            this.listeners.set(name, current.filter((candidate) => candidate !== stored));
        };
    }

    emit<K extends keyof EngineEvents>(name: K, payload: EngineEvents[K]): void {
        const frozen = deepFreeze(payload);
        for (const listener of [...(this.listeners.get(name) ?? [])]) {
            try {
                const result = listener(frozen);
                if (isThenable(result)) {
                    result.then(undefined, (err: unknown) => this.listenerFailed(name, err));
                }
            } catch (err) {
                this.listenerFailed(name, err);
            }
        }
    }

    private listenerFailed(name: string, err: unknown): void {
        const message = `listener for "${name}" failed: ${errorMessage(err)}`;
        if (name === WARNING_EVENT) {
            this.stderr?.write(`Warning: engine: ${message}\n`);

            return;
        }
        this.emit('warning', { source: 'engine', message });
    }
}
