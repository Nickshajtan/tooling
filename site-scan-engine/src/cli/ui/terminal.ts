/**
 * Terminal: the one abstraction over stdout/stderr. Injectable, so tests can drive TTY vs non-TTY, color on/off and
 * width without a real terminal. Nothing else in the CLI decides how to write.
 */

import type { TextSink } from '../../contract/text-sink.js';

export interface TerminalStream extends TextSink {
    readonly isTTY?: boolean;
    readonly columns?: number;
}

export interface TerminalOptions {
    readonly stdout: TerminalStream;
    readonly stderr: TerminalStream;
    /** `NO_COLOR` / `FORCE_COLOR` style switch resolved by the caller. */
    readonly color: boolean;
}

export class Terminal {
    readonly color: boolean;

    constructor(private readonly options: TerminalOptions) {
        this.color = options.color;
    }

    /** True when the progress line can be redrawn in place. */
    get interactive(): boolean {
        return this.options.stderr.isTTY === true;
    }

    get width(): number {
        return this.options.stderr.columns ?? 100;
    }

    out(text: string): void {
        this.options.stdout.write(text);
    }

    err(text: string): void {
        this.options.stderr.write(text);
    }

    /** Redraws the current stderr line (TTY only). */
    redraw(text: string): void {
        this.options.stderr.write(`\r\u001B[2K${text}`);
    }

    /** Ends a redrawn line so the next write starts clean. */
    endLine(): void {
        this.options.stderr.write('\r\u001B[2K');
    }
}

/** Color is on for a TTY unless NO_COLOR is set or --no-color was given; FORCE_COLOR turns it on regardless. */
export function resolveColor(env: Readonly<Record<string, string | undefined>>, isTTY: boolean, noColorFlag: boolean): boolean {
    if (noColorFlag || (env.NO_COLOR !== undefined && env.NO_COLOR !== '')) {
        return false;
    }
    if (env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== '' && env.FORCE_COLOR !== '0') {
        return true;
    }

    return isTTY;
}
