import type { ScanConfig } from '../config/index.js';

/** Contents of run.json. */
export interface RunMeta {
    readonly tool: string;
    readonly adapterIds: readonly string[];
    readonly engineVersion: string;
    readonly recordSchemaVersion: number;
    readonly startedAt: string;
    /** Directory relative paths in plugin options were resolved against (config file dir, or cwd). */
    readonly baseDir: string;
    readonly config: ScanConfig;
}
