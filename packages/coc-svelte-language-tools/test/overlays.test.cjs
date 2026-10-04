const assert = require('node:assert/strict');
const { test } = require('node:test');
const { ConfigManager } = require('../../typescript-plugin/dist/src/config-manager');

test('component edits refresh only changed snapshots, without rebuilding project watchers', () => {
    const manager = new ConfigManager();
    let configurationEvents = 0;
    const changes = [];
    manager.onConfigurationChanged(() => configurationEvents++);
    manager.onSvelteDocumentsChanged((files) => changes.push(files));
    const config = {
        enable: true,
        svelteDocuments: [{ fileName: '/app/A.svelte', text: 'first' }]
    };
    manager.updateConfigFromPluginConfig(config);
    manager.updateConfigFromPluginConfig(config);
    manager.updateConfigFromPluginConfig({
        ...config,
        svelteDocuments: [{ fileName: '/app/A.svelte', text: 'second' }]
    });
    manager.updateConfigFromPluginConfig({ enable: true, svelteDocuments: [] });
    assert.equal(configurationEvents, 0);
    assert.deepEqual(changes, [['/app/A.svelte'], ['/app/A.svelte'], ['/app/A.svelte']]);
    manager.updateConfigFromPluginConfig({ enable: false, svelteDocuments: [] });
    assert.equal(configurationEvents, 1);
});
