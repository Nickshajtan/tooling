/**
 * Validates a plugin's options against its OptionSchema, applies the defaults and hands back the result.
 * Plugins without a schema keep their options unchecked (and `validate` warns about it).
 */

import type { OptionProblem, OptionSchema } from '../contract/options.js';
import type { PluginIdentity } from '../contract/plugin.js';
import { didYouMean } from '../shared/did-you-mean.js';
import { deepFreeze } from '../shared/deep-freeze.js';
import { isRecord } from '../shared/is-record.js';
import { OPTION_RULES } from './option-rules/index.js';

export interface ResolvedOptions {
    readonly options: unknown;
    readonly problems: readonly OptionProblem[];
}

function resolveAgainst(schema: OptionSchema, raw: unknown): ResolvedOptions {
    if (raw !== undefined && !isRecord(raw)) {
        return { options: {}, problems: [{ key: null, what: 'options must be an object' }] };
    }
    const bag = raw ?? {};
    const problems: OptionProblem[] = [];
    const known = Object.keys(schema);

    for (const key of Object.keys(bag)) {
        if (!(key in schema)) {
            const suggestion = didYouMean(key, known);
            problems.push({
                key,
                what: `unknown option "${key}" (known: ${known.join(', ') || 'none'})`,
                ...(suggestion !== undefined ? { didYouMean: suggestion } : {}),
            });
        }
    }

    const resolved: Record<string, unknown> = {};
    for (const [key, spec] of Object.entries(schema)) {
        const value = bag[key];
        if (value === undefined) {
            if (spec.required) {
                problems.push({ key, what: `option "${key}" is required` });
            } else if (spec.default !== undefined) {
                resolved[key] = structuredClone(spec.default);
            }
            continue;
        }
        const found = OPTION_RULES[spec.type].check(value, spec);
        if (found.length > 0) {
            problems.push(...found.map((what) => ({ key, what: `option "${key}" ${what}` })));
        } else {
            resolved[key] = value;
        }
    }

    return { options: deepFreeze(resolved), problems };
}

/** Problems with `raw` for this plugin (empty = valid or unchecked), and the options with defaults applied. */
export function resolveOptions(plugin: PluginIdentity, raw: unknown): ResolvedOptions {
    return plugin.options ? resolveAgainst(plugin.options, raw) : { options: raw ?? {}, problems: [] };
}

/** Resolved options, or a TypeError naming the plugin when they are invalid. */
export function requireOptions(kind: string, plugin: PluginIdentity, raw: unknown): unknown {
    const { options, problems } = resolveOptions(plugin, raw);
    if (problems.length > 0) {
        throw new TypeError(`${kind} "${plugin.id}": ${problems.map((problem) => problem.what).join('; ')}`);
    }

    return options;
}
