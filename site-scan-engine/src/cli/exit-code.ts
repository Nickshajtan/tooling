/** `Interrupted` is 128 + SIGINT, the shell convention for Ctrl+C. */
export const ExitCode = { OK: 0, ERROR: 1, THRESHOLD: 2, Interrupted: 130 } as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];
