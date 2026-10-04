# Maintaining the CoC fork

Upstream: `sveltejs/language-tools`. Fork: `obergodmar/coc-svelte-language-tools`.
Initial upstream base: `bf2993e1` (2026-09-29).

Keep `master` aligned with upstream and maintain the CoC patch series on `coc`.
The CoC package, Nix environment and its workflow are additive. Upstream release
workflows already restrict publishing to `sveltejs/language-tools`; the CoC
workflow only builds, tests and uploads artifacts.

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
devenv shell -- pnpm --filter coc-svelte-language-tools test:package
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
