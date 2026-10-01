const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
const version = require('../package.json').version;
const install = fs.mkdtempSync(path.join(root, '.coc-test/install-'));
fs.writeFileSync(path.join(install, 'package.json'), '{"private":true}');
// Empty cache plus --offline proves that the archive contains all runtime deps.
execFileSync(
    'npm',
    [
        'install',
        '--offline',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--cache',
        path.join(install, 'empty-cache'),
        process.env.COC_SVELTE_ARCHIVE ||
            path.join(root, 'artifacts', `coc-svelte-language-tools-${version}.tgz`)
    ],
    {
        cwd: install,
        stdio: 'inherit'
    }
);
execFileSync(process.execPath, [path.join(__dirname, 'integration.cjs')], {
    stdio: 'inherit',
    env: {
        ...process.env,
        COC_SVELTE_EXTENSION: path.join(install, 'node_modules/coc-svelte-language-tools')
    }
});
