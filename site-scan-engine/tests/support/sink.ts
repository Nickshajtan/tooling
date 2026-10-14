export interface Sink {
    buf: string;
    write(chunk: string): void;
}

export function sink(): Sink {
    return {
        buf: '',
        write(chunk: string): void {
            this.buf += chunk;
        },
    };
}
