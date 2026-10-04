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
                if (process.env.COC_SVELTE_TEST && name !== process.env.COC_SVELTE_TEST) return;
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
                await run('rename, references, linked tags and organize imports', async () => {
                    const uri = file('Features.svelte');
                    await workspace.openResource(uri);
                    const feature = (method, extra) =>
                        client.sendRequest(method, { textDocument: { uri }, ...extra });
                    const position = { line: 2, character: 8 };
                    const renamed = await feature('textDocument/rename', {
                        position,
                        newName: 'greeting'
                    });
                    const edits =
                        renamed.documentChanges?.flatMap((change) => change.edits || []) ||
                        Object.values(renamed.changes || {}).flat();
                    assert.equal(edits.filter((edit) => edit.newText === 'greeting').length, 2);
                    const references = await feature('textDocument/references', {
                        position,
                        context: { includeDeclaration: true }
                    });
                    assert.equal(references.length, 2);
                    const linked = await feature('textDocument/linkedEditingRange', {
                        position: { line: 4, character: 2 }
                    });
                    assert.equal(linked.ranges.length, 2);
                    const actions = await feature('textDocument/codeAction', {
                        range: { start: position, end: position },
                        context: { diagnostics: [], only: ['source.organizeImports'] }
                    });
                    assert.ok(actions.length > 0, 'organize imports action missing');
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
                await run(
                    'unsaved Svelte props reach coc-tsserver and discard on close',
                    async () => {
                        const diagnostics = async () => {
                            const response = await commands.executeCommand(
                                'typescript.tsserverRequest',
                                'semanticDiagnosticsSync',
                                { file: path.join(root, 'index.ts') }
                            );
                            assert.ok(Array.isArray(response?.body), JSON.stringify(response));
                            return response.body;
                        };
                        assert.ok((await diagnostics()).some((item) => item.code === 2322));
                        await workspace.openResource(file('Child.svelte'));
                        const doc = workspace.getDocument(file('Child.svelte'));
                        await doc.buffer.setLines(
                            [
                                '<script lang="ts">let { name }: { name: number } = $props();</script>',
                                '<p>{name}</p>'
                            ],
                            { start: 0, end: -1, strictIndexing: false }
                        );
                        await doc.synchronize();
                        await eventually(
                            async () => assert.equal((await diagnostics()).length, 0),
                            'unsaved component props were not synchronized'
                        );
                        assert.match(
                            fs.readFileSync(path.join(root, 'Child.svelte'), 'utf8'),
                            /name: string/
                        );
                        await commands.executeCommand('tsserver.restart');
                        await eventually(
                            async () => assert.equal((await diagnostics()).length, 0),
                            'tsserver restart lost the Svelte overlay'
                        );
                        await workspace
                            .getConfiguration('svelte')
                            .update('enable-ts-plugin', false, true);
                        await sleep(150);
                        await workspace
                            .getConfiguration('svelte')
                            .update('enable-ts-plugin', true, true);
                        await eventually(
                            async () => assert.equal((await diagnostics()).length, 0),
                            're-enabling the plugin lost the Svelte overlay'
                        );
                        await workspace.nvim.command('bdelete!');
                        await eventually(
                            async () =>
                                assert.ok((await diagnostics()).some((item) => item.code === 2322)),
                            'closed component overlay was not discarded'
                        );
                    }
                );
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
                await run('automatic tag closing while typing', async () => {
                    await workspace.openResource(file('Tags.svelte'));
                    await workspace.nvim.input('A');
                    await sleep(100);
                    await workspace.nvim.input('>');
                    await eventually(async () => {
                        assert.equal(
                            workspace
                                .getDocument(file('Tags.svelte'))
                                .textDocument.getText()
                                .trim(),
                            '<section></section>'
                        );
                    }, 'typed tag was not closed');
                    await workspace.nvim.input('\u001b');
                });
                await run('tag closing respects configuration and void elements', async () => {
                    const doc = workspace.getDocument(file('Tags.svelte'));
                    const config = workspace.getConfiguration('svelte');
                    const typeEnd = async (text) => {
                        await doc.buffer.setLines([text], {
                            start: 0,
                            end: -1,
                            strictIndexing: false
                        });
                        await doc.synchronize();
                        await workspace.nvim.input('A');
                        await sleep(100);
                        await workspace.nvim.input('>');
                        await eventually(
                            async () => assert.ok(doc.textDocument.getText().includes('>')),
                            'input missing'
                        );
                        await sleep(200);
                        await workspace.nvim.input('\u001b');
                        return doc.textDocument.getText().trim();
                    };
                    assert.equal(await typeEnd('<br'), '<br>');
                    await config.update('autoClosingTags', false, true);
                    assert.equal(await typeEnd('<article'), '<article>');
                    await config.update('autoClosingTags', true, true);
                });
                await run('route command creates files without overwriting', async () => {
                    const directory = path.join(root, 'src/routes/(app)/[slug]');
                    const target = await commands.executeCommand(
                        'svelte.createRouteFile',
                        directory,
                        'page',
                        'ts'
                    );
                    assert.match(fs.readFileSync(target, 'utf8'), /PageProps/);
                    assert.equal(
                        (await workspace.getCurrentState()).document.uri,
                        Uri.file(target).toString()
                    );
                    await assert.rejects(
                        commands.executeCommand('svelte.createRouteFile', directory, 'page', 'ts'),
                        /already exists/
                    );
                });
                await run('native Svelte snippets', async () => {
                    await workspace.openResource(file('Snippet.svelte'));
                    await commands.executeCommand('svelte.insertSnippet', 's-if');
                    assert.match(
                        workspace.getDocument(file('Snippet.svelte')).textDocument.getText(),
                        /\{#if condition\}/
                    );
                    assert.match(
                        workspace.getDocument(file('Snippet.svelte')).textDocument.getText(),
                        /\{\/if\}/
                    );
                    await workspace.nvim.input('\u001b');
                });
                await run('compiled preview', async () => {
                    await workspace.openResource(file('Child.svelte'));
                    const sourceBuffer = await workspace.nvim.call('bufnr', ['%']);
                    for (const [command, filetype] of [
                        ['svelte.showCompiledCode', 'javascript'],
                        ['svelte.showCompiledCSS', 'css']
                    ]) {
                        await workspace.nvim.command(`CocCommand ${command}`);
                        await eventually(async () => {
                            assert.equal(await workspace.nvim.eval('&l:buftype'), 'nofile');
                            assert.equal(await workspace.nvim.eval('&l:filetype'), filetype);
                            assert.equal(await workspace.nvim.eval('&l:modifiable'), 0);
                            assert.equal(await workspace.nvim.eval('&l:readonly'), 1);
                            assert.equal(await workspace.nvim.eval('&l:buflisted'), 0);
                            assert.equal(await workspace.nvim.eval('b:current_syntax'), filetype);
                            assert.equal(
                                await workspace.nvim.eval('b:svelte_test_filetype_event'),
                                filetype
                            );
                            assert.match(
                                await workspace.nvim.call('bufname', ['%']),
                                /\[Svelte compiled\]/
                            );
                            const lines = await workspace.nvim.call('getline', [1, '$']);
                            assert.match(lines.join('\n'), filetype === 'css' ? /color/ : /svelte/);
                            // Verify a real syntax group at a generated token, not just options.
                            const line = await workspace.nvim.call('search', [
                                filetype === 'css' ? 'color' : '^import',
                                'nw'
                            ]);
                            assert.ok(line > 0);
                            const text = lines[line - 1];
                            const column = filetype === 'css' ? text.indexOf('color') + 1 : 1;
                            assert.notEqual(
                                await workspace.nvim.eval(
                                    `synIDattr(synID(${line}, ${column}, 1), 'name')`
                                ),
                                ''
                            );
                        }, 'scratch preview was not initialized and highlighted');
                        await workspace.nvim.command('close');
                        assert.equal(await workspace.nvim.call('bufnr', ['%']), sourceBuffer);
                        assert.equal(await workspace.nvim.eval('&l:buftype'), '');
                        assert.equal(await workspace.nvim.eval('&l:modifiable'), 1);
                    }
                });
                await run('multi-root Svelte 4 and Svelte 5 isolation', async () => {
                    assert.equal(workspace.workspaceFolders.length, 3);
                    const legacy = Uri.file(
                        path.join(process.env.COC_SVELTE_LEGACY, 'Legacy.svelte')
                    ).toString();
                    await workspace.openResource(legacy);
                    const diagnostics = await client.sendRequest('textDocument/diagnostic', {
                        textDocument: { uri: legacy }
                    });
                    assert.equal(
                        diagnostics.items.filter((item) => item.severity === 1).length,
                        0,
                        JSON.stringify(diagnostics)
                    );
                    const hover = await client.sendRequest('textDocument/hover', {
                        textDocument: { uri: legacy },
                        position: { line: 1, character: 7 }
                    });
                    assert.match(JSON.stringify(hover), /string/);
                    const legacyScript = path.join(process.env.COC_SVELTE_LEGACY, 'index.ts');
                    await workspace.openResource(Uri.file(legacyScript).toString());
                    await eventually(async () => {
                        const result = await commands.executeCommand(
                            'typescript.tsserverRequest',
                            'semanticDiagnosticsSync',
                            { file: legacyScript }
                        );
                        assert.equal(result?.body?.length, 1, JSON.stringify(result));
                        assert.equal(result.body[0].code, 2322, JSON.stringify(result));
                    }, 'tsserver did not isolate the Svelte 4 project');
                    await workspace.openResource(file('Child.svelte'));
                    const modern = await client.sendRequest('textDocument/diagnostic', {
                        textDocument: { uri: file('Child.svelte') }
                    });
                    assert.equal(
                        modern.items.filter((item) => item.severity === 1).length,
                        0,
                        JSON.stringify(modern)
                    );
                });
                await run('SvelteKit generated PageProps and $lib definitions', async () => {
                    const kit = process.env.COC_SVELTE_KIT;
                    const uri = Uri.file(path.join(kit, 'src/routes/+page.svelte')).toString();
                    await workspace.openResource(uri);
                    const kitRequest = (method, extra = {}) =>
                        client.sendRequest(method, { textDocument: { uri }, ...extra });
                    const diagnostics = await kitRequest('textDocument/diagnostic');
                    assert.equal(
                        diagnostics.items.filter((item) => item.severity === 1).length,
                        0,
                        JSON.stringify(diagnostics)
                    );
                    const definition = await kitRequest('textDocument/definition', {
                        position: { line: 2, character: 11 }
                    });
                    assert.ok(
                        definition.some(
                            (entry) =>
                                (entry.uri || entry.targetUri) ===
                                Uri.file(path.join(kit, 'src/lib/message.ts')).toString()
                        ),
                        JSON.stringify(definition)
                    );
                    const doc = workspace.getDocument(uri);
                    await doc.buffer.setLines(['const greeting: number = data.greeting;'], {
                        start: 4,
                        end: 5,
                        strictIndexing: false
                    });
                    await doc.synchronize();
                    await eventually(async () => {
                        const result = await kitRequest('textDocument/diagnostic');
                        assert.ok(
                            result.items.some((item) => item.code === 2322),
                            JSON.stringify(result)
                        );
                    }, 'generated PageProps must preserve the load return type');
                });
                await run('environment report', async () => {
                    await workspace.openResource(file('App.svelte'));
                    const report = await commands.executeCommand('svelte.showEnvironment');
                    assert.match(report, /svelte: 5\./);
                    assert.match(report, /Language client state: Running/);
                    assert.match(report, /Last launched server entry: .*server\.js/);
                    assert.match(report, /Server Svelte fallback: 4\./);
                    assert.match(report, /coc-tsserver: .*active=true/);
                    assert.match(report, /Extension: 0\.2\.0/);
                    await workspace.openResource(file('App.svelte'));
                });
                assert.ok(passed.length > 0, 'No integration scenarios selected');
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
