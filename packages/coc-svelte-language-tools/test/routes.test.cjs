const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { compile } = require('svelte5/compiler');
const { createRouteFile, routeKinds, routeTemplate } = require('../dist/routeFiles');

test('generated component templates compile as Svelte 5 in both languages', () => {
    for (const kind of ['page', 'layout', 'error']) {
        for (const ts of [true, false]) {
            const { filename, text } = routeTemplate(kind, ts);
            assert.doesNotThrow(() => compile(text, { filename, generate: false }));
        }
    }
});

test('route generation handles dynamic paths and never overwrites existing files', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'svelte-route-test-'));
    try {
        const directory = path.join(root, '(group)', '[slug]');
        for (const kind of routeKinds) await createRouteFile(directory, kind, true);
        const target = path.join(directory, '+page.svelte');
        await fs.writeFile(target, 'user contents');
        await assert.rejects(createRouteFile(directory, 'page', true), /already exists/);
        assert.equal(await fs.readFile(target, 'utf8'), 'user contents');
        await assert.rejects(createRouteFile('relative', 'page', true), /absolute/);
        await assert.rejects(createRouteFile(root, '../escape', true), /Unknown/);
    } finally {
        await fs.rm(root, { recursive: true, force: true });
    }
});
