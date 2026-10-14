import { RECORD_SCHEMA_VERSION } from '../../contract/record.js';
import type { RunMeta } from '../../contract/run-meta.js';
import { Severity } from '../../contract/severity.js';
import { runReporters } from '../../report/index.js';
import { Engine } from '../../scan/engine.js';
import { ENGINE_VERSION } from '../../shared/version.js';
import { RunAlreadyExistsError } from '../../storage/errors.js';
import { CommandName, type Command } from '../command.js';
import { cliError, ErrorCode } from '../errors.js';
import { ExitCode } from '../exit-code.js';
import { planRun, type RunPlan } from '../plan-run.js';
import { RunStats } from '../run-stats.js';
import { NotableKind } from '../ui/views.js';

const FORCE_QUIT_AFTER = 2;

/** The one follow-up worth suggesting: resume an interrupted run, else re-scan fetch failures, else nothing. */
function nextStep(name: string, location: string, interrupted: boolean, fetchFailures: number): string | null {
    if (interrupted) {
        return `${name} scan --resume ${location}`;
    }

    return fetchFailures > 0 ? `${name} scan --from-run ${location} --code engine.fetch_failed` : null;
}

async function exceedsThreshold(plan: RunPlan, failOn: 'error' | 'warning'): Promise<boolean> {
    const levels: readonly string[] = failOn === Severity.WARNING ? [Severity.ERROR, Severity.WARNING] : [Severity.ERROR];
    for await (const record of plan.store.records()) {
        if (Object.values(record.adapters).some((a) => a.findings.some((f) => levels.includes(f.severity)))) {
            return true;
        }
    }

    return false;
}

export const scanCommand: Command = {
    name: CommandName.SCAN,
    async run(args, ctx) {
        const { flags } = args;
        const { mode, name } = ctx;
        const plan = await planRun(args, ctx);
        const { config, store, view } = plan;

        mode.plan(view);
        if (flags.flag('dry-run')) {
            mode.validated();

            return ExitCode.OK;
        }

        let meta: RunMeta;
        if (plan.stored) {
            meta = plan.stored;
        } else {
            meta = {
                tool: name,
                adapterIds: ctx.adapters.map((a) => a.id),
                engineVersion: ENGINE_VERSION,
                recordSchemaVersion: RECORD_SCHEMA_VERSION,
                startedAt: ctx.now().toISOString(),
                baseDir: plan.baseDir,
                config: { ...config, sites: { ...config.sites, siteIds: plan.selectedSiteIds } },
            };
            try {
                await store.create(meta);
            } catch (err) {
                throw err instanceof RunAlreadyExistsError
                    ? cliError(ErrorCode.RunAlreadyExists, err.message, { where: store.location, hint: `Resume it with: ${name} scan --resume ${store.location}` })
                    : err;
            }
        }

        const stats = new RunStats(ctx.clock);
        const controller = new AbortController();
        let interrupts = 0;
        let inFlight = 0;
        // The second Ctrl+C settles this promise; the scan loop is raced against it, so nothing else is awaited.
        let forceQuit: () => void = () => {};
        const forced = new Promise<'forced'>((resolve) => {
            forceQuit = () => resolve('forced');
        });
        const unsubscribe = ctx.signals.subscribe(() => {
            interrupts += 1;
            if (interrupts >= FORCE_QUIT_AFTER) {
                forceQuit();

                return;
            }
            controller.abort();
            mode.interrupted(inFlight);
        });

        const fetchTypesSeen = new Set<string>();
        try {
            const engine = await Engine.create({
                config,
                adapters: ctx.adapters,
                extensions: ctx.toolExtensions,
                now: ctx.now,
                stderr: { write: (chunk: string) => ctx.terminal.err(chunk) },
            });
            engine.on('run:start', (event) => {
                stats.start(event.total);
            });
            engine.on('target:start', () => {
                inFlight += 1;
            });
            engine.on('warning', (warning) => {
                stats.warningCount += 1;
                mode.warning(warning);
            });
            engine.on('adapter:end', (event) => {
                stats.adapterTime(event.adapterId, event.durationMs);
                if (event.failed) {
                    mode.notable({ kind: NotableKind.ADAPTER, message: `adapter ${event.adapterId} crashed on ${event.target.url}: ${event.result.findings[0]?.message ?? ''}` });
                }
            });
            engine.on('target:end', ({ record }) => {
                inFlight -= 1;
                if (!record) {
                    return;
                }
                stats.add(record);
                const progress = stats.progress();
                if (record.http.error !== '') {
                    mode.notable({ kind: NotableKind.FETCH, errorType: record.http.error, message: `${record.siteId} ${record.url} ${record.http.error}` });
                    fetchTypesSeen.add(record.http.error);
                }
                mode.target({ done: progress.done, total: progress.total, siteId: record.siteId, path: record.path, status: record.http.status, timingMs: record.http.timingMs, error: record.http.error });
                mode.progress(progress);
            });
            const drain = (async (): Promise<'done'> => {
                for await (const record of engine.scan({ sites: plan.sites.sites, skip: plan.skip, signal: controller.signal })) {
                    await store.append(record);
                }

                return 'done';
            })();
            if ((await Promise.race([drain, forced])) === 'forced') {
                // Only records already appended are kept; the abandoned loop may still finish in the background.
                drain.catch(() => {});
                mode.close();

                return ExitCode.Interrupted;
            }
        } finally {
            unsubscribe();
        }

        const result = await runReporters({
            reporters: config.output.reporters.flatMap((id) => ctx.registry.reporters.get(id) ?? []),
            reporterOptions: config.output.options,
            adapters: ctx.adapters,
            run: meta,
            sink: store,
            onWarning: (warning) => {
                stats.warningCount += 1;
                mode.warning(warning);
            },
        });

        const interrupted = controller.signal.aborted;
        const reached = config.failOn !== null && !interrupted && result.failures.length === 0 ? await exceedsThreshold(plan, config.failOn) : false;
        mode.summary(stats.summary({
            tool: name,
            written: result.written,
            location: store.location,
            interrupted,
            threshold: config.failOn === null ? null : { level: config.failOn, reached },
            next: nextStep(name, store.location, interrupted, stats.fetchFailures),
        }));

        if (interrupted) {
            return ExitCode.Interrupted;
        }
        if (result.failures.length > 0) {
            return ExitCode.ERROR;
        }

        return reached ? ExitCode.THRESHOLD : ExitCode.OK;
    },
};
