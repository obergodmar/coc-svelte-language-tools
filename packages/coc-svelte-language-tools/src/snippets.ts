import {
    commands,
    CompletionItemKind,
    Disposable,
    InsertTextFormat,
    languages,
    Range,
    snippetManager,
    window,
    workspace
} from 'coc.nvim';

// Distinct prefixes avoid competing with ordinary language-server completions.
export const svelteSnippets: Record<string, { description: string; body: string }> = {
    's-if': { description: 'Conditional block', body: '{#if ${1:condition}}\n\t$0\n{/if}' },
    's-each': {
        description: 'Keyed each block',
        body: '{#each ${1:items} as ${2:item} (${2:item}.${3:id})}\n\t$0\n{/each}'
    },
    's-await': {
        description: 'Await block',
        body: '{#await ${1:promise}}\n\t${2:Loading…}\n{:then ${3:value}}\n\t$0\n{:catch ${4:error}}\n\t{${4:error}.message}\n{/await}'
    },
    's-key': { description: 'Key block', body: '{#key ${1:expression}}\n\t$0\n{/key}' },
    's-snippet': {
        description: 'Svelte 5 snippet block',
        body: '{#snippet ${1:name}(${2:parameters})}\n\t$0\n{/snippet}'
    },
    's-render': {
        description: 'Render a Svelte 5 snippet',
        body: '{@render ${1:name}(${2:arguments})}$0'
    },
    's-script': { description: 'TypeScript script', body: '<script lang="ts">\n\t$0\n</script>' },
    's-style': { description: 'Component styles', body: '<style>\n\t$0\n</style>' }
};

export function activateSnippets(): Disposable {
    const completion = languages.registerCompletionItemProvider(
        'svelte-snippets',
        'Svelte',
        [{ language: 'svelte' }],
        {
            provideCompletionItems(document, position) {
                if (
                    !workspace.getConfiguration('svelte', document.uri).get('snippets.enable', true)
                )
                    return [];
                const prefix = document.getText(
                    Range.create(position.line, 0, position.line, position.character)
                );
                const match = /^\s*(s-[\w-]*)$/.exec(prefix);
                if (!match) return [];
                const range = Range.create(
                    position.line,
                    position.character - match[1].length,
                    position.line,
                    position.character
                );
                return Object.entries(svelteSnippets).map(([label, item]) => ({
                    label,
                    detail: item.description,
                    kind: CompletionItemKind.Snippet,
                    insertTextFormat: InsertTextFormat.Snippet,
                    textEdit: { range, newText: item.body }
                }));
            }
        }
    );
    const command = commands.registerCommand('svelte.insertSnippet', async (name?: string) => {
        const { document } = await workspace.getCurrentState();
        if (document.languageId !== 'svelte') return;
        name ??= await window.showQuickPick(Object.keys(svelteSnippets), {
            title: 'Svelte snippet'
        });
        if (!name) return;
        if (!Object.hasOwn(svelteSnippets, name))
            throw new Error(`Unknown Svelte snippet: ${name}`);
        await snippetManager.insertSnippet(svelteSnippets[name].body);
    });
    return Disposable.create(() => {
        completion.dispose();
        command.dispose();
    });
}
