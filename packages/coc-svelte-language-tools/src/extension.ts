import { fork } from 'node:child_process';
import path from 'node:path';
import {
    commands,
    ExtensionContext,
    LanguageClient,
    Location,
    services,
    State,
    Uri,
    window,
    workspace,
    WorkspaceEdit
} from 'coc.nvim';
import { configurationSections, initializationOptions } from './configuration';
import { isConfiguration, isScript } from './files';
import { TypeScriptPlugin } from './tsplugin';
import { filterRenameEdit } from './rename';
import { activateTagClosing } from './tagClosing';
import { activateSnippets } from './snippets';
import { activateRoutes } from './routes';
import { openCompiledPreview } from './preview';

let activeClient: LanguageClient | undefined;

export function activate(context: ExtensionContext) {
    const output = window.createOutputChannel('Svelte');
    context.subscriptions.push(output);
    const tsPlugin = new TypeScriptPlugin(context, output);
    if (!workspace.getConfiguration('svelte').get('enable', true)) return;

    const client = new LanguageClient(
        'svelte',
        'Svelte',
        () => {
            // Resolve on every start so runtime/path changes take effect after a restart.
            const config = workspace.getConfiguration('svelte.language-server');
            const customPath = config.get<string>('ls-path');
            if (customPath && !path.isAbsolute(customPath)) {
                throw new Error('svelte.language-server.ls-path must be an absolute path.');
            }
            const module = customPath || require.resolve('svelte-language-server/bin/server.js');
            // A factory returning ChildProcess uses stdio in coc's LanguageClient.
            return Promise.resolve(
                fork(module, ['--stdio', `--clientProcessId=${process.pid}`], {
                    cwd: workspace.rootPath || undefined,
                    execPath: config.get<string>('runtime') || process.execPath,
                    execArgv: config.get<string[]>('runtime-args', []),
                    stdio: ['pipe', 'pipe', 'pipe', 'ipc']
                })
            );
        },
        {
            documentSelector: [{ scheme: 'file', language: 'svelte' }],
            outputChannel: output,
            initializationOptions,
            synchronize: { configurationSection: configurationSections },
            middleware: {
                async resolveCodeLens(lens, token, next) {
                    const resolved = (await next(lens, token)) ?? lens;
                    const args = resolved.command?.arguments;
                    if (args?.length === 3 && Array.isArray(args[2])) {
                        resolved.command = {
                            title: resolved.command!.title,
                            command: 'svelte.showReferences',
                            arguments: [args[2]]
                        };
                    }
                    return resolved;
                }
            }
        }
    );
    activeClient = client;
    context.subscriptions.push(activateTagClosing(client), activateSnippets(), activateRoutes());
    const report = (error: unknown) => output.appendLine(String(error));

    let restarting: Promise<void> | undefined;
    const restart = () => {
        if (!restarting) {
            restarting = client.restart().finally(() => {
                restarting = undefined;
            });
        }
        return restarting;
    };
    const ready = async () => {
        if (restarting) await restarting;
        await client.start();
        return client;
    };

    // Keep TS/JS buffers out of the document selector: coc-tsserver owns them.
    // The Svelte server has a separate notification for their unsaved contents.
    const syncScript = async (uri: string, text?: string) => {
        if (!client.isRunning() || !isScript(uri) || !uri.startsWith('file:')) return;
        await client.sendNotification('$/onDidChangeTsOrJsFile', {
            uri,
            ...(text === undefined ? {} : { changes: [{ text }] })
        });
    };

    context.subscriptions.push(
        client.onDidChangeState((event) => {
            if (event.newState !== State.Running) return;
            for (const doc of workspace.textDocuments) {
                void syncScript(doc.uri, doc.getText()).catch(report);
            }
        }),
        workspace.onDidChangeTextDocument((event) => {
            const doc = workspace.getDocument(event.textDocument.uri);
            if (doc) void syncScript(doc.uri, doc.textDocument.getText()).catch(report);
        }),
        workspace.onDidOpenTextDocument((doc) => {
            void syncScript(doc.uri, doc.getText()).catch(report);
        }),
        workspace.onDidCloseTextDocument((doc) => {
            // Discard an unsaved overlay when a buffer is closed without saving.
            void syncScript(doc.uri).catch(report);
        }),
        workspace.onDidSaveTextDocument((doc) => {
            if (client.isRunning() && isConfiguration(doc.uri)) void restart().catch(report);
        }),
        workspace.onWillRenameFiles((event) => {
            if (
                !client.isRunning() ||
                !workspace.getConfiguration('svelte').get('updateImportsOnFileMove.enable', true)
            )
                return;
            // Request edits while the old paths are still available. File watchers
            // may otherwise remove the snapshots before getEditsForFileRename runs.
            event.waitUntil(
                (async () => {
                    const result: WorkspaceEdit = { documentChanges: [] };
                    for (const file of event.files) {
                        const edit = await client.sendRequest<WorkspaceEdit | null>(
                            '$/getEditsForFileRename',
                            {
                                oldUri: file.oldUri.toString(),
                                newUri: file.newUri.toString()
                            }
                        );
                        const filtered = filterRenameEdit(edit, tsPlugin.enabled);
                        for (const change of filtered.documentChanges ?? []) {
                            if (!('textDocument' in change)) continue;
                            // The server returns paths after the move; CoC applies these
                            // edits before the move, including edits inside moved folders.
                            for (const moved of event.files) {
                                const oldUri = moved.oldUri.toString();
                                const newUri = moved.newUri.toString();
                                const uri = change.textDocument.uri;
                                if (uri === newUri || uri.startsWith(newUri + '/')) {
                                    change.textDocument.uri = oldUri + uri.slice(newUri.length);
                                    break;
                                }
                            }
                            result.documentChanges!.push(change);
                        }
                    }
                    return result;
                })()
            );
        }),
        commands.registerCommand('svelte.restartLanguageServer', restart),
        commands.registerCommand('svelte.showReferences', (locations: Location[]) =>
            workspace.showLocations(locations)
        ),
        commands.registerCommand('svelte.openLink', async (url: string) => {
            if (/^https?:\/\//.test(url)) await workspace.openResource(url);
        })
    );

    for (const [command, method] of [
        ['findFileReferences', '$/getFileReferences'],
        ['findComponentReferences', '$/getComponentReferences']
    ]) {
        context.subscriptions.push(
            commands.registerCommand(`svelte.typescript.${command}`, async () => {
                const { document } = await workspace.getCurrentState();
                const locations = await (
                    await ready()
                ).sendRequest<Location[] | null>(method, document.uri);
                if (locations) await workspace.showLocations(locations);
            })
        );
    }

    context.subscriptions.push(
        commands.registerCommand('svelte.migrate_to_svelte_5', async () => {
            const { document } = await workspace.getCurrentState();
            if (document.languageId !== 'svelte') return;
            await (
                await ready()
            ).sendRequest('workspace/executeCommand', {
                command: 'migrate_to_svelte_5',
                arguments: [document.uri]
            });
        }),
        commands.registerCommand('svelte.extractComponent', async (mode?: string) => {
            const { document } = await workspace.getCurrentState();
            if (document.languageId !== 'svelte') return;
            const range = await window.getSelectedRange(
                mode || ((await workspace.nvim.call('visualmode')) as string)
            );
            if (!range) return;
            const filePath = await window.requestInput('Component name', 'NewComponent');
            if (!filePath.trim()) return;
            await (
                await ready()
            ).sendRequest('workspace/executeCommand', {
                command: 'extract_to_svelte_component',
                arguments: [document.uri, { uri: document.uri, range, filePath }]
            });
        })
    );
    for (const [command, suffix] of [
        ['showCompiledCode', 'js'],
        ['showCompiledCSS', 'css']
    ]) {
        context.subscriptions.push(
            commands.registerCommand(`svelte.${command}`, async () => {
                const { document } = await workspace.getCurrentState();
                if (document.languageId !== 'svelte') return;
                const response = await (
                    await ready()
                ).sendRequest<{
                    js?: { code: string };
                    css?: { code: string };
                } | null>('$/getCompiledCode', document.uri);
                if (!response) {
                    await window.showErrorMessage(
                        'Svelte compilation failed. See diagnostics in the source buffer.'
                    );
                    return;
                }
                return openCompiledPreview(
                    Uri.parse(document.uri).fsPath,
                    suffix === 'css' ? 'css' : 'javascript',
                    (suffix === 'css' ? response.css?.code : response.js?.code) ?? '/* No output */'
                );
            })
        );
    }

    // Register last: listeners and commands must exist before the service starts.
    context.subscriptions.push(services.registerLanguageClient(client));
    return { getLanguageServer: () => client };
}

export async function deactivate(): Promise<void> {
    const client = activeClient;
    activeClient = undefined;
    await client?.stop();
}
