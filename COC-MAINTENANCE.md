# Maintaining the CoC fork

Upstream: `sveltejs/language-tools`. Fork: `obergodmar/coc-svelte-language-tools`.
Initial upstream base: `bf2993e1` (2026-09-29).

Keep `master` aligned with upstream and maintain the CoC patch series on `coc`.
The CoC package, Nix environment and its workflow are additive. Upstream release
workflows already restrict publishing to `sveltejs/language-tools`; the CoC
workflow builds and tests changes, then publishes successful pushes to `coc` to npm.

## Updating

Start with a clean working tree and coordinate with anyone using the `coc` branch,
since rebasing changes commit IDs. Preserve release tags.

```sh
git fetch upstream
git switch coc
git rebase upstream/master
devenv shell -- coc-setup
devenv shell -- coc-build
devenv shell -- coc-test
devenv shell -- pnpm --filter svelte-language-server test
devenv shell -- coc-test-setup
devenv shell -- coc-test-integration
devenv shell -- coc-test-vim
devenv shell -- coc-pack
devenv shell -- pnpm --filter @obergodmar/coc-svelte-language-tools test:package
```

Inspect upstream changes in the VS Code client, custom server requests,
configuration and TypeScript plugin even when the rebase has no conflicts.
Update `svelte.plugin.*` properties from the upstream manifest when the schema
parity test fails. Do not copy VS Code-only commands/settings indiscriminately.

If upstream changes pnpm, update the version's integrity hash in `nix/pnpm.nix`.
`devenv.lock` pins Nix inputs and `pnpm-lock.yaml` pins JavaScript dependencies.
Keep the Svelte 5 test dependency aliased as `svelte5` to avoid changing the
hoisted compiler used by upstream Svelte 4 tests.

## Patches to upstream files

1. `packages/typescript-plugin/tsconfig.json`: explicitly include Node types for
   TypeScript 6 builds.
2. `LSAndTSDocResolver` and `GlobalSnapshotsManager`: accept a full TS/JS buffer
   before its service/snapshot exists. Required to restore unsaved buffers after
   restarting the language server. Covered by snapshot and real CoC tests.
3. The component event completion test accepts both orders of two equivalent
   union members. The original assertion also failed on a clean `bf2993e1`
   worktree with the current dependency environment.

4. The TypeScript plugin accepts optional `svelteDocuments` through its configuration
   channel, refreshes affected snapshots and restores disk contents when a buffer
   closes. The CoC client sends complete, debounced snapshots; coc-tsserver retains
   the latest configuration for replay after restarting. Other clients can omit
   this field and retain upstream behavior.

These are candidates for upstream contributions. Remove patches once equivalent
fixes are available upstream. Keep source modifications separate from client and
infrastructure commits so they can be reviewed or dropped independently.

## Release discipline

Build and verify the archive from the same commit. `coc-pack` deploys the pnpm
production graph, materializes its symlinks into a normal npm dependency tree and
bundles it. This prevents installations from silently using different upstream
server/plugin releases. The offline package test is required before publishing.
It installs outside the checkout so workspace dependencies cannot hide missing
runtime dependencies. The extension bundles Svelte 4 as a fallback compiler and
to satisfy `svelte2tsx`'s peer dependency in the TypeScript plugin; project-local
Svelte versions are resolved by the upstream tools.

The current matrix covers Linux with Vim and Neovim, Svelte 4/5, SvelteKit 2
generated types and multi-root projects. Expand it before claiming macOS/Windows
or SvelteKit 3 parity. Test dependencies live outside the production workspace
graph to avoid changing upstream compiler resolution.

Publish the verified archive to npm (never the workspace directory):

```sh
npm publish artifacts/obergodmar-coc-svelte-language-tools-0.2.0.tgz --access public --registry=https://registry.npmjs.org
```

The public package name is `@obergodmar/coc-svelte-language-tools`. Update the
package version and archive filename for each subsequent release.

## Automatic npm releases

`.github/workflows/coc.yml` publishes the head commit of every successful push to
`coc` in `obergodmar/coc-svelte-language-tools`. Pull requests and manual workflow
runs run checks without publishing. A push containing several commits produces
one release of its head commit.

The version is computed only in the CI checkout: keep the manifest at a stable
base `MAJOR.MINOR.PATCH`; the release patch is `PATCH + github.run_number`.
For example, base `0.2.0`, run 19 produces `0.2.19`. Reruns retain that version.
Do not reset the workflow run counter or reuse these versions for manual releases.
Bump the base minor/major when appropriate; no version-bump commits are generated.

CI stamps `gitHead` before building, tests the self-contained archive in Vim and
Neovim, and uploads it together with its SHA-512 metadata. The separate publish
job downloads this exact archive, validates its manifest/hash, and publishes with
provenance. Only this job receives `id-token: write`. It uses Node 24.21.0 and
npm's OIDC support; no `NPM_TOKEN` secret is needed.

Configure npm trusted publishing once (requires npm account 2FA):

```sh
npm trust github @obergodmar/coc-svelte-language-tools --file coc.yml --repo obergodmar/coc-svelte-language-tools --allow-publish --yes
```

The permission must allow direct publishing, not only staged publishing.
Publishing jobs queue without canceling older builds (GitHub permits up to 100
pending jobs in this group). Publication is serialized; newer versions use
`latest`, late older builds use `history` so they cannot roll users back.
A rerun skips publication only when the existing version's commit and archive
hash match. A conflicting version fails instead of overwriting anything.

After a failed publication, rerun the failed job with its original artifact.
Registry visibility is checked for up to 15 minutes after publishing because npm
can accept a release and process it asynchronously. If propagation exceeds the
verification timeout, inspect npm before retrying. `:CocUpdate` follows `latest`.
