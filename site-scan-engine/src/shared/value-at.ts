import { isRecord } from './is-record.js';

/** Value at a dotted path (`http.timeoutMs`), or `undefined` when any step is missing. */
export function valueAt(root: unknown, path: string): unknown {
    let node: unknown = root;
    for (const key of path.split('.')) {
        node = isRecord(node) ? node[key] : undefined;
    }

    return node;
}
