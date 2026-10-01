const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');

const revision = '718daaf1ef1b5a7ce3369f3bb011217ab7633dcb';
const sha256 = 'f8f428ff982a26557ecb8ed6dce96afbc1bee38ecb97210e74a6df9d98c2f1cc';
const scratch = path.resolve(__dirname, '../../../.coc-test');
const runtime = path.join(scratch, `coc-${revision}`);

async function main() {
    fs.mkdirSync(scratch, { recursive: true });
    if (!fs.existsSync(path.join(runtime, 'build/index.js'))) {
        const response = await fetch(
            `https://api.github.com/repos/neoclide/coc.nvim/tarball/${revision}`
        );
        if (!response.ok) throw new Error(`coc.nvim download: HTTP ${response.status}`);
        const bytes = Buffer.from(await response.arrayBuffer());
        if (createHash('sha256').update(bytes).digest('hex') !== sha256) {
            throw new Error('coc.nvim archive checksum mismatch');
        }
        const archive = path.join(scratch, `coc-${revision}.tar.gz`);
        fs.writeFileSync(archive, bytes);
        fs.mkdirSync(runtime, { recursive: true });
        execFileSync('tar', ['-xzf', archive, '--strip-components=1', '-C', runtime]);
        execFileSync('npm', ['ci', '--no-audit', '--no-fund'], { cwd: runtime, stdio: 'inherit' });
    }
    const extensions = path.join(scratch, 'extensions');
    fs.mkdirSync(extensions, { recursive: true });
    for (const file of ['package.json', 'package-lock.json']) {
        fs.copyFileSync(path.join(__dirname, 'runtime', file), path.join(extensions, file));
    }
    execFileSync('npm', ['ci', '--no-audit', '--no-fund'], { cwd: extensions, stdio: 'inherit' });
    console.log(`Test runtime: ${runtime}`);
}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
