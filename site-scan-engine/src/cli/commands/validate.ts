import { valueAt } from '../../shared/value-at.js';
import { describeOrigin, leafPaths } from '../../config/origins.js';
import { CommandName, type Command } from '../command.js';
import { ExitCode } from '../exit-code.js';
import { planRun } from '../plan-run.js';
import { OutputLevel } from '../ui/views.js';

function plainValue(value: unknown): string {
    return typeof value === 'string' ? JSON.stringify(value) : (JSON.stringify(value) ?? String(value));
}

/**
 * Resolves everything `scan` would (config, plugins, option schemas, the run store, the sites) and prints the plan,
 * then exits without a single request. `--verbose` also prints every effective value with its origin.
 */
export const validateCommand: Command = {
    name: CommandName.VALIDATE,
    async run(args, ctx) {
        const plan = await planRun(args, ctx);
        const { mode } = ctx;

        mode.plan(plan.view);
        if (mode.level === OutputLevel.VERBOSE) {
            mode.effectiveConfig(
                leafPaths(plan.config).sort().map((path) => ({ path, value: plainValue(valueAt(plan.config, path)), origin: describeOrigin(plan.resolved.origins[path] ?? 'default') })),
            );
        }
        const unchecked = [
            ...plan.config.scan.extensions.map((id) => ctx.registry.extensions.get(id)),
            ...plan.config.output.reporters.map((id) => ctx.registry.reporters.get(id)),
            ctx.registry.sources.get(plan.config.sites.source),
            ...ctx.adapters,
        ].filter((plugin) => plugin !== undefined && plugin.options === undefined);
        for (const plugin of unchecked) {
            mode.warning({ source: plugin?.id ?? '?', message: 'declares no option schema; its options are not validated' });
        }
        mode.validated();

        return ExitCode.OK;
    },
};
