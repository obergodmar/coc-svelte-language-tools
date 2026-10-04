import { extensions, workspace, Uri, ExtensionContext, OutputChannel } from 'coc.nvim';

interface TypeScriptAPI {
    configurePlugin(
        name: string,
        configuration: { enable: boolean; svelteDocuments: { fileName: string; text: string }[] }
    ): void;
}

export class TypeScriptPlugin {
    private disposed = false;
    private timer: NodeJS.Timeout | undefined;
    private configured = false;
    private pending: Promise<void> = Promise.resolve();

    constructor(
        context: ExtensionContext,
        private readonly output: OutputChannel
    ) {
        context.subscriptions.push(
            this,
            workspace.onDidOpenTextDocument((doc) => {
                if (doc.languageId === 'svelte') this.schedule();
            }),
            workspace.onDidChangeTextDocument((event) => {
                if (workspace.getDocument(event.textDocument.uri)?.filetype === 'svelte')
                    this.schedule();
            }),
            workspace.onDidCloseTextDocument((doc) => {
                if (doc.languageId === 'svelte') this.schedule();
            }),
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

    private schedule(): void {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.configure(), 75);
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
                    enable: workspace.getConfiguration('svelte').get('enable-ts-plugin', true),
                    svelteDocuments: workspace.textDocuments
                        .filter(
                            (doc) =>
                                doc.languageId === 'svelte' && Uri.parse(doc.uri).scheme === 'file'
                        )
                        .map((doc) => ({
                            fileName: Uri.parse(doc.uri).fsPath,
                            text: doc.getText()
                        }))
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
        clearTimeout(this.timer);
        const extension = extensions.getExtensionById<TypeScriptAPI>('coc-tsserver');
        if (extension?.isActive && this.configured) {
            extension.exports.configurePlugin('typescript-svelte-plugin', {
                enable: false,
                svelteDocuments: []
            });
        }
    }
}
