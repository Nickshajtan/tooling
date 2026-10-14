/** Where Ctrl+C comes from. Injectable so tests can send interrupts without a real process signal. */
export interface SignalSource {
    /** Calls `handler` on every interrupt until the returned function is called. */
    subscribe(handler: () => void): () => void;
}

/** SIGINT of the real process. */
export const processSignals: SignalSource = {
    subscribe(handler) {
        process.on('SIGINT', handler);

        return () => {
            process.removeListener('SIGINT', handler);
        };
    },
};
