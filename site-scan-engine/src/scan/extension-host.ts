import type { ScanConfig } from '../config/types.js';
import type { EngineEvents, EventListener, ExtensionEventName } from '../contract/events.js';
import type { Extension, ExtensionApi } from '../contract/extension.js';
import type { Middleware, Stage, StageContexts } from '../contract/middleware.js';
import { requireOptions } from '../plugins/plugin-options.js';
import { errorMessage } from '../shared/error-message.js';
import type { EventBus } from './events.js';
import type { TaggedMiddleware } from './pipeline.js';

type Chains = { [S in Stage]: TaggedMiddleware<StageContexts[S]>[] };

/** Everything extensions registered, ready for the engine to compose. */
export interface ExtensionHost {
    readonly chains: Readonly<Chains>;
    /** Runs the dispose handlers in reverse registration order; each failure becomes a warning. */
    dispose(): Promise<void>;
}

interface DisposeEntry {
    readonly extensionId: string;
    readonly fn: () => Promise<void> | void;
}

/**
 * Runs `setup()` of each extension in config order. Registration is only possible while its `setup` runs;
 * afterwards `use`/`on`/`emit`-registration/`onDispose` throw TypeError.
 */
export async function setupExtensions(
    extensions: readonly Extension[],
    config: Readonly<ScanConfig>,
    bus: EventBus,
): Promise<ExtensionHost> {
    const chains: Chains = { target: [], fetch: [], analyze: [] };
    const disposers: DisposeEntry[] = [];

    for (const extension of extensions) {
        let open = true;
        const guard = (what: string): void => {
            if (!open) {
                throw new TypeError(`Extension "${extension.id}": ${what}() is only allowed during setup()`);
            }
        };

        const api: ExtensionApi = {
            options: requireOptions('extension', extension, config.scan.options[extension.id]),
            config,
            use<S extends Stage>(stage: S, middleware: Middleware<StageContexts[S]>): void {
                guard('use');
                const chain: TaggedMiddleware<StageContexts[S]>[] = chains[stage];
                chain.push({ extensionId: extension.id, stage, run: middleware });
            },
            on<K extends keyof EngineEvents>(name: K, listener: EventListener<K>): void {
                guard('on');
                bus.on(name, listener);
            },
            emit<K extends ExtensionEventName>(name: K, payload: EngineEvents[K]): void {
                const prefix = `ext:${extension.id}:`;
                if (!name.startsWith(prefix)) {
                    throw new TypeError(`Extension "${extension.id}" may only emit events named "${prefix}<name>" (got "${name}")`);
                }
                bus.emit(name, payload);
            },
            onDispose(fn): void {
                guard('onDispose');
                disposers.push({ extensionId: extension.id, fn });
            },
        };

        try {
            await extension.setup(api);
        } finally {
            open = false;
        }
    }

    return {
        chains,
        async dispose(): Promise<void> {
            for (const { extensionId, fn } of [...disposers].reverse()) {
                try {
                    await fn();
                } catch (err) {
                    bus.emit('warning', { source: extensionId, message: `dispose failed: ${errorMessage(err)}` });
                }
            }
        },
    };
}
