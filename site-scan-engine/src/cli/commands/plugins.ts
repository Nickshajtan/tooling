import type { OptionSchema } from '../../contract/options.js';
import type { PluginIdentity } from '../../contract/plugin.js';
import type { PluginSet } from '../../plugins/plugin-set.js';
import { CommandName, type Command } from '../command.js';
import { ExitCode } from '../exit-code.js';
import type { OptionListing, PluginListing } from '../ui/views.js';

function listOptions(schema: OptionSchema | undefined): OptionListing[] | null {
    if (!schema) {
        return null;
    }

    return Object.entries(schema).map(([name, spec]) => ({
        name,
        type: spec.type,
        summary: spec.summary,
        required: spec.required === true,
        ...(spec.default !== undefined ? { default: spec.default } : {}),
    }));
}

function listing(plugin: PluginIdentity): PluginListing {
    return { id: plugin.id, engine: plugin.engine, description: plugin.description, options: listOptions(plugin.options) };
}

function group<T extends PluginIdentity>(kind: string, set: PluginSet<T>): { kind: string; plugins: PluginListing[] } {
    return { kind, plugins: set.ids().flatMap((id) => set.get(id) ?? []).map(listing) };
}

/** Lists every plugin the tool has: id, engine range, description and the options each declares. */
export const pluginsCommand: Command = {
    name: CommandName.PLUGINS,
    async run(_args, { registry, adapters, mode }) {
        mode.pluginList({
            groups: [
                group('sources', registry.sources),
                { kind: 'adapters', plugins: adapters.map(listing) },
                group('reporters', registry.reporters),
                group('extensions', registry.extensions),
                group('stores', registry.stores),
            ],
        });

        return ExitCode.OK;
    },
};
