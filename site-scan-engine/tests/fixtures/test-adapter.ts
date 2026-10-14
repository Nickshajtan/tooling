import { Severity, defineAdapter, finding } from '../../src/index.js';

export const titleAdapter = defineAdapter({
    id: 'title',
    description: 'Test adapter: reports <title>',
    engine: '^0.2.0',
    columns: ['title'],
    async scan(ctx) {
        if (ctx.response.error !== '' || ctx.html === '') {
            return { row: { title: '' }, findings: [] };
        }
        const title = ctx.dom('title').text();

        return {
            row: { title },
            findings: title === '' ? [finding('title.missing', Severity.ERROR, 'No title')] : [],
        };
    },
    summarize: (records) => [{ title: 'Pages', rows: [['total', records.length]] }],
});

export const throwingAdapter = defineAdapter({
    id: 'boom',
    description: 'Always throws',
    engine: '^0.2.0',
    columns: [],
    async scan() {
        throw new Error('kaboom');
    },
});
