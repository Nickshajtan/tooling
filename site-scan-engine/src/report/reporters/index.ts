import type { Reporter } from '../../contract/reporter.js';
import { findingsCsvReporter } from './findings-csv.js';
import { resultsCsvReporter } from './results-csv.js';
import { summaryMdReporter } from './summary-md.js';

/** Reporters shipped by the engine, in default output order. */
export const BUILTIN_REPORTERS: readonly Reporter[] = [resultsCsvReporter, findingsCsvReporter, summaryMdReporter];

export const DEFAULT_REPORTER_IDS: readonly string[] = BUILTIN_REPORTERS.map((reporter) => reporter.id);
