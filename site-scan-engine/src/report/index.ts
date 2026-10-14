/**
 * Report layer: runs Reporter plugins over the records of a run. Reporters are pure — they return files, and the
 * engine stores them through a ReportSink — so `<tool> report <run>` can rebuild everything without network.
 */

import type { Adapter } from '../contract/adapter.js';
import type { ScanRecord } from '../contract/record.js';
import type { ReportFile, Reporter } from '../contract/reporter.js';
import type { RunMeta } from '../contract/run-meta.js';
import type { WarningSink } from '../contract/warning.js';
import { requireOptions } from '../plugins/plugin-options.js';
import { errorMessage } from '../shared/error-message.js';
import { unsafeNameProblems } from '../shared/safe-name.js';
import { modeOf, RUNNERS, type ReporterSession } from './reporter-session.js';

/** Where the engine reads records from and puts reporter output. Implemented by the run store. */
export interface ReportSink {
    records(): AsyncIterable<ScanRecord>;
    /** Returns the location of the stored file. */
    writeArtifact(file: ReportFile): Promise<string>;
}

export interface RunReportersOptions {
    readonly reporters: readonly Reporter[];
    /** `config.output.options`, keyed by reporter id. */
    readonly reporterOptions: Readonly<Record<string, unknown>>;
    readonly adapters: readonly Adapter[];
    readonly run: RunMeta;
    readonly sink: ReportSink;
    readonly onWarning: WarningSink;
}

export interface ReporterFailure {
    readonly reporterId: string;
    readonly message: string;
}

export interface RunReportersResult {
    /** Locations of every stored file, in reporter order. */
    readonly written: readonly string[];
    readonly failures: readonly ReporterFailure[];
}

interface ActiveSession {
    readonly reporter: Reporter;
    readonly session: ReporterSession;
}

function fileProblems(files: readonly ReportFile[], taken: ReadonlySet<string>): string[] {
    const problems: string[] = [];
    const own = new Set<string>();
    for (const file of files) {
        problems.push(...unsafeNameProblems(file.name).map((problem) => `${file.name}: ${problem}`));
        if (taken.has(file.name) || own.has(file.name)) {
            problems.push(`${file.name}: another reporter already writes this file`);
        }
        own.add(file.name);
    }

    return problems;
}

/**
 * Runs the reporters in one pass over the records. A reporter that throws (or returns unsafe/duplicate file names)
 * is reported as a failure and the others still run; its files are not stored.
 */
export async function runReporters({
    reporters,
    reporterOptions,
    adapters,
    run,
    sink,
    onWarning,
}: RunReportersOptions): Promise<RunReportersResult> {
    const failures: ReporterFailure[] = [];
    const fail = (reporter: Reporter, err: unknown): void => {
        const message = errorMessage(err);
        failures.push({ reporterId: reporter.id, message });
        onWarning({ source: reporter.id, message: `reporter failed: ${message}` });
    };

    const active: ActiveSession[] = [];
    for (const reporter of reporters) {
        try {
            const session = await RUNNERS[modeOf(reporter)].start(reporter, { adapters, run, options: requireOptions('reporter', reporter, reporterOptions[reporter.id]) });
            active.push({ reporter, session });
        } catch (err) {
            fail(reporter, err);
        }
    }

    const retain = active.some(({ reporter }) => RUNNERS[modeOf(reporter)].retainsRecords);
    const all: ScanRecord[] = [];
    const broken = new Set<Reporter>();
    if (active.length > 0) {
        for await (const record of sink.records()) {
            if (retain) {
                all.push(record);
            }
            for (const { reporter, session } of active) {
                if (broken.has(reporter)) {
                    continue;
                }
                try {
                    await session.consume(record);
                } catch (err) {
                    broken.add(reporter);
                    fail(reporter, err);
                }
            }
        }
    }

    const written: string[] = [];
    const taken = new Set<string>();
    for (const { reporter, session } of active) {
        if (broken.has(reporter)) {
            continue;
        }
        try {
            const files = await session.finish(all);
            const problems = fileProblems(files, taken);
            if (problems.length > 0) {
                throw new Error(problems.join('; '));
            }
            for (const file of files) {
                taken.add(file.name);
                written.push(await sink.writeArtifact(file));
            }
        } catch (err) {
            fail(reporter, err);
        }
    }

    return { written, failures };
}
