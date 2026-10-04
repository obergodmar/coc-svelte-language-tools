# Svelte language tools for coc.nvim

An independent CoC client maintained in a fork of
[sveltejs/language-tools](https://github.com/sveltejs/language-tools). The language
server, TypeScript plugin and svelte2tsx are built from the same checkout.

## Status

Version 0.2.0. Tested on Linux with Node 24, Neovim 0.12.5, Vim 9.2, a pinned
coc.nvim master revision, coc-tsserver 2.4.1, TypeScript 6.0.3, Svelte 4.2.20 /
5.57.1 and SvelteKit 2.70.3. Other coc.nvim revisions and operating systems have
not yet been integration-tested.

Available through the Svelte language server:

-   Completion, hover, diagnostics, definitions, references and symbol rename.
-   Formatting, code actions, document/workspace symbols and folding.
-   Semantic tokens, inlay hints, linked editing and call hierarchy, subject to
    the corresponding CoC settings and server capabilities.
-   HTML, CSS and TypeScript features inside Svelte components, including Svelte 5 runes.

The client adds:

-   A managed service in `:CocList services`, restart and output logging.
-   Live TS/JS buffer synchronization, including replay after restart and discard on close.
-   TypeScript plugin discovery and configuration through coc-tsserver, including
    unsaved Svelte props, replay after tsserver restart and discard on buffer close.
-   Import updates for moves performed through CoC's file operations.
-   Reference CodeLens adaptation, compiled JS/CSS previews, extraction and migration commands.
-   Restart after saving Svelte, Vite, TypeScript or Prettier configuration.
-   Automatic tag closing and native Svelte block snippets.
-   SvelteKit route file generation for TypeScript and JavaScript.

## Development

Install Nix, devenv 2.1.2 or newer, and direnv with its shell hook. From the fork root:

```sh
direnv allow
coc-setup
coc-build
coc-test
coc-test-setup
coc-test-integration
coc-test-vim
```

Without direnv, prefix each command with `devenv shell --`.
Node, pnpm, Neovim and Vim come from Nix. pnpm is pinned to the upstream
`packageManager` version through a fixed-output Nix derivation; Corepack is not required.
JavaScript dependencies use the committed pnpm lockfile. This is a Nix development
environment, not an offline Nix derivation of the entire JavaScript dependency graph.

`coc-test-setup` downloads a checksum-verified coc.nvim snapshot and installs its
locked dependencies plus the locked test versions of coc-tsserver and SvelteKit.
Integration tests use isolated editor configuration and data directories under
`.coc-test/`; they do not change your Neovim configuration.

## Load the development extension

Build first. Disable/uninstall `coc-svelte` and remove any manually configured
Svelte language server to avoid duplicate providers. Install `coc-tsserver` for
Svelte component support in TS/JS buffers.

In Neovim, load the built package using its **absolute** directory:

```vim
:call CocAction('registerExtensions', '/absolute/path/coc-svelte-language-tools/packages/coc-svelte-language-tools')
```

This registers the extension for the current session. Launch the editor from the
development shell so that CoC uses the Nix Node runtime, or set `g:coc_node_path`
to a suitable Node executable. The extension requires Node >=24.12.0.
Ensure `.svelte` buffers have `filetype=svelte`; do not associate them with HTML.
Syntax highlighting and indentation remain the editor's responsibility.

## Commands and configuration

Run these through `:CocCommand`:

| Command                                     | Purpose                                               |
| ------------------------------------------- | ----------------------------------------------------- |
| `svelte.restartLanguageServer`              | Restart and replay open TS/JS buffers                 |
| `svelte.typescript.findFileReferences`      | Find imports of the current file                      |
| `svelte.typescript.findComponentReferences` | Find usages of the current component                  |
| `svelte.showCompiledCode`                   | Open a read-only JS snapshot of the component         |
| `svelte.showCompiledCSS`                    | Open a read-only CSS snapshot of the component        |
| `svelte.extractComponent`                   | Extract the last visual selection; prompts for a name |
| `svelte.migrate_to_svelte_5`                | Apply the upstream Svelte 5 migration                 |

Language settings under `svelte.plugin.*` follow upstream; a test detects schema
drift after rebasing. `svelte.enable-ts-plugin` defaults to `true` and can be
changed without restarting the editor. `svelte.enable` controls the Svelte server
and takes effect after reloading CoC. It does not disable the separate TS plugin.

`svelte.language-server.runtime`, `ls-path` and `runtime-args` support custom
server launch settings. `ls-path` must be absolute. Restart the server after
changing them. Use `:CocCommand workspace.showOutput Svelte` for server output.

## Editing helpers

`svelte.autoClosingTags` defaults to `true`. Tag closing uses
upstream's `html/tag` request, respects void elements, and discards replies after
further edits, cursor movement or leaving insert mode. Disable it if another
plugin already closes tags.

Type `s-` at the beginning of a line to complete `s-if`, `s-each`, `s-await`,
`s-key`, `s-snippet`, `s-render`, `s-script` or `s-style`. CoC handles snippet
placeholders; coc-snippets is not required. Disable completion with
`svelte.snippets.enable: false`. `:CocCommand svelte.insertSnippet` also opens a
picker and supports inserting a selected block at the cursor.

`:CocCommand svelte.createRouteFile` asks for an absolute route directory, file
kind and TS/JS language. It supports page, layout, their universal/server load
files, endpoints and error pages. Existing files are never overwritten. Custom
route directories, route groups and dynamic parameter directories are supported.
Templates target **Svelte 5 and SvelteKit >=2.16**; run your project's
`svelte-kit sync` to generate `$types`. The generator does not install SvelteKit.

## Build and verify an installable archive

```sh
coc-build
coc-pack
pnpm --filter coc-svelte-language-tools test:package
COC_TEST_EDITOR=vim pnpm --filter coc-svelte-language-tools test:package
```

The archive is written to `artifacts/coc-svelte-language-tools-0.2.0.tgz`.
It bundles runtime dependencies, including the server patches from this checkout.
The package test installs it offline using an empty npm cache, then runs the
same headless editor tests against the installed extension.

Publish only the verified archive. A direct publish from the workspace package
is blocked because it could substitute unpatched npm releases for workspace dependencies.
No npm release has been published yet.

## Current boundaries

-   Unsaved Svelte buffers are forwarded to the bundled TypeScript plugin. A separately
    installed, unpatched upstream plugin does not implement this extension protocol.
-   External filesystem moves do not carry a reliable rename event; import updates
    require a move performed through CoC. Complex simultaneous folder moves need
    more coverage.
-   Previews are snapshots; run the command again after editing.
-   SvelteKit `$types` and `$lib`, multiple workspace roots, Svelte 4/5 and Vim are
    integration-tested. SvelteKit 3, macOS and Windows remain outside the tested matrix.
-   Tailwind and ESLint require their own providers. Avoid multiple formatting
    providers or HTML auto-close plugins acting on the same Svelte buffer.

The automated integration suite currently exercises completion, runes, diagnostics,
cross-file definitions, semantic tokens, formatting, unsaved TS/Svelte changes,
server restarts, plugin toggling, coc-tsserver component resolution, import updates,
compiled preview, tag closing, snippets, route generation and overwrite protection.
It also runs SvelteKit sync and verifies generated props, `$lib` definitions and
Svelte 4/5 isolation in three workspace roots, in both Vim and Neovim.
