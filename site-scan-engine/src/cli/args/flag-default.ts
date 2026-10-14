import { DEFAULTS } from '../../config/defaults.js';
import { valueAt } from '../../shared/value-at.js';
import type { FlagSpec } from './flag-spec.js';

/** Default of a flag's config key, derived from DEFAULTS so help and docs cannot drift; `null` when there is none worth showing. */
export function flagDefault(spec: FlagSpec): string | null {
    if (spec.config === undefined) {
        return null;
    }
    const node = valueAt(DEFAULTS, spec.config);
    if (node === undefined || node === null || (Array.isArray(node) && node.length === 0)) {
        return null;
    }

    return Array.isArray(node) ? node.join(',') : String(node);
}
