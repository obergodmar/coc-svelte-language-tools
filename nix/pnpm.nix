{
  lib,
  stdenvNoCC,
  fetchurl,
  makeWrapper,
  nodejs,
}:
let
  manifest = builtins.fromJSON (builtins.readFile ../package.json);
  version = lib.removePrefix "pnpm@" manifest.packageManager;
in
stdenvNoCC.mkDerivation {
  pname = "pnpm";
  inherit version;
  src = fetchurl {
    url = "https://registry.npmjs.org/pnpm/-/pnpm-${version}.tgz";
    hash = "sha512-7nuT4MK9EUCcZCT5K4ZvMdPqG+9fvkfTx1AM3DyWaIM9LlVoGtZt9bZAxh+p3CXVRu+lTXbX+L9UsTYUrCk2MQ==";
  };
  nativeBuildInputs = [ makeWrapper ];
  dontBuild = true;
  installPhase = ''
    runHook preInstall
    mkdir -p "$out/lib/pnpm" "$out/bin"
    cp -r . "$out/lib/pnpm/"
    makeWrapper ${nodejs}/bin/node "$out/bin/pnpm" --add-flags "$out/lib/pnpm/bin/pnpm.cjs"
    makeWrapper ${nodejs}/bin/node "$out/bin/pnpx" --add-flags "$out/lib/pnpm/bin/pnpx.cjs"
    runHook postInstall
  '';
}
