import path from 'node:path';
import { commands, Disposable, Uri, window, workspace } from 'coc.nvim';
import { createRouteFile, routeKinds, RouteKind } from './routeFiles';

export function activateRoutes(): Disposable {
    return commands.registerCommand(
        'svelte.createRouteFile',
        async (directory?: string, kind?: RouteKind, language?: 'ts' | 'js') => {
            const { document } = await workspace.getCurrentState();
            const uri = Uri.parse(document.uri);
            directory ??= await window.requestInput(
                'Absolute route directory',
                uri.scheme === 'file' ? path.dirname(uri.fsPath) : workspace.rootPath
            );
            if (!directory) return;
            kind ??= (await window.showQuickPick([...routeKinds], { title: 'SvelteKit file' })) as
                | RouteKind
                | undefined;
            if (!kind) return;
            language ??= (await window.showQuickPick(['ts', 'js'], {
                title: 'Script language'
            })) as 'ts' | 'js' | undefined;
            if (!language) return;
            if (!['ts', 'js'].includes(language))
                throw new Error('Script language must be ts or js.');
            const target = await createRouteFile(directory, kind, language === 'ts');
            await workspace.openResource(Uri.file(target).toString());
            return target;
        }
    );
}
