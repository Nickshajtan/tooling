import type { ReportContext, ReportFile, Reporter } from '../contract/reporter.js';
import type { ScanRecord } from '../contract/record.js';
import { sortRecords } from './sort.js';

export const ReporterMode = {
    /** `render`: gets every record at once, sorted. */
    RENDER: 'render',
    /** `open`: gets records one by one in completion order. */
    STREAM: 'stream',
} as const;

export type ReporterMode = (typeof ReporterMode)[keyof typeof ReporterMode];

/** One reporter's participation in a single pass over the records. */
export interface ReporterSession {
    consume(record: ScanRecord): Promise<void>;
    /** `all` holds every record (only populated when some session retains records). */
    finish(all: readonly ScanRecord[]): Promise<readonly ReportFile[]>;
}

/** Strategy per reporter mode. */
export interface ReporterRunner {
    /** True when sessions of this mode need the full record list at the end. */
    readonly retainsRecords: boolean;
    start(reporter: Reporter, context: ReportContext): Promise<ReporterSession>;
}

const renderRunner: ReporterRunner = {
    retainsRecords: true,
    async start(reporter, context) {
        return {
            async consume() {},
            async finish(all) {
                return (await reporter.render?.(sortRecords(all), context)) ?? [];
            },
        };
    },
};

const streamRunner: ReporterRunner = {
    retainsRecords: false,
    async start(reporter, context) {
        const stream = await reporter.open?.(context);

        return {
            async consume(record) {
                await stream?.write(record);
            },
            async finish() {
                return (await stream?.close()) ?? [];
            },
        };
    },
};

export const RUNNERS = {
    [ReporterMode.RENDER]: renderRunner,
    [ReporterMode.STREAM]: streamRunner,
} as const satisfies Record<ReporterMode, ReporterRunner>;

export function modeOf(reporter: Reporter): ReporterMode {
    return typeof reporter.open === 'function' ? ReporterMode.STREAM : ReporterMode.RENDER;
}
