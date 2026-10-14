/** Anything text can be written to (a stream, or a test buffer). */
export interface TextSink {
    write(chunk: string): unknown;
}
