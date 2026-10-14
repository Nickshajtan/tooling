/**
 * The three context objects (see PLAN §5.3): TargetContext (one page, through `target` and `analyze`),
 * FetchContext (one HTTP request, through `fetch`) and the frozen AdapterContext view adapters receive.
 */

import { load, type CheerioAPI } from 'cheerio';
import type { AdapterContext } from '../contract/adapter-context.js';
import type { FetchPurpose, FetchRequest, FetchResponse, SideRequest } from '../contract/fetch.js';
import type { ScanTarget, TargetState } from '../contract/target.js';
import { isHtmlContentType } from './transport.js';

export type SideFetch = (request: SideRequest) => Promise<FetchResponse>;

/** `response.body` when it is HTML/XML, else ''. */
export function htmlOf(response: FetchResponse): string {
    return isHtmlContentType(response.contentType) ? response.body : '';
}

export class TargetContext {
    /** Mutable bag for extensions → adapters. */
    readonly state: TargetState = {};
    private current: FetchResponse | null = null;
    private tree: CheerioAPI | null = null;

    constructor(
        readonly target: ScanTarget,
        readonly signal: AbortSignal,
        private readonly sideFetch: SideFetch,
    ) {}

    /** `null` until the page fetch completes. */
    get response(): FetchResponse | null {
        return this.current;
    }

    /** Parsed lazily, once per page. An empty/non-HTML body gives an empty document. */
    get dom(): CheerioAPI {
        this.tree ??= load(this.current ? htmlOf(this.current) : '');

        return this.tree;
    }

    /** Side request through the fetch middleware chain. */
    fetch(request: SideRequest): Promise<FetchResponse> {
        return this.sideFetch(request);
    }

    /** Engine-internal: called once, when the page fetch completes. Extensions must not call it. */
    setResponse(response: FetchResponse): void {
        this.current = response;
        this.tree = null;
    }
}

export class FetchContext {
    /** Set by the transport, or by middleware to short-circuit. */
    response: FetchResponse | null = null;

    constructor(
        readonly target: ScanTarget,
        readonly purpose: FetchPurpose,
        readonly signal: AbortSignal,
        /** Mutable: middleware may replace it (headers, url). */
        public request: FetchRequest,
    ) {}
}

/** The frozen, read-only view of a TargetContext that one adapter receives. */
export function adapterView<O>(
    context: TargetContext,
    response: FetchResponse,
    state: Readonly<TargetState>,
    options: O,
): AdapterContext<O> {
    return Object.freeze({
        target: context.target,
        response,
        html: htmlOf(response),
        get dom(): CheerioAPI {
            return context.dom;
        },
        state,
        options,
        fetch: (request: SideRequest): Promise<FetchResponse> => context.fetch(request),
    });
}
