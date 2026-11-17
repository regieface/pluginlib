#!/bin/sh
set -eu
CONTROLLER_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$CONTROLLER_ROOT"
export CLANG_MODULE_CACHE_PATH="$CONTROLLER_ROOT/.build/module-cache"
export SWIFTPM_MODULECACHE_OVERRIDE="$CONTROLLER_ROOT/.build/module-cache"
# Ne jamais remplacer le code signé d’un processus encore ouvert : TCC
# vérifierait alors deux identités différentes pour le même chemin.
if RUNNING=$(/usr/bin/pgrep -f "$CONTROLLER_ROOT/dist/PluginLib Controller.app/Contents/MacOS/PluginLibController" 2>&1); then
    printf '%s\n' "Quitter PluginLib Controller via Options → Quitter avant de reconstruire. Aucune application n’a été remplacée." >&2
    exit 1
else
    CHECK_STATUS=$?
    if [ "$CHECK_STATUS" -ne 1 ] || [ -n "$RUNNING" ]; then
        printf '%s\n' "Impossible de vérifier les processus ; compilation interrompue sans remplacer l’application." "$RUNNING" >&2
        exit 1
    fi
fi
swift build -c release --product PluginLibController --disable-sandbox
BIN_DIR=$(swift build -c release --show-bin-path --disable-sandbox)
APP="$CONTROLLER_ROOT/dist/PluginLib Controller.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/Profiles"
mkdir -p "$APP/Contents/Resources/Tools" "$APP/Contents/Resources/Metadata"
cp "$BIN_DIR/PluginLibController" "$APP/Contents/MacOS/PluginLibController"
cp "$CONTROLLER_ROOT/profile-manifest.json" "$APP/Contents/Resources/"
cp "$CONTROLLER_ROOT/Profiles/"*.json "$APP/Contents/Resources/Profiles/"
cp "$CONTROLLER_ROOT/tools/lp_project.py" "$CONTROLLER_ROOT/tools/prepare_lp_project.py" "$APP/Contents/Resources/Tools/"
cp "$CONTROLLER_ROOT/Metadata/waves-f6-au.json" "$APP/Contents/Resources/Metadata/"
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>fr.regieface.pluginlib.controller</string>
<key>CFBundleName</key><string>PluginLib Controller</string>
<key>CFBundleExecutable</key><string>PluginLibController</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>0.6.1</string>
<key>CFBundleVersion</key><string>9</string>
<key>LSMinimumSystemVersion</key><string>13.0</string>
<key>LSUIElement</key><true/>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST
# Signature locale, sans certificat ni réseau. Garder ce chemin stable pour TCC.
codesign --force --sign - --identifier fr.regieface.pluginlib.controller "$APP"
printf '\nApplication : %s\n' "$APP"
