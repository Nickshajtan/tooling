import { OptionType } from '../../contract/options.js';
import { booleanOption } from './boolean.js';
import { integerOption, numberOption } from './numbers.js';
import type { OptionRule } from './option-rule.js';
import { recordOption } from './record.js';
import { stringArrayOption } from './string-array.js';
import { stringOption } from './string.js';

/** `satisfies Record<OptionType, …>`: a new OptionType without a rule is a compile error. */
export const OPTION_RULES = {
    [OptionType.STRING]: stringOption,
    [OptionType.INTEGER]: integerOption,
    [OptionType.NUMBER]: numberOption,
    [OptionType.BOOLEAN]: booleanOption,
    [OptionType.STRING_ARRAY]: stringArrayOption,
    [OptionType.RECORD]: recordOption,
} as const satisfies Record<OptionType, OptionRule>;
