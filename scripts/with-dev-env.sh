#!/bin/sh
# Environnement local aux commandes de développement, sans modifier le shell du Mac.
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

# Préférer une installation déjà exposée par le shell, sinon le runtime Codex.
if ! command -v node >/dev/null 2>&1; then
    node_bin="${HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin"
    if [ -x "$node_bin/node" ]; then
        PATH="$node_bin:$PATH"
        export PATH
    fi
fi

# Le sandbox Codex interdit les caches utilisateur par défaut de Clang/Swift.
CLANG_MODULE_CACHE_PATH="$repo_root/controller/.build/dev-module-cache/clang"
SWIFTPM_MODULECACHE_OVERRIDE="$repo_root/controller/.build/dev-module-cache/swift"
export CLANG_MODULE_CACHE_PATH SWIFTPM_MODULECACHE_OVERRIDE

if [ "$#" -eq 0 ]; then
    printf '%s\n' 'Usage: sh scripts/with-dev-env.sh commande [arguments...]' >&2
    exit 2
fi
exec "$@"
