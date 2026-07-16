#!/bin/zsh

set -euo pipefail

PROJECT_DIR="${0:A:h:h}"
SOURCE_APP="$PROJECT_DIR/src-tauri/target/release/bundle/macos/Mykdown.app"
DESTINATION_APP="/Applications/Mykdown.app"
STAGING_APP="/Applications/.Mykdown.app.installing"
BACKUP_APP="/Applications/.Mykdown.app.backup"

cd "$PROJECT_DIR"

if pgrep -x mykdown >/dev/null 2>&1; then
  echo "Feche o Mykdown antes de instalar uma nova versão."
  exit 1
fi

npm run tauri build -- --bundles app

rm -rf "$STAGING_APP"
ditto "$SOURCE_APP" "$STAGING_APP"
rm -rf "$BACKUP_APP"

if [[ -d "$DESTINATION_APP" ]]; then
  mv "$DESTINATION_APP" "$BACKUP_APP"
fi

if mv "$STAGING_APP" "$DESTINATION_APP"; then
  rm -rf "$BACKUP_APP"
else
  [[ -d "$BACKUP_APP" ]] && mv "$BACKUP_APP" "$DESTINATION_APP"
  exit 1
fi

echo "Mykdown instalado em $DESTINATION_APP"
open "$DESTINATION_APP"
