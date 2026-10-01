const assert = require('node:assert/strict');
const { test } = require('node:test');
const { filterRenameEdit } = require('../dist/rename');
const { isScript } = require('../dist/files');

const range = { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } };
const change = (uri, ...texts) => ({
    textDocument: { uri, version: null },
    edits: texts.map((newText) => ({ range, newText }))
});

test('Svelte owns component edits; tsserver owns ordinary TS import edits', () => {
    const svelte = change('file:///Page.svelte', './renamed');
    const mixed = change('file:///index.ts', './Renamed.svelte', './renamed');
    const ordinary = change('file:///util.ts', './renamed');
    const edit = {
        documentChanges: [svelte, mixed, ordinary, { kind: 'delete', uri: 'file:///x' }]
    };
    assert.deepEqual(filterRenameEdit(edit, true).documentChanges, [svelte, mixed]);
    assert.deepEqual(filterRenameEdit(edit, false).documentChanges, [
        svelte,
        { ...mixed, edits: [mixed.edits[0]] }
    ]);
    assert.equal(edit.documentChanges.length, 4);
});

test('empty edits and TS module variants are handled', () => {
    assert.deepEqual(filterRenameEdit(null, false), { documentChanges: [] });
    for (const name of [
        'state.svelte.ts',
        'state.svelte.js',
        'index.mts',
        'index.cts',
        'page.tsx',
        'page.jsx'
    ]) {
        assert.ok(isScript(`file:///${name}`), name);
    }
    assert.equal(isScript('file:///Component.svelte'), false);
});
