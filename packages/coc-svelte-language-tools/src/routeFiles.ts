import fs from 'node:fs/promises';
import path from 'node:path';

export const routeKinds = [
    'page',
    'page-load',
    'page-server',
    'layout',
    'layout-load',
    'layout-server',
    'server',
    'error'
] as const;
export type RouteKind = (typeof routeKinds)[number];

/** Templates target Svelte 5 and SvelteKit >=2.16 (PageProps/LayoutProps). */
export function routeTemplate(kind: RouteKind, typescript: boolean) {
    if (!routeKinds.includes(kind)) throw new Error(`Unknown SvelteKit file kind: ${kind}`);
    const script = typescript ? '<script lang="ts">' : '<script>';
    if (kind === 'page' || kind === 'layout') {
        const type = kind === 'page' ? 'PageProps' : 'LayoutProps';
        const props = kind === 'page' ? 'data' : 'data, children';
        const declaration = typescript
            ? `    import type { ${type} } from './$types';\n\n    let { ${props} }: ${type} = $props();`
            : `    /** @type {import('./$types').${type}} */\n    let { ${props} } = $props();`;
        return {
            filename: `+${kind}.svelte`,
            text: `${script}\n${declaration}\n</script>\n\n${kind === 'page' ? '<h1>New page</h1>' : '{@render children()}'}\n`
        };
    }
    if (kind === 'error') {
        return {
            filename: '+error.svelte',
            text: `${script}\n    import { page } from '$app/state';\n</script>\n\n<h1>{page.status}: {page.error?.message}</h1>\n`
        };
    }
    const type = {
        'page-load': 'PageLoad',
        'page-server': 'PageServerLoad',
        'layout-load': 'LayoutLoad',
        'layout-server': 'LayoutServerLoad',
        server: 'RequestHandler'
    }[kind];
    const stem = kind.replace('-load', '').replace('-server', '.server');
    const name = kind === 'server' ? 'GET' : 'load';
    const value = kind === 'server' ? 'new Response()' : '{}';
    const text = typescript
        ? `import type { ${type} } from './$types';\n\nexport const ${name} = (async () => {\n    return ${value};\n}) satisfies ${type};\n`
        : `/** @type {import('./$types').${type}} */\nexport async function ${name}() {\n    return ${value};\n}\n`;
    return { filename: `+${stem}.${typescript ? 'ts' : 'js'}`, text };
}

export async function createRouteFile(directory: string, kind: RouteKind, typescript: boolean) {
    if (!path.isAbsolute(directory)) throw new Error('Route directory must be an absolute path.');
    const { filename, text } = routeTemplate(kind, typescript);
    const target = path.join(directory, filename);
    // Never overwrite existing contents, even if another process creates the file meanwhile.
    await fs.mkdir(directory, { recursive: true });
    try {
        await fs.writeFile(target, text, { flag: 'wx' });
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
            throw new Error(`SvelteKit file already exists: ${target}`);
        }
        throw error;
    }
    return target;
}
