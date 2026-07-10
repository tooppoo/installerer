#!/usr/bin/env bash
set -euo pipefail

# wf-cross-platform-build runs this on a bare checkout with no toolchain installed, so it provisions Bun itself before building.
target="$1"
out_dir="$2"

bun_version="$(cat .bun-version)"
curl -fsSL https://bun.sh/install | bash -s "bun-v${bun_version}"
export PATH="$HOME/.bun/bin:$PATH"

bun install --frozen-lockfile

mkdir -p "$out_dir"
bun build --compile --target="$target" --outfile="$out_dir/installerer" packages/cli/src/node/main.ts
chmod +x "$out_dir/installerer"

# Each matrix target runs on a runner matching its OS/arch, so the binary can be smoke-tested by executing it here; bun build --compile does not itself verify the binary runs.
"$out_dir/installerer" --version
