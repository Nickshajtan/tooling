import { assertExtension, type Extension } from '../contract/extension.js';
import { assertReporter, type Reporter } from '../contract/reporter.js';
import { assertSource, type SiteSource } from '../contract/source.js';
import { assertStore, type RunStoreFactory } from '../contract/store.js';
import { csvSource } from '../input/sources/csv.js';
import { urlSource } from '../input/sources/url.js';
import { BUILTIN_REPORTERS } from '../report/reporters/index.js';
import { BUILTIN_EXTENSIONS } from '../scan/extensions/index.js';
import { fsStore } from '../storage/fs-store.js';
import { PluginSet } from './plugin-set.js';

export { PluginSet };

export interface PluginRegistryOptions {
    /** Tool-provided plugins; validated here, and an id may not collide with a built-in or another tool plugin. */
    readonly sources?: readonly SiteSource[];
    readonly reporters?: readonly Reporter[];
    readonly extensions?: readonly Extension[];
    readonly stores?: readonly RunStoreFactory[];
}

export interface PluginRegistry {
    readonly sources: PluginSet<SiteSource>;
    readonly reporters: PluginSet<Reporter>;
    readonly extensions: PluginSet<Extension>;
    readonly stores: PluginSet<RunStoreFactory>;
}

/** Extensions available to a run: built-ins plus the tool's. Being available does not activate them. */
export function createExtensionSet(tool: readonly Extension[] = []): PluginSet<Extension> {
    const set = new PluginSet<Extension>(BUILTIN_EXTENSIONS);
    tool.forEach((extension) => set.add(extension, assertExtension));

    return set;
}

export function createRegistry({ sources = [], reporters = [], extensions = [], stores = [] }: PluginRegistryOptions = {}): PluginRegistry {
    const sourceSet = new PluginSet<SiteSource>([csvSource, urlSource]);
    const reporterSet = new PluginSet<Reporter>(BUILTIN_REPORTERS);
    sources.forEach((source) => sourceSet.add(source, assertSource));
    reporters.forEach((reporter) => reporterSet.add(reporter, assertReporter));
    const storeSet = new PluginSet<RunStoreFactory>([fsStore]);
    stores.forEach((store) => storeSet.add(store, assertStore));

    return { sources: sourceSet, reporters: reporterSet, extensions: createExtensionSet(extensions), stores: storeSet };
}
