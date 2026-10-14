import { isRecord } from '../shared/is-record.js';
import { DEFAULTS } from './defaults.js';
import { REMOVED_KEYS } from './removed-keys.js';
import { SECTION_VALIDATORS } from './sections/index.js';
import type { ValidationContext } from './sections/section-validator.js';
import type { ScanConfig } from './types.js';

/** Sections whose keys are fixed; anything else in them is a typo and is rejected. */
const FIXED_SECTIONS = ['sites', 'scan', 'http', 'output'] as const;
const TOP_LEVEL_KEYS: ReadonlySet<string> = new Set(Object.keys(DEFAULTS));

function unknownKeyProblems(config: Readonly<Record<string, unknown>>): string[] {
    const problems: string[] = [];

    for (const key of Object.keys(config)) {
        const hint = REMOVED_KEYS[key];
        if (hint !== undefined) {
            problems.push(`config key "${key}" was removed: ${hint}`);
        } else if (!TOP_LEVEL_KEYS.has(key)) {
            problems.push(`unknown config key "${key}"`);
        }
    }
    for (const section of FIXED_SECTIONS) {
        const value = config[section];
        if (!isRecord(value)) {
            problems.push(`${section} must be an object`);
            continue;
        }
        for (const key of Object.keys(value)) {
            const path = `${section}.${key}`;
            const hint = REMOVED_KEYS[path];
            if (hint !== undefined) {
                problems.push(`config key "${path}" was removed: ${hint}`);
            } else if (!(key in DEFAULTS[section])) {
                problems.push(`unknown config key "${path}"`);
            }
        }
    }

    return problems;
}

/**
 * Returns every problem in a resolved config (empty array = valid). Checks shape and value ranges
 * so mistakes fail before any site is fetched.
 */
export function validateConfig(config: ScanConfig, context: ValidationContext = {}): string[] {
    const structural = unknownKeyProblems({ ...config });
    if (structural.length > 0) {
        return structural;
    }

    return [
        ...SECTION_VALIDATORS.sites.validate(config.sites, context),
        ...SECTION_VALIDATORS.scan.validate(config.scan, context),
        ...SECTION_VALIDATORS.http.validate(config.http, context),
        ...SECTION_VALIDATORS.output.validate(config.output, context),
        ...SECTION_VALIDATORS.failOn.validate(config.failOn, context),
        ...SECTION_VALIDATORS.adapters.validate(config.adapters, context),
    ];
}
