/** Typed access to the flag values the parser collected (coerced per the flag table). */
export class ParsedFlags {
    constructor(private readonly values: ReadonlyMap<string, unknown>) {}

    has(name: string): boolean {
        return this.values.has(name);
    }

    /** Names of the flags that were given, in the order they were first seen. */
    names(): string[] {
        return [...this.values.keys()];
    }

    string(name: string): string | undefined {
        const value = this.values.get(name);

        return typeof value === 'string' ? value : undefined;
    }

    /** `list` flags and repeated flags. */
    strings(name: string): string[] | undefined {
        const value = this.values.get(name);

        return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : undefined;
    }

    integer(name: string): number | undefined {
        const value = this.values.get(name);

        return typeof value === 'number' ? value : undefined;
    }

    flag(name: string): boolean {
        return this.values.get(name) === true;
    }
}
