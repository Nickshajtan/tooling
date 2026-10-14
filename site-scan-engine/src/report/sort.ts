/**
 * Deterministic ordering for render-mode reporters: numeric siteId first, then siteId text, then path.
 */

import type { ScanRecord } from '../contract/record.js';

export function sortRecords(records: readonly ScanRecord[]): ScanRecord[] {
    return [...records].sort((a, b) => {
        const bySiteId = Number(a.siteId) - Number(b.siteId);
        if (Number.isFinite(bySiteId) && bySiteId !== 0) {
            return bySiteId;
        }

        return a.siteId.localeCompare(b.siteId) || a.path.localeCompare(b.path);
    });
}
