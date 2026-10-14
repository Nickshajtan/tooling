import type { ScanConfig } from '../config/types.js';
import { isRecord } from '../shared/is-record.js';
import type { EngineEvents, EventListener, ExtensionEventName } from './events.js';
import type { Middleware, Stage, StageContexts } from './middleware.js';
import { identityProblems, PluginKind, throwIfInvalid, type AssertPluginOptions, type PluginIdentity } from './plugin.js';

export interface ExtensionApi<O = unknown> {
    /** `config.scan.options[extension.id]` */
    readonly options: O;
    readonly config: Readonly<ScanConfig>;
    /** Adds middleware to a stage. Order: config order of extensions, then registration order. */
    use<S extends Stage>(stage: S, middleware: Middleware<StageContexts[S]>): void;
    on<K extends keyof EngineEvents>(name: K, listener: EventListener<K>): void;
    /**
     * Emits `ext:<this-extension-id>:<name>`. Emitting under another extension's id is a TypeError.
     * Declare the payload type by augmenting `EngineEvents`.
     */
    emit<K extends ExtensionEventName>(name: K, payload: EngineEvents[K]): void;
    /** Runs after `run:end` (also when the run is aborted), in reverse registration order. Errors become warnings. */
    onDispose(fn: () => Promise<void> | void): void;
}

/** Adds middleware and event listeners (how scanning behaves). `use`/`on`/`onDispose` only work during `setup`. */
export interface Extension<O = unknown> extends PluginIdentity {
    setup(api: ExtensionApi<O>): void | Promise<void>;
}

export function assertExtension(extension: unknown, options: AssertPluginOptions = {}): asserts extension is Extension {
    const candidate = isRecord(extension) ? extension : {};
    const problems = identityProblems(PluginKind.EXTENSION, candidate, options);
    if (typeof candidate.setup !== 'function') {
        problems.push('setup must be a function');
    }
    throwIfInvalid(PluginKind.EXTENSION, candidate, problems);
}

/** Validates an extension definition right away so mistakes fail before a long run starts. */
export function defineExtension<O = unknown>(extension: Extension<O>): Readonly<Extension<O>> {
    assertExtension(extension);

    return Object.freeze(extension);
}

/** For extensions shipped by the engine only (may use reserved ids). Not exported from the package. */
export function defineBuiltinExtension<O = unknown>(extension: Extension<O>): Readonly<Extension<O>> {
    assertExtension(extension, { builtin: true });

    return Object.freeze(extension);
}
