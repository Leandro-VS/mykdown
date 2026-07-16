#!/bin/zsh

set -euo pipefail

PROJECT_DIR="${0:A:h:h}"
cd "$PROJECT_DIR"

npm run format:check
npm run lint
npm test
cargo test --offline --manifest-path src-tauri/Cargo.toml
npm run tauri build -- --bundles app
codesign --verify --deep --strict src-tauri/target/release/bundle/macos/Mykdown.app
plutil -lint src-tauri/target/release/bundle/macos/Mykdown.app/Contents/Info.plist

echo "Release check concluído. Execute agora docs/SMOKE_TEST.md."
