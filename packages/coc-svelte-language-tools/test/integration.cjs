const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../../..');
const scratch = path.join(root, '.coc-test');
const runtime =
    process.env.COC_NVIM_PATH || path.join(scratch, 'coc-718daaf1ef1b5a7ce3369f3bb011217ab7633dcb');
const extension = process.env.COC_SVELTE_EXTENSION || path.resolve(__dirname, '..');
const developmentExtension = path.resolve(__dirname, '..');
const run = fs.mkdtempSync(path.join(scratch, 'run-'));
fs.mkdirSync(path.join(run, 'tmp'));
fs.mkdirSync(path.join(run, 'config'));
// Extension settings must be loaded from a config file. CoC drops unknown
// g:coc_user_config keys before dynamically registered extensions contribute them.
fs.writeFileSync(
    path.join(run, 'config/coc-settings.json'),
    JSON.stringify({
        'suggest.noselect': true,
        'tsserver.log': 'verbose',
        'tsserver.tsdk': path.join(extension, 'node_modules/typescript/lib'),
        'tsserver.useLocalTsdk': false,
        'workspace.rootPatterns': ['package.json']
    })
);
const fixture = path.join(run, 'project');
fs.mkdirSync(fixture);
fs.mkdirSync(path.join(fixture, 'node_modules'));
for (const name of ['svelte', 'typescript']) {
    fs.symlinkSync(
        path.join(developmentExtension, 'node_modules', name === 'svelte' ? 'svelte5' : name),
        path.join(fixture, 'node_modules', name),
        'dir'
    );
}
fs.writeFileSync(
    path.join(fixture, 'package.json'),
    JSON.stringify({ type: 'module', dependencies: { svelte: '^5.0.0' } })
);
fs.writeFileSync(
    path.join(fixture, 'tsconfig.json'),
    JSON.stringify({
        compilerOptions: {
            strict: true,
            target: 'ESNext',
            module: 'ESNext',
            moduleResolution: 'bundler',
            allowJs: true,
            skipLibCheck: true
        },
        include: ['**/*.ts', '**/*.svelte']
    })
);
fs.writeFileSync(
    path.join(fixture, 'App.svelte'),
    `<script lang="ts">
import { value } from './value';
let count = $state(0);
let label: string = value;
</script>
<p>{count} {label}</p>
`
);
fs.writeFileSync(path.join(fixture, 'Tags.svelte'), '<section');
fs.writeFileSync(path.join(fixture, 'Snippet.svelte'), '');
fs.writeFileSync(path.join(fixture, 'value.ts'), 'export const value = 42;\n');
fs.writeFileSync(
    path.join(fixture, 'Child.svelte'),
    '<script lang="ts">let { name }: { name: string } = $props();</script>\n<p>{name}</p>\n'
);
fs.writeFileSync(path.join(fixture, 'index.ts'), "import Child from './Child.svelte';\nChild;\n");
const quote = (value) => `'${value.replaceAll("'", "''")}'`;
const init = path.join(run, 'init.vim');
fs.writeFileSync(
    init,
    `set nocompatible
set hidden
set noswapfile
set shortmess+=I
let g:coc_data_home = ${quote(path.join(run, 'data'))}
let g:coc_config_home = ${quote(path.join(run, 'config'))}
let g:coc_node_path = ${quote(process.execPath)}
let g:coc_disable_startup_warning = 1
let g:coc_global_extensions = []
execute 'set runtimepath^=' . fnameescape(${quote(runtime)})
filetype plugin indent on
runtime plugin/coc.vim
function! FinishSvelteTests(error, result)
  if a:error isnot v:null
    call writefile([string(a:error), execute('messages')], ${quote(path.join(run, 'vim-error'))})
    cquit!
  endif
  qa!
endfunction
function! RunSvelteTests(timer)
  try
    if wait(20000, {-> get(g:, 'coc_service_initialized', 0)}, 50) != 0
      throw 'coc.nvim did not initialize'
    endif
    call CocAction('registerExtensions', ${quote(path.join(scratch, 'extensions/node_modules/coc-tsserver'))}, ${quote(extension)}, ${quote(path.join(__dirname, 'host'))})
    call CocActionAsync('runCommand', 'svelte.test', function('FinishSvelteTests'))
  catch
    call writefile([v:exception, v:throwpoint, execute('messages')], ${quote(path.join(run, 'vim-error'))})
    cquit!
  endtry
endfunction
call timer_start(100, function('RunSvelteTests'))
`
);
const resultFile = path.join(run, 'result.json');
const result = spawnSync('nvim', ['--headless', '-u', init, '-i', 'NONE'], {
    cwd: fixture,
    timeout: 90000,
    encoding: 'utf8',
    env: {
        ...process.env,
        TMPDIR: path.join(run, 'tmp'),
        COC_SVELTE_FIXTURE: fixture,
        COC_SVELTE_RESULT: resultFile,
        XDG_CONFIG_HOME: path.join(run, 'xdg-config'),
        XDG_DATA_HOME: path.join(run, 'xdg-data'),
        XDG_STATE_HOME: path.join(run, 'xdg-state'),
        XDG_CACHE_HOME: path.join(run, 'xdg-cache'),
        NVIM_LOG_FILE: path.join(run, 'nvim.log'),
        NVIM_COC_LOG_FILE: path.join(run, 'coc.log')
    }
});
console.log(`Integration artifacts: ${run}`);
if (fs.existsSync(resultFile)) console.log(fs.readFileSync(resultFile, 'utf8'));
if (result.status !== 0) {
    console.error(result.stdout, result.stderr, result.error || '');
    if (fs.existsSync(path.join(run, 'vim-error')))
        console.error(fs.readFileSync(path.join(run, 'vim-error'), 'utf8'));
}
assert.equal(result.status, 0, 'headless Neovim integration failed');
assert.ok(fs.existsSync(resultFile), 'test host did not run');
assert.equal(JSON.parse(fs.readFileSync(resultFile)).error, undefined);
