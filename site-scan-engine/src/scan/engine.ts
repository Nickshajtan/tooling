/**
 * The engine: runs each ScanTarget (site × path) through three middleware stages — `target` around the whole
 * page, `fetch` around each HTTP request (through the transport), `analyze` around the adapters — and yields one
 * ScanRecord per target. Knows nothing about files, flags or reports; see storage/, cli/ and report/.
 */

import type { ScanConfig } from '../config/types.js';
import { assertAdapter, finding, type Adapter, type AdapterResult, type Finding } from '../contract/adapter.js';
import { ENGINE_ADAPTER_ID } from '../contract/engine-code.js';
import type { EngineEvents, EventListener } from '../contract/events.js';
import type { Extension } from '../contract/extension.js';
import { FetchError, FetchPurpose, type FetchRequest, type FetchResponse, type SideRequest } from '../contract/fetch.js';
import { targetKey, type ScanRecord } from '../contract/record.js';
import type { Site } from '../contract/site.js';
import type { ScanTarget } from '../contract/target.js';
import type { TextSink } from '../contract/text-sink.js';
import { requireOptions } from '../plugins/plugin-options.js';
import { createExtensionSet } from '../plugins/registry.js';
import { errorMessage } from '../shared/error-message.js';
import { adapterView, FetchContext, TargetContext } from './contexts.js';
import { EventBus } from './events.js';
import { setupExtensions, type ExtensionHost } from './extension-host.js';
import { describeError, failedResponse } from './failed-response.js';
import { FAILURE_MAPPERS, FailureSite } from './failure-mapper.js';
import { compose, PipelineError } from './pipeline.js';
import { runPool, type PoolOptions } from './pool.js';
import { RequestFactory } from './request-factory.js';
import { transport, type FetchImpl } from './transport.js';

export interface EngineSetup {
    readonly config: ScanConfig;
    readonly adapters: readonly Adapter[];
    /** Tool-provided extensions; built-ins are added by the engine. Only those listed in `scan.extensions` run. */
    readonly extensions?: readonly Extension[];
    /** Replaces `globalThis.fetch` under the transport (tests only; behavior is customized with fetch middleware). */
    readonly fetchImpl?: FetchImpl;
    readonly now?: () => Date;
    /** Receives failures of `warning` listeners, which cannot warn about themselves. */
    readonly stderr?: TextSink;
}

export interface ScanRunOptions {
    readonly sites: readonly Site[];
    /** Target keys already done (resume). */
    readonly skip?: ReadonlySet<string>;
    readonly signal?: AbortSignal;
}

interface MutableResult {
    row: AdapterResult['row'];
    findings: Finding[];
}

type MutableResults = Record<string, MutableResult>;

function addEngineFinding(results: MutableResults, engineFinding: Finding): void {
    const existing = results[ENGINE_ADAPTER_ID];
    if (existing) {
        existing.findings.push(engineFinding);

        return;
    }
    results[ENGINE_ADAPTER_ID] = { row: {}, findings: [engineFinding] };
}

function assertAdapters(adapters: readonly Adapter[]): void {
    if (!Array.isArray(adapters) || adapters.length === 0) {
        throw new TypeError('Engine: at least one adapter is required');
    }
    adapters.forEach((adapter) => assertAdapter(adapter));
    const ids = adapters.map((adapter) => adapter.id);
    if (new Set(ids).size !== ids.length) {
        throw new TypeError(`Engine: duplicate adapter ids: ${ids.join(', ')}`);
    }
    if (ids.includes(ENGINE_ADAPTER_ID)) {
        throw new TypeError(`Engine: adapter id "${ENGINE_ADAPTER_ID}" is reserved`);
    }
}

function activeExtensions(config: ScanConfig, tool: readonly Extension[]): Extension[] {
    const available = createExtensionSet(tool);

    return config.scan.extensions.map((id) => {
        const extension = available.get(id);
        if (!extension) {
            throw new TypeError(`Engine: no such extension "${id}" (known: ${available.ids().join(', ')})`);
        }

        return extension;
    });
}

export class Engine {
    private readonly requests: RequestFactory;
    private readonly fetchChain: (context: FetchContext) => Promise<void>;

    private constructor(
        private readonly config: ScanConfig,
        private readonly adapters: readonly Adapter[],
        private readonly bus: EventBus,
        private readonly host: ExtensionHost,
        private readonly fetchImpl: FetchImpl,
        private readonly now: () => Date,
    ) {
        this.requests = new RequestFactory(config.http);
        this.fetchChain = compose('fetch', host.chains.fetch, async (context) => {
            context.response = await transport(context.request, this.fetchImpl);
        });
    }

    /** Validates the plugins and runs each active extension's `setup()` (config order = outermost first). */
    static async create(setup: EngineSetup): Promise<Engine> {
        assertAdapters(setup.adapters);
        const bus = new EventBus(setup.stderr);
        const extensions = activeExtensions(setup.config, setup.extensions ?? []);
        const host = await setupExtensions(extensions, setup.config, bus);

        return new Engine(setup.config, setup.adapters, bus, host, setup.fetchImpl ?? globalThis.fetch, setup.now ?? (() => new Date()));
    }

    /** Observe-only. Returns an unsubscribe function. */
    on<K extends keyof EngineEvents>(name: K, listener: EventListener<K>): () => void {
        return this.bus.on(name, listener);
    }

    /**
     * Scans every site × path, yielding records in completion order. Extensions are disposed when the generator
     * finishes (also on abort or early exit), so an Engine runs one scan.
     */
    async *scan({ sites, skip = new Set<string>(), signal = new AbortController().signal }: ScanRunOptions): AsyncGenerator<ScanRecord> {
        const started = performance.now();
        const targets = sites
            .flatMap((site) => this.config.scan.paths.map((path) => this.targetOf(site, path)))
            .filter((target) => !skip.has(target.key));
        const poolOptions: PoolOptions = { concurrency: this.config.scan.concurrency, delayMs: this.config.scan.delayMs, signal };

        let done = 0;
        try {
            this.bus.emit('run:start', { total: targets.length, config: this.config });
            for await (const record of runPool(targets, (target) => this.scanTarget(target, signal), poolOptions)) {
                done += 1;
                if (record) {
                    yield record;
                }
            }
        } finally {
            this.bus.emit('run:end', { done, total: targets.length, aborted: signal.aborted, durationMs: Math.round(performance.now() - started) });
            await this.host.dispose();
        }
    }

    private targetOf(site: Site, path: string): ScanTarget {
        return Object.freeze({ site, path, url: new URL(path, site.url).href, key: targetKey(site.siteId, path) });
    }

    /** One HTTP request through the fetch chain. Never throws once the request is built. */
    private async fetchThrough(target: ScanTarget, purpose: FetchPurpose, request: FetchRequest, signal: AbortSignal): Promise<FetchResponse> {
        const context = new FetchContext(target, purpose, signal, request);
        this.bus.emit('fetch:start', { target, purpose, request });

        let response: FetchResponse;
        try {
            await this.fetchChain(context);
            response = context.response ?? failedResponse(context.request.url, FetchError.MIDDLEWARE, 'no response was produced');
        } catch (err) {
            const failure = err instanceof PipelineError ? err : new PipelineError(null, 'fetch', err);
            const detail = failure.extensionId === null ? errorMessage(failure.original) : `${failure.extensionId}: ${errorMessage(failure.original)}`;
            response = failedResponse(context.request.url, failure.extensionId === null ? FetchError.OTHER : FetchError.MIDDLEWARE, detail);
        }
        this.bus.emit('fetch:end', { target, purpose, request: context.request, response });

        return response;
    }

    private async runAdapters(context: TargetContext, results: MutableResults): Promise<void> {
        const response = context.response;
        if (!response) {
            throw new Error('analyze ran before the page response existed');
        }
        for (const adapter of this.adapters) {
            const view = adapterView(context, response, Object.freeze({ ...context.state }), requireOptions('adapter', adapter, this.config.adapters[adapter.id]));
            const started = performance.now();
            let result: MutableResult;
            let failed = false;
            try {
                const scanned = await adapter.scan(view);
                result = { row: scanned?.row ?? {}, findings: [...(scanned?.findings ?? [])] };
            } catch (err) {
                failed = true;
                result = { row: {}, findings: [FAILURE_MAPPERS[FailureSite.ADAPTER].map({ error: err, adapterId: adapter.id })] };
            }
            results[adapter.id] = result;
            this.bus.emit('adapter:end', { target: context.target, adapterId: adapter.id, result, durationMs: Math.round(performance.now() - started), failed });
        }
    }

    /**
     * Scans one target. Never throws: every failure becomes an `engine.*` finding so one bad page cannot abort a
     * multi-thousand-site run. Returns `null` when a target middleware skipped the target.
     */
    private async scanTarget(target: ScanTarget, signal: AbortSignal): Promise<ScanRecord | null> {
        const started = performance.now();
        this.bus.emit('target:start', { target });

        const results: MutableResults = {};
        const sideFetch = (request: SideRequest): Promise<FetchResponse> =>
            this.fetchThrough(target, FetchPurpose.SIDE, this.requests.side(request, target.url), signal);
        const context = new TargetContext(target, signal, sideFetch);

        const analyze = compose('analyze', this.host.chains.analyze, (c) => this.runAdapters(c, results));
        const run = compose('target', this.host.chains.target, async (c) => {
            const response = await this.fetchThrough(target, FetchPurpose.PAGE, this.requests.page(target.url), signal);
            c.setResponse(response);
            if (response.error !== '') {
                const detail = describeError(response);
                addEngineFinding(results, FAILURE_MAPPERS[FailureSite.FETCH].map({ error: response.errorDetail, detail }));
            } else if (response.status < 200 || response.status > 299) {
                addEngineFinding(results, FAILURE_MAPPERS[FailureSite.HTTP_STATUS].map({ error: null, status: response.status }));
            }
            try {
                await analyze(c);
            } catch (err) {
                addEngineFinding(results, FAILURE_MAPPERS[FailureSite.MIDDLEWARE].map({ error: err }));
            }
        });

        let threw = false;
        try {
            await run(context);
        } catch (err) {
            threw = true;
            addEngineFinding(results, FAILURE_MAPPERS[FailureSite.MIDDLEWARE].map({ error: err }));
        }

        const record = this.recordOf(context, results, threw);
        this.bus.emit('target:end', { target, record, durationMs: Math.round(performance.now() - started) });

        return record;
    }

    /** `null` when nothing produced a response and nothing failed: the target was skipped by a middleware. */
    private recordOf(context: TargetContext, results: MutableResults, threw: boolean): ScanRecord | null {
        const { target } = context;
        const response = context.response ?? (threw ? failedResponse(target.url, FetchError.MIDDLEWARE, 'target middleware failed before the page was fetched') : null);
        if (!response) {
            return null;
        }

        return {
            siteId: target.site.siteId,
            siteUrl: target.site.url,
            path: target.path,
            url: target.url,
            isPublic: target.site.isPublic,
            isActive: target.site.isActive,
            meta: target.site.meta,
            http: {
                status: response.status,
                finalUrl: response.finalUrl,
                redirects: response.redirects.length,
                timingMs: response.timingMs,
                bytes: response.bytes,
                error: describeError(response),
            },
            adapters: results,
            scannedAt: this.now().toISOString(),
        };
    }
}
