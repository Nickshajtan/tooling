import { isRecord } from './is-record.js';

/** Reads typed values out of a plugin's `options` bag; every failure names the plugin and the key. */
export class OptionReader {
    private readonly bag: Readonly<Record<string, unknown>>;

    constructor(private readonly owner: string, options: unknown) {
        if (options !== undefined && !isRecord(options)) {
            throw new TypeError(`${owner}: options must be an object`);
        }
        this.bag = options ?? {};
    }

    string(key: string): string | undefined {
        const value = this.bag[key];
        if (value !== undefined && typeof value !== 'string') {
            throw new TypeError(`${this.owner}: option "${key}" must be a string`);
        }

        return value;
    }

    stringArray(key: string, fallback: readonly string[]): readonly string[] {
        const value = this.bag[key];
        if (value === undefined) {
            return fallback;
        }
        if (!Array.isArray(value) || !value.every((item): item is string => typeof item === 'string')) {
            throw new TypeError(`${this.owner}: option "${key}" must be an array of strings`);
        }

        return value;
    }

    integer(key: string, fallback: number, minimum: number): number {
        const value = this.bag[key];
        if (value === undefined) {
            return fallback;
        }
        if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum) {
            throw new TypeError(`${this.owner}: option "${key}" must be an integer >= ${minimum}`);
        }

        return value;
    }

    stringRecord(key: string, fallback: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
        const value = this.bag[key];
        if (value === undefined) {
            return fallback;
        }
        if (!isRecord(value)) {
            throw new TypeError(`${this.owner}: option "${key}" must be an object of strings`);
        }
        const out: Record<string, string> = {};
        for (const [name, item] of Object.entries(value)) {
            if (typeof item !== 'string') {
                throw new TypeError(`${this.owner}: option "${key}" must be an object of strings`);
            }
            out[name] = item;
        }

        return out;
    }

    enumValue<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
        const value = this.bag[key];
        if (value === undefined) {
            return fallback;
        }
        const match = allowed.find((candidate) => candidate === value);
        if (match === undefined) {
            throw new TypeError(`${this.owner}: option "${key}" must be one of ${allowed.join('|')}`);
        }

        return match;
    }
}
