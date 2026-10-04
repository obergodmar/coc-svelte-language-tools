import fs from 'node:fs';
import path from 'node:path';
import { commands, extensions, ExtensionContext, State, Uri, window, workspace } from 'coc.nvim';

export interface ServerEnvironment {
    state: State | undefined;
    module?: string;
    runtime?: string;
    pid?: number;
}

// Read manifests without executing project packages or configuration files.
export function describePackage(name: string, from: string): string {
    try {
        const manifest = require.resolve(`${name}/package.json`, { paths: [from] });
        const json = JSON.parse(fs.readFileSync(manifest, 'utf8'));
        return `${json.version ?? 'unknown version'} — ${fs.realpathSync(manifest)}`;
    } catch {
        return `not resolved from ${from}`;
    }
}

export function activateEnvironment(
    context: ExtensionContext,
    server: () => ServerEnvironment,
    pluginEnabled: () => boolean
) {
    const output = window.createOutputChannel('Svelte Environment');
    context.subscriptions.push(output);
    return commands.registerCommand('svelte.showEnvironment', async () => {
        const doc = await workspace.document;
        const uri = Uri.parse(doc.uri);
        const from = uri.scheme === 'file' ? path.dirname(uri.fsPath) : workspace.rootPath;
        const config = workspace.getConfiguration('svelte.language-server');
        const configuredModule =
            config.get<string>('ls-path') ||
            require.resolve('svelte-language-server/bin/server.js');
        const running = server();
        const serverDir = path.dirname(running.module || configuredModule);
        const tsserver = extensions.getExtensionById('coc-tsserver');
        const tsserverPath = String(await workspace.nvim.eval("get(g:, 'Coc_tsserver_path', '')"));
        const extensionVersion = JSON.parse(
            fs.readFileSync(path.join(context.extensionPath, 'package.json'), 'utf8')
        ).version;
        const lines = [
            'Svelte environment',
            '',
            `Extension: ${extensionVersion} — ${context.extensionPath}`,
            `coc Node: ${process.version} — ${process.execPath}`,
            `Platform: ${process.platform} ${process.arch}`,
            `Document: ${doc.uri}`,
            `Resolution directory: ${from || '(no project)'}`,
            `Workspace folders: ${workspace.workspaceFolders.map((folder) => folder.uri).join(', ') || '(none)'}`,
            '',
            'Project packages (resolved on disk, not a list of loaded modules):',
            ...['svelte', 'typescript', '@sveltejs/kit'].map(
                (name) => `${name}: ${from ? describePackage(name, from) : 'no project'}`
            ),
            '',
            `Language server enabled: ${workspace.getConfiguration('svelte').get('enable', true)}`,
            `Language client state: ${running.state === undefined ? 'not created' : State[running.state]}`,
            `Configured server entry: ${configuredModule}`,
            `Configured Node: ${config.get<string>('runtime') || process.execPath}`,
            `Last launched server entry: ${running.module || '(not launched)'}`,
            `Last launched Node: ${running.runtime || '(not launched)'}`,
            `Last launched PID: ${running.pid ?? '(none)'}`,
            `Server package: ${describePackage('svelte-language-server', serverDir)}`,
            `Server TypeScript dependency: ${describePackage('typescript', serverDir)}`,
            `Server Svelte fallback: ${describePackage('svelte', serverDir)}`,
            '',
            `coc-tsserver: ${tsserver ? `${tsserver.packageJSON.version}, active=${tsserver.isActive}` : 'not installed'}`,
            `coc-tsserver last reported TypeScript path: ${tsserverPath || '(not reported)'}`,
            `coc-tsserver TypeScript package at reported path: ${tsserverPath ? describePackage('typescript', path.dirname(tsserverPath)) : '(not reported)'}`,
            `Svelte TS plugin configured and enabled: ${pluginEnabled()}`,
            `TS plugin package: ${describePackage('typescript-svelte-plugin', context.extensionPath)}`,
            '',
            'Missing project Svelte? Install project dependencies; the bundled fallback is Svelte 4.',
            'For Svelte 5 runes, the project must resolve Svelte 5.',
            'Configured paths apply on server restart. Last launched/reported paths may belong to a stopped process.'
        ];
        const report = lines.join('\n');
        output.clear();
        output.appendLine(report);
        output.show(true);
        return report;
    });
}
