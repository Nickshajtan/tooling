import type { Extension } from '../../contract/extension.js';
import { hostMapExtension } from './host-map.js';
import { retryExtension } from './retry.js';

/** Extensions shipped by the engine. Being available is not being active: `scan.extensions` activates them. */
export const BUILTIN_EXTENSIONS: readonly Extension[] = [retryExtension, hostMapExtension];
