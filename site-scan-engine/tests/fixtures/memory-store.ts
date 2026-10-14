import { defineStore, RunAlreadyExistsError } from '../../src/index.js';
import type { ReportFile, RunMeta, RunStore, RunStoreFactory, ScanRecord } from '../../src/index.js';
import { assertSafeArtifactName } from '../../src/shared/safe-name.js';

/** In-memory RunStore: no temp directories, and proof that nothing in the CLI is coupled to the file system. */
export class MemoryRunStore implements RunStore {
    readonly id = 'memory';
    meta: RunMeta | null = null;
    readonly lines: string[] = [];
    readonly artifacts = new Map<string, string | Uint8Array>();

    constructor(readonly location: string) {}

    async exists(): Promise<boolean> {
        return this.meta !== null;
    }

    async create(meta: RunMeta): Promise<void> {
        if (this.meta !== null) {
            throw new RunAlreadyExistsError(this.location);
        }
        this.meta = meta;
    }

    async readMeta(): Promise<RunMeta | null> {
        return this.meta;
    }

    async append(record: ScanRecord): Promise<void> {
        this.lines.push(JSON.stringify(record));
    }

    async *records(): AsyncGenerator<ScanRecord> {
        for (const line of this.lines) {
            try {
                yield JSON.parse(line) as ScanRecord;
            } catch {
                // a partially written final record is silently dropped
            }
        }
    }

    async writeArtifact(file: ReportFile): Promise<string> {
        assertSafeArtifactName(file.name);
        this.artifacts.set(file.name, file.content);

        return `memory:${this.location}/${file.name}`;
    }
}

/** A factory whose runs live in a shared map, so a second `open` with the same runId sees the same run. */
export function memoryStoreFactory(runs: Map<string, MemoryRunStore> = new Map()): RunStoreFactory & { readonly runs: Map<string, MemoryRunStore> } {
    const factory = defineStore({
        id: 'memory',
        description: 'Test: in-memory run',
        engine: '^0.2.0',
        open({ runId }) {
            let run = runs.get(runId);
            if (!run) {
                run = new MemoryRunStore(runId);
                runs.set(runId, run);
            }

            return run;
        },
    });

    return { ...factory, runs };
}
