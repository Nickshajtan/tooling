import { HUMAN_POLICIES, HumanMode, type HumanModeDeps } from './human.js';
import { JsonMode } from './json.js';
import { OutputLevel, type OutputMode } from '../views.js';

export interface ModeFactoryDeps extends HumanModeDeps {
    readonly now: () => Date;
}

type ModeFactory = (deps: ModeFactoryDeps) => OutputMode;

/** One factory per level; `satisfies` makes a level without a mode a compile error. */
const MODES = {
    [OutputLevel.DEFAULT]: (deps) => new HumanMode(HUMAN_POLICIES[OutputLevel.DEFAULT], deps),
    [OutputLevel.QUIET]: (deps) => new HumanMode(HUMAN_POLICIES[OutputLevel.QUIET], deps),
    [OutputLevel.VERBOSE]: (deps) => new HumanMode(HUMAN_POLICIES[OutputLevel.VERBOSE], deps),
    [OutputLevel.JSON]: (deps) => new JsonMode(deps.terminal, deps.now),
} as const satisfies Record<OutputLevel, ModeFactory>;

export function createOutputMode(level: OutputLevel, deps: ModeFactoryDeps): OutputMode {
    return MODES[level](deps);
}
