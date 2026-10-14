import type { CliError, Problem } from '../errors.js';
import type { Theme } from './theme.js';
import type { ErrorContext } from './views.js';

function renderProblem(problem: Problem, theme: Theme): string[] {
    const lines: string[] = [];
    if (problem.where) {
        lines.push(`  ${theme.code(problem.where)}`);
    }
    const body = [problem.what];
    if (problem.didYouMean) {
        body.push(`Did you mean ${theme.emph(problem.didYouMean)}?`);
    }
    lines.push(`    ${body.join(' ')}`);
    if (problem.hint) {
        lines.push(`    ${theme.dim(problem.hint)}`);
    }

    return lines;
}

/** Message for a CliError: what, where and how to fix, every problem together. */
export function renderCliError(err: CliError, theme: Theme, context: ErrorContext): string {
    const count = err.problems.length;
    const title = count > 1 ? `Invalid input (${count} problems)` : 'Invalid input';
    const lines = [`${theme.error('✖')} ${theme.emph(title)}`, ''];
    err.problems.forEach((problem, index) => {
        lines.push(...renderProblem(problem, theme), ...(index < count - 1 ? [''] : []));
    });
    const helpTarget = context.command ? `${context.tool} ${context.command} --help` : `${context.tool} --help`;
    lines.push('', `Run \`${helpTarget}\` for all options.`);

    return `${lines.join('\n')}\n`;
}

/** Anything that is not a CliError is a bug: show the stack and say so. */
export function renderInternalError(err: unknown, theme: Theme, context: ErrorContext): string {
    const message = err instanceof Error ? err.message : String(err);
    const lines = [`${theme.error('✖')} ${theme.emph('Unexpected error')}: ${message}`];
    if (err instanceof Error && err.stack) {
        lines.push(theme.dim(err.stack));
    }
    lines.push('', `This is a bug in ${context.tool} or the engine, please report it with the output above.`);

    return `${lines.join('\n')}\n`;
}
