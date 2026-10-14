/** An id-keyed set of plugins of one kind: built-ins first, then tool plugins added after validation. */
export class PluginSet<T extends { readonly id: string }> {
    private readonly byId = new Map<string, T>();

    constructor(builtins: readonly T[]) {
        for (const plugin of builtins) {
            this.byId.set(plugin.id, plugin);
        }
    }

    /** Adds a tool plugin after `check` passed; throws on a duplicate id (built-in collisions fail in `check`). */
    add(plugin: T, check: (candidate: unknown) => void): void {
        check(plugin);
        if (this.byId.has(plugin.id)) {
            throw new TypeError(`Duplicate plugin id "${plugin.id}"`);
        }
        this.byId.set(plugin.id, plugin);
    }

    get(id: string): T | undefined {
        return this.byId.get(id);
    }

    ids(): string[] {
        return [...this.byId.keys()];
    }
}
