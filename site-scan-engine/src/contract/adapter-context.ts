import type { CheerioAPI } from 'cheerio';
import type { FetchResponse, SideRequest } from './fetch.js';
import type { ScanTarget, TargetState } from './target.js';

/** What an adapter sees: a frozen, read-only view of the page being scanned. */
export interface AdapterContext<O = unknown> {
    readonly target: ScanTarget;
    /** Never null here; on a fetch failure `status` is 0, `error` is set and `body` is ''. */
    readonly response: FetchResponse;
    /** `response.body` when it is HTML/XML, else ''. */
    readonly html: string;
    /** Parsed lazily, once per page. '' html gives an empty document. */
    readonly dom: CheerioAPI;
    /** What extensions put into `TargetState` during `analyze`. */
    readonly state: Readonly<TargetState>;
    /** `config.adapters[adapter.id]` */
    readonly options: O;
    /** Side request through the fetch middleware chain (headers/auth/host-map apply). */
    fetch(request: SideRequest): Promise<FetchResponse>;
}
