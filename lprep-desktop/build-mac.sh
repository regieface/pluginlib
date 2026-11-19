#!/bin/sh
set -eu

desktop_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_dir=$(dirname "$desktop_dir")
version=45.4.1
case "$(uname -s)/$(uname -m)" in
  Darwin/arm64) arch=arm64; sha=d080c3b05a01bd16137f2c12ab9ebf083c577757fe846844ba325bafa8e8bdf4 ;;
  Darwin/x86_64) arch=x64; sha=1c80d2ccf71b02c8fd9940fd09cafe88090a48c1bab0193c79b597b08d890e79 ;;
  *) echo 'La construction nécessite macOS.' >&2; exit 1 ;;
esac

archive="electron-v$version-darwin-$arch.zip"
tmp=$(mktemp -d "${TMPDIR:-/tmp}/lprep-build.XXXXXX")
trap 'rm -rf "$tmp"' EXIT
zip=${1:-"$tmp/$archive"}
if [ "$#" -eq 0 ]; then
  curl -fLSs --retry 2 -o "$zip" "https://github.com/electron/electron/releases/download/v$version/$archive"
fi
actual=$(shasum -a 256 "$zip" | awk '{print $1}')
if [ "$actual" != "$sha" ]; then
  echo 'Somme SHA-256 Electron incorrecte.' >&2
  exit 1
fi

dist="$desktop_dir/dist"
mkdir -p "$dist"
destination="$dist/L-Prep.app"
if [ -e "$destination" ]; then
  echo "Une application existe déjà dans $dist. Déplacez-la avant de reconstruire." >&2
  exit 1
fi

ditto -x -k "$zip" "$tmp"
bundle="$tmp/Electron.app"
plist="$bundle/Contents/Info.plist"
/usr/libexec/PlistBuddy -c 'Set :CFBundleIdentifier org.pluginlib.lprep' "$plist"
/usr/libexec/PlistBuddy -c 'Set :CFBundleName L-Prep' "$plist"
/usr/libexec/PlistBuddy -c 'Set :CFBundleDisplayName L-Prep' "$plist"
/usr/libexec/PlistBuddy -c 'Set :CFBundleShortVersionString 0.1.0' "$plist"
/usr/libexec/PlistBuddy -c 'Set :CFBundleVersion 0.1.0' "$plist"

resources="$bundle/Contents/Resources"
rm -f "$resources/default_app.asar"
app_dir="$resources/app"
mkdir -p "$app_dir/web/lprep"
cp "$desktop_dir"/main.cjs "$desktop_dir"/assets.cjs "$desktop_dir"/package.json "$app_dir/"
cp "$repo_dir"/lprep/*.mjs "$repo_dir"/lprep/index.html "$repo_dir"/lprep/styles.css "$repo_dir"/lprep/logo-lprep.png "$app_dir/web/lprep/"
sh "$repo_dir/scripts/with-dev-env.sh" node -e '
  const { dirname, join } = require("node:path");
  const { mkdirSync, copyFileSync } = require("node:fs");
  const [source, target, assetModule] = process.argv.slice(1);
  const { sharedModules, dataFiles } = require(assetModule);
  for (const filename of [...sharedModules, ...dataFiles]) {
    const destination = join(target, filename);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(join(source, filename), destination);
  }
' "$repo_dir" "$app_dir/web" "$desktop_dir/assets.cjs"

iconset="$tmp/L-Prep.iconset"
mkdir "$iconset"
for size in 16 32 128 256 512; do
  double=$((size * 2))
  for entry in "$size:$size:" "$size:$double:@2x"; do
    pixels=$(printf '%s' "$entry" | cut -d: -f2)
    suffix=$(printf '%s' "$entry" | cut -d: -f3)
    icon="$iconset/icon_${size}x${size}${suffix}.png"
    sips -z "$((pixels / 3))" "$pixels" "$repo_dir/lprep/logo-lprep.png" --out "$icon" >/dev/null
    sips --padToHeightWidth "$pixels" "$pixels" --padColor FFFFFF "$icon" >/dev/null 2>&1
  done
done
iconutil -c icns "$iconset" -o "$resources/electron.icns"
for nested in "$bundle"/Contents/Frameworks/*.framework "$bundle"/Contents/Frameworks/*.app; do
  codesign --force --deep --sign - "$nested"
done
codesign --force --sign - "$bundle"
codesign --verify --deep --strict "$bundle"
mv "$bundle" "$destination"
printf '%s\n' "$destination"
