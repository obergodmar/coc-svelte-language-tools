const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

exports.createProjects = (run, scratch, extension) => {
    const legacy = path.join(run, 'svelte4');
    fs.mkdirSync(path.join(legacy, 'node_modules'), { recursive: true });
    fs.symlinkSync(
        path.join(extension, 'node_modules/svelte'),
        path.join(legacy, 'node_modules/svelte'),
        'dir'
    );
    fs.writeFileSync(
        path.join(legacy, 'package.json'),
        JSON.stringify({ type: 'module', dependencies: { svelte: '^4.0.0' } })
    );
    fs.writeFileSync(
        path.join(legacy, 'Legacy.svelte'),
        '<script lang="ts">export let title: string = "legacy";</script>\n<h1>{title}</h1>\n'
    );

    fs.writeFileSync(
        path.join(legacy, 'index.ts'),
        "import Legacy from './Legacy.svelte';\nimport type { ComponentProps } from 'svelte';\nconst props: ComponentProps<Legacy> = { title: 42 };\n"
    );
    fs.writeFileSync(
        path.join(legacy, 'tsconfig.json'),
        JSON.stringify({
            compilerOptions: {
                strict: true,
                skipLibCheck: true,
                moduleResolution: 'bundler',
                module: 'ESNext'
            },
            include: ['**/*.ts', '**/*.svelte']
        })
    );

    const kit = path.join(run, 'kit');
    fs.mkdirSync(path.join(kit, 'src/routes'), { recursive: true });
    fs.mkdirSync(path.join(kit, 'src/lib'), { recursive: true });
    fs.symlinkSync(
        path.join(scratch, 'kit-runtime/node_modules'),
        path.join(kit, 'node_modules'),
        'dir'
    );
    fs.copyFileSync(path.join(scratch, 'kit-runtime/package.json'), path.join(kit, 'package.json'));
    fs.writeFileSync(path.join(kit, 'svelte.config.js'), 'export default { kit: {} };\n');
    fs.writeFileSync(
        path.join(kit, 'tsconfig.json'),
        JSON.stringify({
            extends: './.svelte-kit/tsconfig.json',
            compilerOptions: {
                strict: true,
                allowJs: true,
                checkJs: true,
                skipLibCheck: true,
                moduleResolution: 'bundler'
            }
        })
    );
    fs.writeFileSync(
        path.join(kit, 'src/app.html'),
        '<!doctype html><html><head>%sveltekit.head%</head><body><div>%sveltekit.body%</div></body></html>'
    );
    fs.writeFileSync(path.join(kit, 'src/lib/message.ts'), 'export const message = "from lib";\n');
    fs.writeFileSync(
        path.join(kit, 'src/routes/+page.ts'),
        'export const load = () => ({ greeting: "Hello Kit" });\n'
    );
    fs.writeFileSync(
        path.join(kit, 'src/routes/+page.svelte'),
        `<script lang="ts">
import type { PageProps } from './$types';
import { message } from '$lib/message';
let { data }: PageProps = $props();
const greeting: string = data.greeting;
</script>
<h1>{greeting} {message}</h1>
`
    );
    execFileSync(
        process.execPath,
        [path.join(kit, 'node_modules/@sveltejs/kit/svelte-kit.js'), 'sync'],
        { cwd: kit, stdio: 'inherit' }
    );
    return { legacy, kit };
};
