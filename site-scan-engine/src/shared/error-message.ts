/** Message of anything that was thrown; `catch (err)` values are `unknown`. */
export function errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}
