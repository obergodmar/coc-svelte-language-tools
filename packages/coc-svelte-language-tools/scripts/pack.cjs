const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '../../..');
const scratch = path.join(root, '.coc-test');
fs.mkdirSync(scratch, { recursive: true });
const deployed = fs.mkdtempSync(path.join(scratch, 'deploy-'));
execFileSync('pnpm', ['--filter', 'coc-svelte-language-tools', 'deploy', '--prod', deployed], {
    cwd: root,
    stdio: 'inherit'
});

// npm pack does not traverse pnpm's virtual-store symlinks for transitive
// bundled dependencies. Materialize a conventional, self-contained npm tree.
const stage = fs.mkdtempSync(path.join(scratch, 'package-'));
function resolveDependency(directory, name) {
    for (let current = directory; current.startsWith(deployed); current = path.dirname(current)) {
        const candidate = path.join(current, 'node_modules', name);
        if (fs.existsSync(path.join(candidate, 'package.json'))) return fs.realpathSync(candidate);
    }
}
function materialize(source, target, ancestors = new Map()) {
    fs.cpSync(source, target, {
        recursive: true,
        filter: (file) => path.basename(file) !== 'node_modules'
    });
    const manifest = JSON.parse(fs.readFileSync(path.join(source, 'package.json')));
    const chain = new Map(ancestors).set(manifest.name, source);
    const dependencies = {
        ...manifest.peerDependencies,
        ...manifest.optionalDependencies,
        ...manifest.dependencies
    };
    for (const name of Object.keys(dependencies)) {
        const resolved = resolveDependency(source, name);
        if (!resolved) {
            if (manifest.dependencies?.[name] && !manifest.optionalDependencies?.[name]) {
                throw new Error(`Missing runtime dependency ${name} of ${manifest.name}`);
            }
            continue;
        }
        if (chain.get(name) === resolved) continue;
        materialize(resolved, path.join(target, 'node_modules', name), chain);
    }
}
materialize(deployed, stage);

const versions = Object.fromEntries(
    fs.readdirSync(path.join(root, 'packages')).flatMap((dir) => {
        const file = path.join(root, 'packages', dir, 'package.json');
        if (!fs.existsSync(file)) return [];
        const manifest = JSON.parse(fs.readFileSync(file));
        return [[manifest.name, manifest.version]];
    })
);
// pnpm deploy preserves workspace specifiers. The release is a self-contained
// snapshot, including our server patches, rather than a reference to npm upstream.
function rewrite(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) rewrite(file);
        else if (entry.name === 'package.json' && entry.isFile()) {
            const manifest = JSON.parse(fs.readFileSync(file));
            let changed = false;
            for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
                for (const [name, version] of Object.entries(manifest[field] || {})) {
                    if (version.startsWith('workspace:')) {
                        if (!versions[name])
                            throw new Error(`Unknown workspace dependency: ${name}`);
                        manifest[field][name] = versions[name];
                        changed = true;
                    }
                }
            }
            if (changed) fs.writeFileSync(file, JSON.stringify(manifest, null, 4) + '\n');
        }
    }
}
rewrite(stage);
const manifestFile = path.join(stage, 'package.json');
const manifest = JSON.parse(fs.readFileSync(manifestFile));
manifest.bundledDependencies = Object.keys(manifest.dependencies);
delete manifest.scripts;
delete manifest.devDependencies;
fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 4) + '\n');
const destination = path.join(root, 'artifacts');
fs.mkdirSync(destination, { recursive: true });
const packed = JSON.parse(
    execFileSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', destination], {
        cwd: stage,
        encoding: 'utf8'
    })
);
console.log(path.join(destination, packed[0].filename));
