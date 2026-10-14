import { isRecord } from '../../shared/is-record.js';
import type { ValueRule, ValueSpec } from './value-rule.js';

export const nullableStringRule: ValueRule = {
    check(value: unknown, spec: ValueSpec): readonly string[] {
        return value === null || typeof value === 'string' ? [] : [`${spec.label} must be ${spec.expects ?? 'a string or null'}`];
    },
};

export const nonEmptyStringRule: ValueRule = {
    check(value: unknown, spec: ValueSpec): readonly string[] {
        return typeof value === 'string' && value.trim() !== '' ? [] : [`${spec.label} must be ${spec.expects ?? 'a non-empty string'}`];
    },
};

export const stringArrayRule: ValueRule = {
    check(value: unknown, spec: ValueSpec): readonly string[] {
        const valid = Array.isArray(value) && value.every((item) => typeof item === 'string');

        return valid ? [] : [`${spec.label} must be ${spec.expects ?? 'an array of strings'}`];
    },
};

export const arrayRule: ValueRule = {
    check(value: unknown, spec: ValueSpec): readonly string[] {
        return Array.isArray(value) ? [] : [`${spec.label} must be ${spec.expects ?? 'an array'}`];
    },
};

export const absolutePathsRule: ValueRule = {
    check(value: unknown, spec: ValueSpec): readonly string[] {
        const valid = Array.isArray(value) && value.length > 0 && value.every((p) => typeof p === 'string' && p.startsWith('/'));

        return valid ? [] : [`${spec.label} must be ${spec.expects ?? 'a non-empty array of strings starting with "/"'}`];
    },
};

export const stringRecordRule: ValueRule = {
    check(value: unknown, spec: ValueSpec): readonly string[] {
        const valid = isRecord(value) && Object.values(value).every((item) => typeof item === 'string');

        return valid ? [] : [`${spec.label} must be ${spec.expects ?? 'an object of strings'}`];
    },
};
