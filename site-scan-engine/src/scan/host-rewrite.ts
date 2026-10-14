/**
 * Host rewriting shared by the `host-map` extension (rewrites the request) and the transport (rewrites the
 * `Location` of every redirect it follows with the same map).
 */

/** `url` with its host replaced when `map` has an entry for it (match on `host`, so a port is part of the key). */
export function rewriteHost(url: string, map: Readonly<Record<string, string>>): string {
    const parsed = new URL(url);
    const replacement = map[parsed.host];
    if (replacement === undefined) {
        return url;
    }
    parsed.host = replacement;

    return parsed.href;
}
