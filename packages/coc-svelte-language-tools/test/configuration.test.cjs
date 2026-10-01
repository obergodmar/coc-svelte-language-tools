const assert = require('node:assert/strict');
const { test } = require('node:test');
const upstream = require('../../svelte-vscode/package.json');
const manifest = require('../package.json');

test('language-server settings stay aligned with upstream', () => {
    const onlyPluginSettings = (properties) =>
        Object.fromEntries(
            Object.entries(properties).filter(([key]) => key.startsWith('svelte.plugin.'))
        );
    assert.deepEqual(
        onlyPluginSettings(manifest.contributes.configuration.properties),
        onlyPluginSettings(upstream.contributes.configuration.properties)
    );
});
