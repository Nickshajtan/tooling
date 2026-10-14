import { runCli } from '../../src/index.js';
import type { RunCliOptions, SignalSource } from '../../src/index.js';
import { mockExtension } from '../fixtures/mock-extension.js';
import { titleAdapter } from '../fixtures/test-adapter.js';

/** A fake terminal stream: records everything written to it. */
export interface FakeStream {
    buf: string;
    isTTY: boolean;
    columns: number;
    write(chunk: string): void;
}

export function fakeStream(isTTY = false): FakeStream {
    return {
        buf: '',
        isTTY,
        columns: 100,
        write(chunk: string): void {
            this.buf += chunk;
        },
    };
}

/** Signal source tests can fire by hand. */
export class FakeSignals implements SignalSource {
    private readonly handlers = new Set<() => void>();

    subscribe(handler: () => void): () => void {
        this.handlers.add(handler);

        return () => {
            this.handlers.delete(handler);
        };
    }

    interrupt(): void {
        for (const handler of [...this.handlers]) {
            handler();
        }
    }

    get listening(): number {
        return this.handlers.size;
    }
}

export const PAGES = {
    'https://a.test/': { html: '<title>A</title>' },
    'https://b.test/': { html: '<html></html>' },
};

export interface HarnessResult {
    readonly code: number;
    readonly stdout: FakeStream;
    readonly stderr: FakeStream;
}

export interface HarnessOptions extends Partial<RunCliOptions> {
    readonly tty?: boolean;
}

/** Runs the CLI with fake terminals and a mock network, returning exit code and captured output. */
export async function cli(argv: string[], { tty = false, ...extra }: HarnessOptions = {}): Promise<HarnessResult> {
    const stdout = fakeStream(false);
    const stderr = fakeStream(tty);
    let tick = 0;
    const code = await runCli({
        name: 't',
        adapters: [titleAdapter],
        extensions: [mockExtension(PAGES)],
        config: { scan: { delayMs: 0, extensions: ['mock'] } },
        argv,
        stdout,
        stderr,
        env: {},
        clock: () => (tick += 250),
        now: () => new Date('2026-01-01T00:00:00.000Z'),
        ...extra,
    });

    return { code, stdout, stderr };
}

// eslint-disable-next-line no-control-regex -- matching ANSI escape sequences is the point
export const ANSI = /\u001B\[[0-9;]*m/;
