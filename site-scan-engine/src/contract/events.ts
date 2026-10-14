/**
 * Events are observe-only: listeners get frozen payloads and cannot change the run. Anything that needs to change
 * behavior or data is middleware.
 */

import type { ScanConfig } from '../config/types.js';
import type { AdapterResult } from './adapter.js';
import type { FetchPurpose, FetchRequest, FetchResponse } from './fetch.js';
import type { ScanRecord } from './record.js';
import type { ScanTarget } from './target.js';
import type { WarningEvent } from './warning.js';

export interface RunStartEvent {
    /** Targets that will be scanned (already minus resumed ones). */
    readonly total: number;
    readonly config: ScanConfig;
}

export interface RunEndEvent {
    /** Targets finished, including ones a target middleware skipped. */
    readonly done: number;
    readonly total: number;
    readonly aborted: boolean;
    readonly durationMs: number;
}

export interface TargetStartEvent {
    readonly target: ScanTarget;
}

export interface TargetEndEvent {
    readonly target: ScanTarget;
    /** `null` when a target middleware skipped the target. */
    readonly record: ScanRecord | null;
    readonly durationMs: number;
}

export interface FetchStartEvent {
    readonly target: ScanTarget;
    readonly purpose: FetchPurpose;
    readonly request: FetchRequest;
}

export interface FetchEndEvent {
    readonly target: ScanTarget;
    readonly purpose: FetchPurpose;
    readonly request: FetchRequest;
    readonly response: FetchResponse;
}

export interface AdapterEndEvent {
    readonly target: ScanTarget;
    readonly adapterId: string;
    readonly result: AdapterResult;
    readonly durationMs: number;
    readonly failed: boolean;
}

/** Pattern of custom event names: an extension emits `ext:<its-id>:<name>`. */
export type ExtensionEventName = `ext:${string}:${string}`;

/** Open interface: tools add `ext:<id>:<name>` keys by declaration merging. */
export interface EngineEvents {
    'run:start': RunStartEvent;
    'run:end': RunEndEvent;
    'target:start': TargetStartEvent;
    'target:end': TargetEndEvent;
    'fetch:start': FetchStartEvent;
    'fetch:end': FetchEndEvent;
    'adapter:end': AdapterEndEvent;
    warning: WarningEvent;
    [name: ExtensionEventName]: object;
}

export type EventListener<K extends keyof EngineEvents> = (payload: Readonly<EngineEvents[K]>) => void;
