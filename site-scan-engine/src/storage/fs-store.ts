/**
 * Built-in `fs` store. A run is a directory:
 *
 *   run.json   — tool name, adapter ids, engine version, record schema version, start time, resolved config
 *   raw.jsonl  — one ScanRecord per line, appended the moment each page finishes (crash-safe)
 *   …          — reporter output (artifacts)
 *
 * This is the only module that reads or writes run data on disk.
 */

import {
    appendFileSync,
    closeSync,
    createReadStream,
    existsSync,
    mkdirSync,
    openSync,
    readFileSync,
    readSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { OptionType } from '../contract/options.js';
import type { ScanRecord } from '../contract/record.js';
import type { ReportFile } from '../contract/reporter.js';
import type { RunMeta } from '../contract/run-meta.js';
import { defineBuiltinStore, type RunStore, type StoreOpenContext } from '../contract/store.js';
import { isRecord } from '../shared/is-record.js';
import { OptionReader } from '../shared/option-reader.js';
import { assertSafeArtifactName } from '../shared/safe-name.js';
import { BUILTIN_ENGINE_RANGE } from '../shared/version.js';
import { RunAlreadyExistsError } from './errors.js';

export const RAW_FILE = 'raw.jsonl';
export const RUN_FILE = 'run.json';

const NEWLINE = 0x0a;

/** Last byte of a file without reading the rest; -1 for an empty file. */
function lastByte(file: string): number {
    const size = statSync(file).size;
    if (size === 0) {
        return -1;
    }
    const fd = openSync(file, 'r');
    try {
        const buffer = Buffer.alloc(1);
        readSync(fd, buffer, 0, 1, size - 1);

        return buffer[0] ?? -1;
    } finally {
        closeSync(fd);
    }
}

export class FsRunStore implements RunStore {
    readonly id = 'fs';
    private tailChecked = false;

    constructor(readonly location: string) {}

    private get rawFile(): string {
        return join(this.location, RAW_FILE);
    }

    async exists(): Promise<boolean> {
        return existsSync(this.rawFile);
    }

    async create(meta: RunMeta): Promise<void> {
        if (existsSync(this.rawFile)) {
            throw new RunAlreadyExistsError(this.location);
        }
        mkdirSync(this.location, { recursive: true });
        writeFileSync(join(this.location, RUN_FILE), `${JSON.stringify(meta, null, 2)}\n`);
        writeFileSync(this.rawFile, '');
        this.tailChecked = true;
    }

    async readMeta(): Promise<RunMeta | null> {
        const file = join(this.location, RUN_FILE);
        if (!existsSync(file)) {
            return null;
        }
        const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
        if (!isRecord(parsed)) {
            throw new Error(`${file} must contain a JSON object`);
        }

        // Trust boundary: run.json is written only by this engine; the schema version is checked by the caller.
        return parsed as unknown as RunMeta;
    }

    /** Synchronous append semantics (one record per write) keep the crash-safety contract. */
    async append(record: ScanRecord): Promise<void> {
        this.repairTail();
        appendFileSync(this.rawFile, `${JSON.stringify(record)}\n`);
    }

    /** A truncated last line from an interrupted run must not swallow the next appended record. */
    private repairTail(): void {
        if (this.tailChecked) {
            return;
        }
        this.tailChecked = true;
        if (existsSync(this.rawFile) && lastByte(this.rawFile) !== NEWLINE && statSync(this.rawFile).size > 0) {
            appendFileSync(this.rawFile, '\n');
        }
    }

    /** Streams raw.jsonl line by line, skipping blank and truncated (unparseable) lines. Never loads the whole file. */
    async *records(): AsyncGenerator<ScanRecord> {
        if (!existsSync(this.rawFile)) {
            return;
        }
        const lines = createInterface({ input: createReadStream(this.rawFile, { encoding: 'utf8' }), crlfDelay: Infinity });
        for await (const line of lines) {
            if (line.trim() === '') {
                continue;
            }
            try {
                // Trust boundary: raw.jsonl is written only by this engine.
                yield JSON.parse(line) as ScanRecord;
            } catch {
                // Truncated last line from an interrupted run.
            }
        }
    }

    async writeArtifact(file: ReportFile): Promise<string> {
        assertSafeArtifactName(file.name);
        const target = join(this.location, file.name);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, file.content);

        return target;
    }
}

/**
 * Where an `fs` run lives. An absolute path is used as is; a path containing a separator (or starting with ".")
 * resolves against `baseDir`; a bare name is a run folder under `options.dir` when one is given (the generated
 * default `<tool>-<timestamp>` name), else it resolves against `baseDir` like any user-supplied path (`--out run`).
 */
export function fsRunLocation({ runId, options, baseDir }: StoreOpenContext): string {
    if (isAbsolute(runId)) {
        return runId;
    }
    if (/[\\/]/.test(runId) || runId.startsWith('.')) {
        return resolve(baseDir, runId);
    }
    const dir = new OptionReader('fs', options).string('dir');

    return dir === undefined ? resolve(baseDir, runId) : resolve(baseDir, dir, runId);
}

export const fsStore = defineBuiltinStore({
    id: 'fs',
    description: 'Run folder on the local file system (run.json + raw.jsonl + reports). Option: dir.',
    engine: BUILTIN_ENGINE_RANGE,
    options: { dir: { type: OptionType.STRING, summary: 'Parent directory for generated run folder names (output.dir)' } },
    open: (context) => new FsRunStore(fsRunLocation(context)),
});
