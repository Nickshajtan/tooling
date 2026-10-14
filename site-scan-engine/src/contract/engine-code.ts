/** Reserved adapter id under which the engine stores its own findings. */
export const ENGINE_ADAPTER_ID = 'engine';

export const EngineCode = {
    FETCH_FAILED: 'engine.fetch_failed',
    /** The page loaded but the status is outside 200–299. Detail: the status, e.g. `403`. Adapters still ran. */
    HTTP_STATUS: 'engine.http_status',
    ADAPTER_FAILED: 'engine.adapter_failed',
    /** A target or analyze middleware threw. Detail: `<extension-id>@<stage>: <message>`. */
    MIDDLEWARE_FAILED: 'engine.middleware_failed',
} as const;

export type EngineCode = (typeof EngineCode)[keyof typeof EngineCode];
