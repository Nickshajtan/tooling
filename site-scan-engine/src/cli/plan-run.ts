/**
 * Everything a run needs, resolved and validated BEFORE anything is fetched: config (with origins), plugins,
 * the run store, the selected sites. `scan`, `scan --dry-run` and `validate` all go through here, so what
 * `validate` approves is exactly what `scan` will do.
 */

import { basename, resolve } from 'node:path';
import { loadConfigFile, validateConfig } from '../config/index.js';
import { fileOrigin, OriginKind, resolveConfig, type ConfigLayer, type ResolvedConfig } from '../config/origins.js';
import type { ScanConfig } from '../config/types.js';
import { targetKey } from '../contract/record.js';
import type { RunMeta } from '../contract/run-meta.js';
import type { RunStore } from '../contract/store.js';
import type { Site } from '../contract/site.js';
import { loadSites, type LoadSitesResult } from '../input/index.js';
import { resolveOptions } from '../plugins/plugin-options.js';
import { siteIdsByCodeSets } from '../storage/select-sites.js';
import { ENGINE_VERSION } from '../shared/version.js';
import type { ParsedArgs } from './args/parse.js';
import { configFromFlags, flagOriginOf } from './args/to-config.js';
import { configError } from './config-problems.js';
import { cliError, CliError, ErrorCode } from './errors.js';
import { openStore, readExistingMeta } from './open-store.js';
import type { CommandContext } from './options.js';
import { stamp } from './stamp.js';
import type { PlanView } from './ui/views.js';

export interface RunPlan {
    readonly resolved: ResolvedConfig;
    readonly config: ScanConfig;
    readonly store: RunStore;
    readonly baseDir: string;
    readonly sites: LoadSitesResult;
    /** Site ids the run is restricted to (after `--site-ids` and `--from-run`), as stored for `--resume`. */
    readonly selectedSiteIds: readonly string[];
    /** The earlier run's metadata when resuming. */
    readonly stored: RunMeta | null;
    /** Targets already done (resume). */
    readonly skip: ReadonlySet<string>;
    readonly view: PlanView;
}

const WORK_PER_PAGE_MS = 400;

function fromFlagsOrigin(path: string): string {
    return flagOriginOf(path);
}

/** Config problems of the plugins that will run: every plugin's options are checked against its schema. */
function pluginOptionProblems(ctx: CommandContext, config: ScanConfig): string[] {
    const problems: string[] = [];
    const check = (label: string, plugin: { id: string; options?: unknown; engine: string; description: string } | undefined, raw: unknown, path: string): void => {
        if (!plugin) {
            return;
        }
        for (const problem of resolveOptions(plugin as never, raw).problems) {
            problems.push(`${path}${problem.key ? `.${problem.key}` : ''}: ${label} "${plugin.id}": ${problem.what}`);
        }
    };
    check('source', ctx.registry.sources.get(config.sites.source), config.sites.options[config.sites.source], `sites.options.${config.sites.source}`);
    for (const id of config.scan.extensions) {
        check('extension', ctx.registry.extensions.get(id), config.scan.options[id], `scan.options.${id}`);
    }
    for (const id of config.output.reporters) {
        check('reporter', ctx.registry.reporters.get(id), config.output.options[id], `output.options.${id}`);
    }
    for (const adapter of ctx.adapters) {
        check('adapter', adapter, config.adapters[adapter.id], `adapters.${adapter.id}`);
    }

    return problems;
}

function retryAttempts(config: ScanConfig): number | null {
    if (!config.scan.extensions.includes('retry')) {
        return null;
    }
    const raw = config.scan.options.retry;
    const attempts = typeof raw === 'object' && raw !== null && 'attempts' in raw ? (raw as { attempts: unknown }).attempts : undefined;

    return typeof attempts === 'number' ? attempts : 2;
}

function estimate(pages: number, config: ScanConfig): number | null {
    if (pages === 0) {
        return null;
    }
    const perWorker = Math.ceil(pages / config.scan.concurrency);

    return perWorker * (config.scan.delayMs + WORK_PER_PAGE_MS);
}

function sourceLabel(config: ScanConfig, baseDir: string): string {
    const options = config.sites.options[config.sites.source];
    const path = typeof options === 'object' && options !== null && 'path' in options ? (options as { path: unknown }).path : undefined;

    return typeof path === 'string' ? basename(path) || baseDir : `source "${config.sites.source}"`;
}

export async function planRun(args: ParsedArgs, ctx: CommandContext): Promise<RunPlan> {
    const { flags } = args;
    const adapterIds = ctx.adapters.map((a) => a.id);
    const skip = new Set<string>();
    let stored: RunMeta | null = null;
    let store: RunStore;
    let resolved: ResolvedConfig;
    let baseDir = ctx.cwd;

    if (flags.has('resume')) {
        store = openStore({ registry: ctx.registry, storeId: flags.string('store'), toolConfig: ctx.toolConfig, runId: flags.string('resume') ?? '', outputDir: undefined, cwd: ctx.cwd });
        stored = await readExistingMeta(store);
        const ignored = flags.names().filter((flag) => !['resume', 'help', 'store', 'quiet', 'verbose', 'json', 'no-color'].includes(flag));
        if (ignored.length > 0) {
            ctx.mode.warning({ source: 'resume', message: `--resume uses the run's stored config; ignoring --${ignored.join(', --')}` });
        }
        if (stored.adapterIds.join(',') !== adapterIds.join(',')) {
            throw cliError(ErrorCode.PluginIncompatible, `Cannot resume: adapters differ (run: ${stored.adapterIds.join(', ')}; now: ${adapterIds.join(', ')}).`, { where: '--resume', hint: 'Resume with the same adapters the run was started with.' });
        }
        // The stored config is authoritative; changing settings mid-run would mix incomparable records.
        resolved = resolveConfig([{ origin: OriginKind.RUN, config: stored.config }]);
        baseDir = stored.baseDir;
    } else {
        let file: ReturnType<typeof loadConfigFile> | undefined;
        const configPath = flags.string('config');
        if (configPath !== undefined) {
            try {
                file = loadConfigFile(resolve(ctx.cwd, configPath));
            } catch (err) {
                throw cliError(ErrorCode.ConfigFileUnreadable, err instanceof Error ? err.message : String(err), { where: `--config ${configPath}` });
            }
            baseDir = file.baseDir;
        }
        const lower = resolveConfig([{ origin: OriginKind.TOOL, config: ctx.toolConfig }, { origin: file ? fileOrigin(file.path) : OriginKind.TOOL, config: file?.config }]);
        const layers: ConfigLayer[] = [
            { origin: OriginKind.TOOL, config: ctx.toolConfig },
            { origin: file ? fileOrigin(file.path) : OriginKind.TOOL, config: file?.config },
            { origin: fromFlagsOrigin, config: configFromFlags(flags, lower.config.sites.source, ctx.cwd) },
        ];
        resolved = resolveConfig(layers);
        const explicit = flags.string('out');
        store = openStore({
            registry: ctx.registry,
            storeId: resolved.config.output.store,
            toolConfig: ctx.toolConfig,
            runId: explicit ?? `${ctx.name}-${stamp(ctx.now())}`,
            // A generated name goes under output.dir; a location the user typed is theirs, resolved against the cwd.
            outputDir: explicit === undefined ? resolved.config.output.dir : undefined,
            cwd: ctx.cwd,
        });
    }
    const config = resolved.config;

    const problems = [
        ...validateConfig(config, {
            adapterIds,
            sourceIds: ctx.registry.sources.ids(),
            extensionIds: ctx.registry.extensions.ids(),
            storeIds: ctx.registry.stores.ids(),
            reporterIds: ctx.registry.reporters.ids(),
        }),
    ];
    if (problems.length > 0) {
        throw configError(problems, config, resolved.origins);
    }
    const optionProblems = pluginOptionProblems(ctx, config);
    if (optionProblems.length > 0) {
        throw configError(optionProblems, config, resolved.origins);
    }

    let siteIds: Set<string> | undefined = config.sites.siteIds.length > 0 ? new Set(config.sites.siteIds) : undefined;
    let selectedSiteIds: readonly string[] = config.sites.siteIds;
    let excludeSiteIds: Set<string> | undefined;
    const fromRun = flags.string('from-run');
    if (!stored && fromRun !== undefined) {
        const other = openStore({ registry: ctx.registry, storeId: config.output.store, toolConfig: ctx.toolConfig, runId: fromRun, outputDir: undefined, cwd: ctx.cwd });
        if (!(await other.exists())) {
            throw cliError(ErrorCode.RunNotFound, `No run at ${other.location}.`, { where: `--from-run ${fromRun}`, hint: 'Point it at a finished run directory.' });
        }
        const includeCodes = flags.strings('code');
        const sets = await siteIdsByCodeSets(other, includeCodes ?? [], flags.strings('exclude-code') ?? []);
        excludeSiteIds = sets.excluded;
        if (includeCodes !== undefined) {
            const existing = siteIds;
            siteIds = existing ? new Set([...existing].filter((id) => sets.included.has(id))) : sets.included;
        }
    }

    const source = ctx.registry.sources.get(config.sites.source);
    if (!source) {
        throw cliError(ErrorCode.UnknownPluginId, `Unknown source "${config.sites.source}".`, { where: 'sites.source' });
    }
    let sites: LoadSitesResult;
    try {
        sites = await loadSites({
            source,
            sourceOptions: config.sites.options[source.id],
            baseDir,
            filter: config.sites.filter,
            siteIds,
            excludeSiteIds,
            limit: config.sites.limit,
            onWarning: (warning) => ctx.mode.warning(warning),
        });
    } catch (err) {
        if (err instanceof CliError) {
            throw err;
        }
        const message = err instanceof Error ? err.message : String(err);
        const noTargets = err instanceof TypeError && message.startsWith('No targets');
        throw cliError(noTargets ? ErrorCode.NoSitesSelected : ErrorCode.SourceFailed, message, { where: `sites.source = ${source.id}` });
    }

    if (!stored && fromRun !== undefined) {
        // The selection is "everything minus X": store the concrete set so a resume needs no earlier run.
        selectedSiteIds = sites.sites.map((site: Site) => site.siteId);
    }

    if (stored) {
        for await (const record of store.records()) {
            skip.add(targetKey(record.siteId, record.path));
        }
    }
    const pages = sites.sites.flatMap((site: Site) => config.scan.paths.map((path) => targetKey(site.siteId, path))).filter((key) => !skip.has(key)).length;
    const totalPages = sites.sites.length * config.scan.paths.length;

    const view: PlanView = {
        tool: ctx.name,
        engineVersion: ENGINE_VERSION,
        sites: {
            source: source.id,
            label: sourceLabel(config, baseDir),
            loaded: sites.loaded,
            filter: config.sites.filter,
            afterFilter: sites.loaded - sites.excluded.inactive - sites.excluded.private,
            excludedPrivate: sites.excluded.private,
            excludedInactive: sites.excluded.inactive,
            excludedByRun: sites.excluded.byRun,
            dropped: sites.dropped,
        },
        pages,
        paths: config.scan.paths,
        checks: ctx.adapters.map((a) => a.id),
        fetching: { concurrency: config.scan.concurrency, delayMs: config.scan.delayMs, timeoutMs: config.http.timeoutMs, retryAttempts: retryAttempts(config) },
        extensions: config.scan.extensions.filter((id) => id !== 'retry'),
        output: { location: store.location, reporters: config.output.reporters },
        estimateMs: estimate(pages, config),
        resume: stored ? { done: totalPages - pages, left: pages } : null,
    };

    return { resolved, config, store, baseDir, sites, selectedSiteIds, stored, skip, view };
}
