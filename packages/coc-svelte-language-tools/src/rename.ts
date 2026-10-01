import type { WorkspaceEdit } from 'coc.nvim';
import { isScript } from './files';

/** Match upstream's division of work with typescript-svelte-plugin. */
export function filterRenameEdit(
    edit: WorkspaceEdit | null,
    pluginEnabled: boolean
): WorkspaceEdit {
    return {
        documentChanges: (edit?.documentChanges ?? []).flatMap((change) => {
            if (!('textDocument' in change)) return [];
            const uri = change.textDocument.uri;
            if (uri.endsWith('.svelte')) return [change];
            if (!isScript(uri)) return [];
            const svelteEdits = change.edits.filter(
                (item) => 'newText' in item && item.newText.endsWith('.svelte')
            );
            if (!svelteEdits.length) return [];
            return [{ ...change, edits: pluginEnabled ? change.edits : svelteEdits }];
        })
    };
}
