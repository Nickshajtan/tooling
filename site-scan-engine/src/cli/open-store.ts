import { DEFAULTS, type PartialScanConfig } from '../config/index.js';
import type { RunMeta } from '../contract/run-meta.js';
import type { RunStore } from '../contract/store.js';
import type { PluginRegistry } from '../plugins/registry.js';
import { didYouMean } from '../shared/did-you-mean.js';
import { assertSupportedSchema, UnsupportedSchemaError } from '../storage/errors.js';
import { cliError, ErrorCode } from './errors.js';

export interface OpenStoreOptions {
    readonly registry: PluginRegistry;
    /** Store id; defaults to the tool config's `output.store`, then the engine default. */
    readonly storeId: string | undefined;
    readonly toolConfig: PartialScanConfig;
    readonly runId: string;
    /** `output.dir` for a generated default run name; `undefined` for a run location the user supplied. */
    readonly outputDir: string | undefined;
    readonly cwd: string;
}

/** Opens the run store a flag/config combination points at. Unknown store ids are errors that list the known ids. */
export function openStore({ registry, storeId, toolConfig, runId, outputDir, cwd }: OpenStoreOptions): RunStore {
    const id = storeId ?? toolConfig.output?.store ?? DEFAULTS.output.store;
    const factory = registry.stores.get(id);
    if (!factory) {
        const suggestion = didYouMean(id, registry.stores.ids());

        return failUnknownStore(id, registry.stores.ids(), suggestion);
    }

    return factory.open({ runId, options: outputDir === undefined ? {} : { dir: outputDir }, baseDir: cwd });
}

function failUnknownStore(id: string, known: readonly string[], suggestion: string | undefined): never {
    throw cliError(ErrorCode.UnknownPluginId, `Unknown store "${id}" (known: ${known.join(', ')}).`, {
        where: 'output.store',
        ...(suggestion ? { didYouMean: suggestion } : {}),
    });
}

/** Reads the metadata of an existing run, refusing a missing run or an unknown record schema. */
export async function readExistingMeta(store: RunStore): Promise<RunMeta> {
    if (!(await store.exists())) {
        throw cliError(ErrorCode.RunNotFound, `No run at ${store.location}: not a scan run.`, { where: store.location, hint: 'Point it at a run directory that contains raw.jsonl.' });
    }
    const meta = await store.readMeta();
    if (!meta) {
        throw cliError(ErrorCode.RunNotFound, `No run metadata in ${store.location}: not a scan run.`, { where: store.location });
    }
    try {
        assertSupportedSchema(meta, store.location);
    } catch (err) {
        throw err instanceof UnsupportedSchemaError
            ? cliError(ErrorCode.RunSchemaUnsupported, err.message, { where: store.location, hint: 'Use the engine version that wrote this run.' })
            : err;
    }

    return meta;
}
