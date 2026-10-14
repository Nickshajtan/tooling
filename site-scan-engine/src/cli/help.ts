/** `--help` text, generated from the flag table: it can never disagree with what the parser accepts. */

import { flagDefault } from './args/flag-default.js';
import { CommandName, FLAG_GROUP_ORDER, type FlagSpec } from './args/flag-spec.js';
import { flagsFor, FLAGS } from './args/flags.js';

const COMMAND_SUMMARY = {
    [CommandName.SCAN]: 'Fetch every site once, run the checks, write the reports',
    [CommandName.REPORT]: 'Rebuild the reports of a finished run (no network)',
    [CommandName.VALIDATE]: 'Check config, plugins and sites, print the plan, fetch nothing',
    [CommandName.PLUGINS]: 'List the available plugins and their options',
} as const satisfies Record<CommandName, string>;

const COMMAND_USAGE = {
    [CommandName.SCAN]: 'scan [--config <file.json>] [options]\n  {name} scan --resume <run>',
    [CommandName.REPORT]: 'report <run> [--reporters a,b]',
    [CommandName.VALIDATE]: 'validate [--config <file.json>] [options]',
    [CommandName.PLUGINS]: 'plugins',
} as const satisfies Record<CommandName, string>;

function flagLine(spec: FlagSpec, width: number): string {
    const names = `${spec.short ? `-${spec.short}, ` : '    '}--${spec.name}${spec.value ? ` ${spec.value}` : ''}`;
    const fallback = flagDefault(spec);

    return `  ${names.padEnd(width)}  ${spec.summary}${fallback ? ` (default: ${fallback})` : ''}`;
}

function flagBlock(flags: readonly FlagSpec[]): string {
    const width = Math.max(...flags.map((spec) => `${spec.short ? '-x, ' : '    '}--${spec.name}${spec.value ? ` ${spec.value}` : ''}`.length));
    const sections: string[] = [];
    for (const group of FLAG_GROUP_ORDER) {
        const inGroup = flags.filter((spec) => spec.group === group);
        if (inGroup.length > 0) {
            sections.push(`${group}\n${inGroup.map((spec) => flagLine(spec, width)).join('\n')}`);
        }
    }

    return sections.join('\n\n');
}

export function helpText(name: string, adapterIds: readonly string[], command?: CommandName): string {
    if (command) {
        const usage = COMMAND_USAGE[command].replaceAll('{name}', name);
        const flags = flagsFor(command);

        return `${COMMAND_SUMMARY[command]}.\n\nUsage:\n  ${name} ${usage}\n\n${flags.length > 0 ? `${flagBlock(flags)}\n\n` : ''}Adapters: ${adapterIds.join(', ')}\nPrecedence: engine defaults < tool config < --config file < flags.\n`;
    }
    const commands = Object.values(CommandName).map((entry) => `  ${name} ${entry.padEnd(9)} ${COMMAND_SUMMARY[entry]}`).join('\n');

    return `Usage:\n  ${name} <command> [options]\n\nCommands:\n${commands}\n\nRun \`${name} <command> --help\` for the options of one command.\n\n${flagBlock(FLAGS)}\n\nAdapters: ${adapterIds.join(', ')}\nPrecedence: engine defaults < tool config < --config file < flags.\n`;
}
