# Svelte language tools for coc.nvim

An independent CoC client maintained in a fork of
[sveltejs/language-tools](https://github.com/sveltejs/language-tools). The language
server, TypeScript plugin and svelte2tsx are built from the same checkout.

## Status

Initial implementation, version 0.1.0. Tested with Node 24, Neovim, a pinned
coc.nvim master revision, coc-tsserver 2.4.1, TypeScript 6.0.3 and Svelte 5.57.1.
Vim and other coc.nvim revisions have not yet been integration-tested.

Available through the Svelte language server:

-   Completion, hover, diagnostics, definitions, references and symbol rename.
-   Formatting, code actions, document/workspace symbols and folding.
-   Semantic tokens, inlay hints, linked editing and call hierarchy, subject to
    the corresponding CoC settings and server capabilities.
-   HTML, CSS and TypeScript features inside Svelte components, including Svelte 5 runes.

The client adds:

-   A managed service in `:CocList services`, restart and output logging.
-   Live TS/JS buffer synchronization, including replay after restart and discard on close.
-   TypeScript plugin discovery and configuration through coc-tsserver.
-   Import updates for moves performed through CoC's file operations.
-   Reference CodeLens adaptation, compiled JS/CSS previews, extraction and migration commands.
-   Restart after saving Svelte, Vite, TypeScript or Prettier configuration.

## Development

Install Nix, devenv 2.1.2 or newer, and direnv with its shell hook. From the fork root:

```sh
direnv allow
coc-setup
coc-build
coc-test
coc-test-setup
coc-test-integration
```

Without direnv, prefix each command with `devenv shell --`.
Node, pnpm and Neovim come from Nix. pnpm is pinned to the upstream
`packageManager` version through a fixed-output Nix derivation; Corepack is not required.
JavaScript dependencies use the committed pnpm lockfile. This is a Nix development
environment, not an offline Nix derivation of the entire JavaScript dependency graph.

`coc-test-setup` downloads a checksum-verified coc.nvim snapshot and installs its
locked dependencies plus the locked test version of coc-tsserver.
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

## Build and verify an installable archive

```sh
coc-build
coc-pack
pnpm --filter coc-svelte-language-tools test:package
```

The archive is written to `artifacts/coc-svelte-language-tools-0.1.0.tgz`.
It bundles runtime dependencies, including the server patches from this checkout.
The package test installs it offline using an empty npm cache, then runs the
same headless editor tests against the installed extension.

Publish only the verified archive. A direct publish from the workspace package
is blocked because it could substitute unpatched npm releases for workspace dependencies.
No npm release has been published yet.

## Current boundaries

-   Changes in unsaved Svelte components are visible to the Svelte server; upstream's
    separate TypeScript plugin still reads components from disk. Save the component
    before expecting TS/JS diagnostics to reflect its changed interface.
-   External filesystem moves do not carry a reliable rename event; import updates
    require a move performed through CoC. Complex simultaneous folder moves need
    more coverage.
-   Previews are snapshots; run the command again after editing.
-   Automatic tag insertion, SvelteKit route scaffolding and editor-specific snippets
    are not implemented yet. Linked editing is available through LSP.
-   SvelteKit language behavior is inherited from upstream. Dedicated SvelteKit,
    multi-root, Vim, macOS and Windows integration matrices remain follow-up work.
-   Tailwind and ESLint require their own providers. Avoid multiple formatting
    providers or HTML auto-close plugins acting on the same Svelte buffer.

The automated integration suite currently exercises completion, runes, diagnostics,
cross-file definitions, semantic tokens, formatting, unsaved TS changes, restart,
coc-tsserver component resolution, import updates and compiled preview.
