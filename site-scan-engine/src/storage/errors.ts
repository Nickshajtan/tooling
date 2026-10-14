import { RECORD_SCHEMA_VERSION } from '../contract/record.js';
import type { RunMeta } from '../contract/run-meta.js';

/** `create` was called on a location that already holds a run. */
export class RunAlreadyExistsError extends Error {
    constructor(location: string) {
        super(`A run already exists at ${location}. Use --resume to continue it, or choose another --out.`);
        this.name = 'RunAlreadyExistsError';
    }
}

/** A run was written with a record schema this engine does not understand. */
export class UnsupportedSchemaError extends Error {
    constructor(location: string, found: unknown) {
        super(`Run ${location} uses record schema ${String(found)}; this engine reads schema ${RECORD_SCHEMA_VERSION}.`);
        this.name = 'UnsupportedSchemaError';
    }
}

/** Refuses a run whose `recordSchemaVersion` is not the one this engine reads. Store-agnostic. */
export function assertSupportedSchema(meta: RunMeta, location: string): void {
    if (meta.recordSchemaVersion !== RECORD_SCHEMA_VERSION) {
        throw new UnsupportedSchemaError(location, meta.recordSchemaVersion);
    }
}
