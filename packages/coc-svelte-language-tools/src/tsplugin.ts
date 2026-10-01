import { extensions, workspace, ExtensionContext, OutputChannel } from 'coc.nvim';

interface TypeScriptAPI {
    configurePlugin(name: string, configuration: { enable: boolean }): void;
}

export class TypeScriptPlugin {
    private disposed = false;
    private configured = false;
    private pending: Promise<void> = Promise.resolve();

    constructor(
        context: ExtensionContext,
        private readonly output: OutputChannel
    ) {
        context.subscriptions.push(
            this,
            extensions.onDidActiveExtension((extension) => {
                if (extension.id === 'coc-tsserver') this.configure();
            }),
            extensions.onDidUnloadExtension((id) => {
                if (id === 'coc-tsserver') this.configured = false;
            }),
            workspace.onDidChangeConfiguration((event) => {
                if (event.affectsConfiguration('svelte.enable-ts-plugin')) this.configure();
            })
        );
        // Do not await activation here: coc-tsserver can activate this extension in turn.
        this.configure();
    }

    get enabled(): boolean {
        return (
            this.configured && workspace.getConfiguration('svelte').get('enable-ts-plugin', true)
        );
    }

    private configure(): void {
        this.pending = this.pending
            .then(async () => {
                const extension = extensions.getExtensionById<TypeScriptAPI>('coc-tsserver');
                if (!extension || this.disposed) return;
                const api = extension.isActive ? extension.exports : await extension.activate();
                if (this.disposed) return;
                if (typeof api?.configurePlugin !== 'function') {
                    throw new Error(
                        'coc-tsserver does not expose configurePlugin; update coc-tsserver.'
                    );
                }
                api.configurePlugin('typescript-svelte-plugin', {
                    enable: workspace.getConfiguration('svelte').get('enable-ts-plugin', true)
                });
                this.configured = true;
            })
            .catch((error) => {
                this.configured = false;
                this.output.appendLine(`TypeScript plugin: ${error}`);
            });
    }

    dispose(): void {
        this.disposed = true;
        const extension = extensions.getExtensionById<TypeScriptAPI>('coc-tsserver');
        if (extension?.isActive && this.configured) {
            extension.exports.configurePlugin('typescript-svelte-plugin', { enable: false });
        }
    }
}
