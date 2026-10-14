import type { ScanConfig } from '../types.js';

export interface ValidationContext {
    /** Adapter ids this tool knows; when given, `adapters.<id>` keys are checked against it. */
    readonly adapterIds?: readonly string[] | undefined;
    /** Registered SiteSource ids; when given, `sites.source` and `sites.options` keys are checked against it. */
    readonly sourceIds?: readonly string[] | undefined;
    /** Registered Extension ids; when given, `scan.extensions` and `scan.options` keys are checked against it. */
    readonly extensionIds?: readonly string[] | undefined;
    /** Registered RunStoreFactory ids; when given, `output.store` is checked against it. */
    readonly storeIds?: readonly string[] | undefined;
    /** Registered Reporter ids; when given, `output.reporters` and `output.options` keys are checked against it. */
    readonly reporterIds?: readonly string[] | undefined;
}

/** Validates one top-level config section. Returns the problems found (empty = valid). */
export interface SectionValidator<K extends keyof ScanConfig> {
    validate(value: ScanConfig[K], context: ValidationContext): readonly string[];
}
