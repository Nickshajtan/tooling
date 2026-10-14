import { CommandName, FlagGroup, FlagType, type FlagSpec } from './flag-spec.js';

const { SCAN, REPORT, VALIDATE, PLUGINS } = CommandName;

/**
 * THE flag table. No flag is handled anywhere that is not listed here. A flag with a `config` path is mapped to
 * the config generically (see to-config.ts); the others (`--config`, `--out`, `--resume`, `--from-run`, `--code`,
 * `--quiet`, `--verbose`, `--json`, `--no-color`, `--dry-run`) are handled by the command itself.
 */
export const FLAGS: readonly FlagSpec[] = [
    { name: 'config', short: 'c', type: FlagType.PATH, commands: [SCAN, VALIDATE], group: FlagGroup.GENERAL, value: '<file.json>', summary: 'Read settings from a JSON config file', example: '--config scan.config.json' },
    { name: 'sites', type: FlagType.PATH, commands: [SCAN, VALIDATE], group: FlagGroup.TARGETS, value: '<csv>', summary: 'csv source: sites from a CSV file (wp site list export)', conflictsWith: ['url', 'source'], example: '--sites sites.local.csv' },
    { name: 'url', type: FlagType.URL, repeatable: true, commands: [SCAN, VALIDATE], group: FlagGroup.TARGETS, value: '<url>', summary: 'url source: scan this URL, repeatable', conflictsWith: ['sites', 'source'], example: '--url https://a.test/' },
    { name: 'source', type: FlagType.STRING, config: 'sites.source', commands: [SCAN, VALIDATE], group: FlagGroup.TARGETS, value: '<id>', summary: 'Site source plugin to use', conflictsWith: ['sites', 'url'] },
    { name: 'source-opt', type: FlagType.KEYVALUE, repeatable: true, commands: [SCAN, VALIDATE], group: FlagGroup.TARGETS, value: '<key>=<value>', summary: 'Option for the selected source, repeatable', example: '--source-opt path=sites.csv' },
    { name: 'filter', type: FlagType.ENUM, enumValues: ['all', 'active', 'public'], config: 'sites.filter', commands: [SCAN, VALIDATE], group: FlagGroup.TARGETS, value: 'all|active|public', summary: 'Which sites to scan' },
    { name: 'site-ids', type: FlagType.LIST, config: 'sites.siteIds', commands: [SCAN, VALIDATE], group: FlagGroup.TARGETS, value: '1,801', summary: 'Only these site ids' },
    { name: 'from-run', type: FlagType.PATH, commands: [SCAN, VALIDATE], group: FlagGroup.TARGETS, value: '<run>', summary: 'Select sites by the findings they had in this earlier run', requiresOneOf: ['code', 'exclude-code'], example: '--from-run reports/old --code engine.fetch_failed' },
    { name: 'code', type: FlagType.LIST, commands: [SCAN, VALIDATE], group: FlagGroup.TARGETS, value: '<c>[,<c>]', summary: 'Only sites that had any of these finding codes in the --from-run run', requires: ['from-run'] },
    { name: 'exclude-code', type: FlagType.LIST, commands: [SCAN, VALIDATE], group: FlagGroup.TARGETS, value: '<c>[,<c>]', summary: 'Skip sites that had any of these finding codes in the --from-run run', requires: ['from-run'] },
    { name: 'limit', type: FlagType.INTEGER, min: 0, config: 'sites.limit', commands: [SCAN, VALIDATE], group: FlagGroup.TARGETS, value: 'N', summary: 'First N sites after filtering (0 = all)' },
    { name: 'paths', type: FlagType.LIST, config: 'scan.paths', commands: [SCAN, VALIDATE], group: FlagGroup.SCANNING, value: '/,/tee-times/', summary: 'Paths fetched on every site' },
    { name: 'concurrency', type: FlagType.INTEGER, min: 1, config: 'scan.concurrency', commands: [SCAN, VALIDATE], group: FlagGroup.SCANNING, value: 'N', summary: 'Pages fetched in parallel' },
    { name: 'delay', type: FlagType.INTEGER, min: 0, config: 'scan.delayMs', commands: [SCAN, VALIDATE], group: FlagGroup.SCANNING, value: 'MS', summary: 'Pause per worker after each page' },
    { name: 'timeout', type: FlagType.INTEGER, min: 1, config: 'http.timeoutMs', commands: [SCAN, VALIDATE], group: FlagGroup.HTTP, value: 'MS', summary: 'Per page, whole redirect chain included' },
    { name: 'out', type: FlagType.PATH, commands: [SCAN, VALIDATE], group: FlagGroup.OUTPUT, value: '<run>', summary: 'Exact run location (fs store: a directory)', conflictsWith: ['resume'] },
    { name: 'resume', type: FlagType.PATH, commands: [SCAN], group: FlagGroup.OUTPUT, value: '<run>', summary: 'Continue an interrupted run with its stored config', conflictsWith: ['out'] },
    { name: 'store', type: FlagType.STRING, config: 'output.store', commands: [SCAN, REPORT, VALIDATE], group: FlagGroup.OUTPUT, value: '<id>', summary: 'Run store plugin' },
    { name: 'reporters', type: FlagType.LIST, allowEmpty: true, config: 'output.reporters', commands: [SCAN, REPORT, VALIDATE], group: FlagGroup.OUTPUT, value: 'a,b', summary: 'Reporters to run (on report: for this call only)' },
    { name: 'fail-on', type: FlagType.ENUM, enumValues: ['error', 'warning'], config: 'failOn', commands: [SCAN, VALIDATE], group: FlagGroup.OUTPUT, value: 'error|warning', summary: 'Exit 2 if any finding at/above this level' },
    { name: 'opt', type: FlagType.KEYVALUE, repeatable: true, commands: [SCAN, VALIDATE], group: FlagGroup.PLUGINS, value: '<adapterId>.<key>=<value>', summary: 'Adapter option, repeatable', example: '--opt seo.maxTitle=60' },
    { name: 'quiet', short: 'q', type: FlagType.BOOLEAN, commands: [SCAN, REPORT, VALIDATE, PLUGINS], group: FlagGroup.GENERAL, summary: 'Errors and final file paths only', conflictsWith: ['verbose', 'json'] },
    { name: 'verbose', short: 'v', type: FlagType.BOOLEAN, commands: [SCAN, REPORT, VALIDATE, PLUGINS], group: FlagGroup.GENERAL, summary: 'Per-page lines, every warning, adapter timings', conflictsWith: ['quiet', 'json'] },
    { name: 'json', type: FlagType.BOOLEAN, commands: [SCAN, REPORT, VALIDATE, PLUGINS], group: FlagGroup.GENERAL, summary: 'Machine-readable NDJSON events on stdout', conflictsWith: ['quiet', 'verbose'] },
    { name: 'no-color', type: FlagType.BOOLEAN, commands: [SCAN, REPORT, VALIDATE, PLUGINS], group: FlagGroup.GENERAL, summary: 'No colors (same as NO_COLOR=1)' },
    { name: 'dry-run', type: FlagType.BOOLEAN, commands: [SCAN], group: FlagGroup.GENERAL, summary: 'Resolve everything, print the plan, exit without fetching', conflictsWith: ['resume'] },
    { name: 'help', short: 'h', type: FlagType.BOOLEAN, commands: [SCAN, REPORT, VALIDATE, PLUGINS], group: FlagGroup.GENERAL, summary: 'Show help' },
];

export const FLAGS_BY_NAME: ReadonlyMap<string, FlagSpec> = new Map(FLAGS.map((flag) => [flag.name, flag]));

export function flagsFor(command: CommandName): readonly FlagSpec[] {
    return FLAGS.filter((flag) => flag.commands.includes(command));
}
