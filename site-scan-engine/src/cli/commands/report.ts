import { runReporters } from '../../report/index.js';
import { CommandName, type Command } from '../command.js';
import { cliError, ErrorCode } from '../errors.js';
import { ExitCode } from '../exit-code.js';
import { openStore, readExistingMeta } from '../open-store.js';

export const reportCommand: Command = {
    name: CommandName.REPORT,
    async run({ flags, positionals }, { adapters, registry, toolConfig, cwd, mode }) {
        const runId = positionals[0];
        if (!runId) {
            throw cliError(ErrorCode.MissingRequiredFlag, 'report needs the run to report on.', { where: '<run>', hint: 'Example: report reports/seo-20260101-120000' });
        }
        const store = openStore({ registry, storeId: flags.string('store'), toolConfig, runId, outputDir: undefined, cwd });
        const run = await readExistingMeta(store);

        const current = adapters.map((a) => a.id);
        if (run.adapterIds.join(',') !== current.join(',')) {
            mode.warning({ source: 'report', message: `run used adapters [${run.adapterIds.join(', ')}], reporting with [${current.join(', ')}]` });
        }

        // The run's stored reporter list is used unless --reporters overrides it for this call (run.json is not changed).
        const ids = flags.strings('reporters') ?? run.config.output.reporters;
        const unknown = ids.filter((id) => !registry.reporters.get(id));
        if (unknown.length > 0) {
            throw cliError(ErrorCode.UnknownPluginId, `Unknown reporter "${unknown.join('", "')}" (known: ${registry.reporters.ids().join(', ')}).`, { where: flags.has('reporters') ? '--reporters' : 'output.reporters' });
        }

        const result = await runReporters({
            reporters: ids.flatMap((id) => registry.reporters.get(id) ?? []),
            reporterOptions: run.config.output.options,
            adapters,
            run,
            sink: store,
            onWarning: (warning) => mode.warning(warning),
        });
        mode.reportDone({ written: result.written });

        return result.failures.length > 0 ? ExitCode.ERROR : ExitCode.OK;
    },
};
