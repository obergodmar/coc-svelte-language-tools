const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');

function parts(version) {
    if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
        throw new Error(`Expected stable version, got ${version}`);
    }
    return version.split('.').map(BigInt);
}

function releaseVersion(base, runNumber) {
    if (!/^[1-9]\d*$/.test(runNumber || '')) throw new Error('Invalid GitHub run number');
    const [major, minor, patch] = parts(base);
    const next = patch + BigInt(runNumber);
    if (next > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Version overflow');
    return `${major}.${minor}.${next}`;
}

function newer(left, right) {
    const a = parts(left);
    const b = parts(right);
    for (let i = 0; i < 3; i++) {
        if (a[i] !== b[i]) return a[i] > b[i];
    }
    return false;
}

function prepare() {
    const file = path.join(__dirname, '../package.json');
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!/^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA || '')) throw new Error('Invalid commit SHA');
    manifest.version = releaseVersion(manifest.version, process.env.GITHUB_RUN_NUMBER);
    manifest.gitHead = process.env.GITHUB_SHA;
    fs.writeFileSync(file, JSON.stringify(manifest, null, 4) + '\n');
    console.log(`Prepared ${manifest.name}@${manifest.version} (${manifest.gitHead})`);
}

async function registryVersion(name, version) {
    const response = await fetch(
        `https://registry.npmjs.org/${encodeURIComponent(name)}/${version}`,
        {
            signal: AbortSignal.timeout(30000),
            headers: { 'cache-control': 'no-cache' }
        }
    );
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Registry returned ${response.status}`);
    return response.json();
}

async function publish(directory) {
    const release = JSON.parse(fs.readFileSync(path.join(directory, 'release.json'), 'utf8'));
    const { name, version, gitHead, filename, integrity } = release;
    if (name !== '@obergodmar/coc-svelte-language-tools' || gitHead !== process.env.GITHUB_SHA) {
        throw new Error('Release does not match this package/commit');
    }
    parts(version);
    if (filename !== `obergodmar-coc-svelte-language-tools-${version}.tgz`) {
        throw new Error('Unexpected archive filename');
    }
    const archive = path.resolve(directory, filename);
    const actual =
        'sha512-' + createHash('sha512').update(fs.readFileSync(archive)).digest('base64');
    if (actual !== integrity) throw new Error('Release archive integrity mismatch');
    const manifest = JSON.parse(
        execFileSync('tar', ['-xOf', archive, 'package/package.json'], { encoding: 'utf8' })
    );
    if (manifest.name !== name || manifest.version !== version || manifest.gitHead !== gitHead) {
        throw new Error('Archive manifest does not match release metadata');
    }
    const existing = await registryVersion(name, version);
    if (existing) {
        // A rerun can reuse a version only for the exact tested archive.
        if (existing.gitHead !== gitHead || existing.dist.integrity !== integrity) {
            throw new Error(`Conflicting published version ${version}`);
        }
        console.log(`${name}@${version} already published; verified integrity`);
        return;
    }
    const latest = await registryVersion(name, 'latest');
    // The publish job is serialized. Late builds/retries must not roll latest back.
    const tag = !latest || newer(version, latest.version) ? 'latest' : 'history';
    execFileSync(
        'npm',
        [
            'publish',
            archive,
            '--access',
            'public',
            '--provenance',
            '--tag',
            tag,
            '--registry=https://registry.npmjs.org',
            '--ignore-scripts'
        ],
        { stdio: 'inherit' }
    );
    // Registry propagation can lag behind a successful publish response.
    for (let attempt = 0; attempt < 180; attempt++) {
        const published = await registryVersion(name, version);
        if (published?.dist.integrity === integrity && published.gitHead === gitHead) {
            console.log(`Verified public ${name}@${version} (${tag})`);
            return;
        }
        if (published) throw new Error('Registry version has unexpected commit or integrity');
        if (attempt % 6 === 0) console.log(`Waiting for npm processing: ${name}@${version}`);
        await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    throw new Error('Published version did not become visible with the expected integrity');
}

module.exports = { releaseVersion, newer };
if (require.main === module) {
    Promise.resolve()
        .then(() => {
            if (process.argv[2] === 'prepare') return prepare();
            if (process.argv[2] === 'publish' && process.argv[3]) return publish(process.argv[3]);
            throw new Error('Usage: release.cjs prepare | publish <artifact-directory>');
        })
        .catch((error) => {
            console.error(error);
            process.exitCode = 1;
        });
}
