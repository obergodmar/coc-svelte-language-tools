const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { commands, extensions, workspace, Uri } = require('coc.nvim');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function eventually(check, message) {
    let last;
    for (let i = 0; i < 80; i++) {
        try {
            return await check();
        } catch (error) {
            last = error;
        }
        await sleep(100);
    }
    throw new Error(message, { cause: last });
}

exports.activate = (context) => {
    context.subscriptions.push(
        commands.registerCommand('svelte.test', async () => {
            const passed = [];
            const run = async (name, fn) => {
                fs.writeFileSync(
                    process.env.COC_SVELTE_RESULT,
                    JSON.stringify({ passed, running: name })
                );
                await fn();
                passed.push(name);
            };
            try {
                const extension = extensions.getExtensionById('coc-svelte-language-tools');
                assert.ok(extension, 'extension loaded');
                const api = await extension.activate();
                const client = api.getLanguageServer();
                const root = process.env.COC_SVELTE_FIXTURE;
                const file = (name) => Uri.file(path.join(root, name)).toString();
                // Start from TS, reproducing the activation-order case in actual coc-tsserver.
                await workspace.openResource(file('index.ts'));
                await extensions.getExtensionById('coc-tsserver').activate();
                await workspace.openResource(file('App.svelte'));
                await client.start();
                const textDocument = { uri: file('App.svelte') };
                const request = (method, extra = {}) =>
                    client.sendRequest(method, { textDocument, ...extra });

                await run('Svelte 5 hover and runes', async () => {
                    const hover = await request('textDocument/hover', {
                        position: { line: 2, character: 8 }
                    });
                    assert.match(JSON.stringify(hover), /number/);
                });
                await run('completion', async () => {
                    const result = await request('textDocument/completion', {
                        position: { line: 5, character: 4 }
                    });
                    const items = Array.isArray(result) ? result : result.items;
                    assert.ok(items.some((item) => item.label === 'count'));
                });
                await run('diagnostics', async () => {
                    const result = await request('textDocument/diagnostic');
                    assert.ok(
                        result.items.some((item) => item.code === 2322),
                        JSON.stringify(result)
                    );
                });
                await run('definition into TypeScript', async () => {
                    const result = await request('textDocument/definition', {
                        position: { line: 1, character: 12 }
                    });
                    assert.ok(
                        result.some((item) => (item.targetUri || item.uri) === file('value.ts'))
                    );
                });
                await run('semantic tokens and formatting', async () => {
                    const tokens = await request('textDocument/semanticTokens/full');
                    assert.ok(tokens.data.length > 0);
                    const edits = await request('textDocument/formatting', {
                        options: { tabSize: 2, insertSpaces: true }
                    });
                    assert.ok(edits.length > 0);
                });
                await run('unsaved TS edits reach Svelte diagnostics', async () => {
                    await workspace.openResource(file('value.ts'));
                    const doc = workspace.getDocument(file('value.ts'));
                    await doc.buffer.setLines(['export const value = "fixed";'], {
                        start: 0,
                        end: -1,
                        strictIndexing: false
                    });
                    await doc.synchronize();
                    await eventually(async () => {
                        const result = await request('textDocument/diagnostic');
                        assert.ok(
                            !result.items.some((item) => item.code === 2322),
                            JSON.stringify(result)
                        );
                    }, 'unsaved TS buffer was not synchronized');
                    assert.match(fs.readFileSync(path.join(root, 'value.ts'), 'utf8'), /42/);
                });
                await run('restart retains service and unsaved TS contents', async () => {
                    await commands.executeCommand('svelte.restartLanguageServer');
                    const result = await request('textDocument/hover', {
                        position: { line: 2, character: 8 }
                    });
                    assert.match(JSON.stringify(result), /number/);
                    await eventually(async () => {
                        const diagnostics = await request('textDocument/diagnostic');
                        assert.ok(
                            !diagnostics.items.some((item) => item.code === 2322),
                            JSON.stringify(diagnostics)
                        );
                    }, 'restart lost TS overlay');
                });
                await run('coc-tsserver resolves a Svelte component', async () => {
                    await workspace.openResource(file('index.ts'));
                    const status = await commands.executeCommand(
                        'typescript.tsserverRequest',
                        'status',
                        {}
                    );
                    assert.equal(
                        status?.body?.version,
                        '6.0.3',
                        'test must use the configured TypeScript version'
                    );
                    await eventually(async () => {
                        const response = await commands.executeCommand(
                            'typescript.tsserverRequest',
                            'definition',
                            {
                                file: path.join(root, 'index.ts'),
                                line: 2,
                                offset: 2
                            }
                        );
                        assert.ok(
                            response?.body?.some((entry) => entry.file.endsWith('/Child.svelte')),
                            JSON.stringify(response)
                        );
                    }, 'tsserver did not load the Svelte plugin');
                });
                await run('file move updates Svelte imports', async () => {
                    await workspace.openResource(file('App.svelte'));
                    await workspace.renameFile(
                        path.join(root, 'value.ts'),
                        path.join(root, 'renamed.ts')
                    );
                    await eventually(async () => {
                        const doc = workspace.getDocument(file('App.svelte'));
                        assert.match(doc.textDocument.getText(), /from ['"]\.\/renamed['"]/);
                    }, 'imports were not updated after file move');
                });
                await run('compiled preview', async () => {
                    await workspace.openResource(file('Child.svelte'));
                    await commands.executeCommand('svelte.showCompiledCode');
                    const { document } = await workspace.getCurrentState();
                    assert.equal(Uri.parse(document.uri).scheme, 'svelte-compiled');
                    assert.match(document.getText(), /svelte/);
                });
                fs.writeFileSync(
                    process.env.COC_SVELTE_RESULT,
                    JSON.stringify({ passed }, null, 2)
                );
            } catch (error) {
                fs.writeFileSync(
                    process.env.COC_SVELTE_RESULT,
                    JSON.stringify(
                        {
                            passed,
                            error: error.stack,
                            cause: error.cause?.stack
                        },
                        null,
                        2
                    )
                );
                throw error;
            } finally {
                // Neovim deletes its temporary directory on exit, so retain TS
                // plugin loading diagnostics before the editor shuts down.
                const logs = path.join(require('node:os').tmpdir(), 'coc-tsserver-log');
                if (fs.existsSync(logs)) {
                    fs.cpSync(
                        logs,
                        path.join(path.dirname(process.env.COC_SVELTE_RESULT), 'tsserver-logs'),
                        { recursive: true }
                    );
                }
            }
        })
    );
};
