{ pkgs, ... }:
{
  languages.javascript = {
    enable = true;
    package = pkgs.nodejs_24;
    pnpm = {
      enable = true;
      package = pkgs.callPackage ./nix/pnpm.nix { nodejs = pkgs.nodejs_24; };
    };
  };

  packages = [
    pkgs.git
    pkgs.neovim
    pkgs.nixfmt
    pkgs.gnutar
    pkgs.gzip
  ];

  scripts.coc-setup.exec = "pnpm install --frozen-lockfile";
  scripts.coc-build.exec = ''
    set -e
    pnpm --filter svelte2tsx build
    pnpm --filter @sveltejs/load-config build
    pnpm --filter svelte-language-server build
    pnpm --filter typescript-svelte-plugin build
    pnpm --filter coc-svelte-language-tools build
  '';
  scripts.coc-test.exec = "pnpm --filter coc-svelte-language-tools test";
  scripts.coc-test-setup.exec = "pnpm --filter coc-svelte-language-tools test:setup";
  scripts.coc-test-integration.exec = "pnpm --filter coc-svelte-language-tools test:integration";
  scripts.coc-pack.exec = "pnpm --filter coc-svelte-language-tools pack:release";
}
