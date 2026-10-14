/**
 * Freezes plain objects and arrays in place, recursively. Typed-array views are skipped (they cannot be frozen
 * while they hold elements) and already-frozen values end the walk, which also makes cycles safe.
 */
export function deepFreeze<T>(value: T): T {
    if (value === null || typeof value !== 'object' || Object.isFrozen(value) || ArrayBuffer.isView(value)) {
        return value;
    }
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);

    return value;
}
