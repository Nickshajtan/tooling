/** Styles by meaning. The only file that imports kleur; nothing else names a color. */

import kleur from 'kleur';

export interface Theme {
    success(text: string): string;
    warn(text: string): string;
    error(text: string): string;
    dim(text: string): string;
    emph(text: string): string;
    code(text: string): string;
}

const identity = (text: string): string => text;

const PLAIN: Theme = { success: identity, warn: identity, error: identity, dim: identity, emph: identity, code: identity };

export function createTheme(color: boolean): Theme {
    if (!color) {
        return PLAIN;
    }
    // Colors are never the only signal: every styled line also carries a symbol or a word.
    // kleur is one shared instance; it is only ever used from this branch, so enabling it here is local in effect.
    kleur.enabled = true;

    return {
        success: (text) => kleur.green(text),
        warn: (text) => kleur.yellow(text),
        error: (text) => kleur.red(text),
        dim: (text) => kleur.dim(text),
        emph: (text) => kleur.bold(text),
        code: (text) => kleur.cyan(text),
    };
}
