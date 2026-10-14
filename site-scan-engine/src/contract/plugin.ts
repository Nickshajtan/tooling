/**
 * Rules shared by all plugin kinds: kebab-case id, description, an `engine` semver range the running
 * engine satisfies, and no id that collides with a built-in of the same kind.
 */

import { errorMessage } from '../shared/error-message.js';
import { isRecord } from '../shared/is-record.js';
import type { OptionSchema } from './options.js';
import { satisfies } from '../shared/semver.js';
import { ENGINE_VERSION } from '../shared/version.js';

export const PluginKind = {
    SOURCE: 'source',
    ADAPTER: 'adapter',
    REPORTER: 'reporter',
    EXTENSION: 'extension',
    STORE: 'store',
} as const;

export type PluginKind = (typeof PluginKind)[keyof typeof PluginKind];

/** Ids shipped by the engine, per kind. A tool plugin may not reuse one (nothing is overridden silently). */
export const BUILTIN_IDS = {
    [PluginKind.SOURCE]: ['csv', 'url'],
    [PluginKind.ADAPTER]: [],
    [PluginKind.REPORTER]: ['results-csv', 'findings-csv', 'summary-md'],
    [PluginKind.EXTENSION]: ['retry', 'host-map'],
    [PluginKind.STORE]: ['fs'],
} as const satisfies Record<PluginKind, readonly string[]>;

export interface PluginIdentity {
    readonly id: string;
    readonly description: string;
    /** Semver range of engine versions this plugin works with, e.g. `^0.2.0`. */
    readonly engine: string;
    /** Declares and documents the plugin's options; the engine validates them and applies the defaults. */
    readonly options?: OptionSchema;
}

export interface AssertPluginOptions {
    /** Set only for plugins shipped by the engine itself; they may use reserved ids. */
    readonly builtin?: boolean;
}

const ID_PATTERN = /^[a-z][a-z0-9-]*$/;

function engineProblems(engine: unknown): string[] {
    if (typeof engine !== 'string') {
        return ['engine must be a semver range string such as "^0.2.0"'];
    }
    try {
        return satisfies(engine, ENGINE_VERSION) ? [] : [`engine range "${engine}" is not compatible with engine ${ENGINE_VERSION}`];
    } catch (err) {
        return [errorMessage(err)];
    }
}

/** Problems with the identity fields every plugin kind shares. */
export function identityProblems(
    kind: PluginKind,
    candidate: Readonly<Record<string, unknown>>,
    { builtin = false }: AssertPluginOptions = {},
): string[] {
    const problems: string[] = [];
    const { id, description, engine } = candidate;

    if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
        problems.push('id must be lowercase kebab-case');
    } else if (!builtin && (BUILTIN_IDS[kind] as readonly string[]).includes(id)) {
        problems.push(`id "${id}" is reserved by a built-in ${kind}`);
    }
    if (typeof description !== 'string') {
        problems.push('description must be a string');
    }
    problems.push(...engineProblems(engine));
    if (candidate.options !== undefined && !isRecord(candidate.options)) {
        problems.push('options must be an object of option specs');
    }

    return problems;
}

/** Throws one TypeError listing every problem, or returns when there are none. */
export function throwIfInvalid(kind: PluginKind, candidate: Readonly<Record<string, unknown>>, problems: readonly string[]): void {
    if (problems.length > 0) {
        const id = typeof candidate.id === 'string' ? candidate.id : '?';
        throw new TypeError(`Invalid ${kind} "${id}": ${problems.join('; ')}`);
    }
}
