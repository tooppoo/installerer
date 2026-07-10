# Installed Binary Permission Mode

- Status: Accepted
- Created: 2026-07-10T17:56:12Z

## Context

The generated installer places the downloaded binary at `$INSTALL_DIR/$BINARY_NAME` via a `cp` / `chmod` / `mv` sequence on a temporary file (see [Binary Placement](../generated-installer-runtime.md#binary-placement)).

An earlier version of this sequence ran `chmod +x` on the temporary file. `+x` only adds the executable bit on top of whatever mode the file already had; it does not set a complete mode. The resulting final mode therefore depended on factors outside the generator's control: the `cp` implementation's mode-preservation behavior, the source file's mode inside the extracted archive, the archive format's stored metadata (tar/zip entries can carry arbitrary mode bits, including setuid/setgid/sticky bits or group/world-write bits), and the invoking shell's `umask`. Two users running the same installer on different systems could end up with different final permissions on the same binary, and a maliciously or carelessly built archive could smuggle excess permission bits (for example group-write) through to the installed file (issue #38).

`installerer` targets two overlapping deployment shapes: a personal CLI installed into `$HOME/.local/bin` and a shared install into a multi-user location such as `/usr/local/bin`. Both need the installed binary to be predictably executable by everyone who can read it, without depending on environment state.

## Decision

The generated installer must set the installed binary's mode to an explicit, fixed value of `0755` (`rwxr-xr-x`), rather than deriving it from `+x`, the source file's mode, or `cp`'s mode-preservation behavior.

`mktemp` creates the temporary file with mode `0600`. The installer then runs `chmod -- 755 "$install_tmp"` before `mv`, so the final mode is always `0755` regardless of the extracted archive entry's stored mode, the invoking shell's `umask`, or the specific `cp` implementation's mode-preservation behavior. This is implemented in [`installTmpFile.ts`](../../packages/core/src/generatedInstaller/sections/installTmpFile.ts).

Because `chmod 755` sets an exact mode rather than adding bits, it also strips any excess permission bits an archive entry might carry (setuid/setgid/sticky, group-write, world-write), satisfying the "no excess permission from archive metadata" requirement independently of whatever `cp` does with the source mode.

`0755` is chosen as the standard mode for an installed, publicly-readable CLI binary: the owner can read/write/execute, and everyone else who can traverse `$INSTALL_DIR` can read and execute but not modify the binary. This matches common installer conventions and works unmodified for both the personal (`$HOME/.local/bin`) and shared (`/usr/local/bin`) install targets this project supports.

## Alternatives Considered

### Keep `chmod +x`

Rejected as the status quo problem: the final mode is environment-dependent, which fails the "mode does not depend on environment" acceptance criterion and can silently carry over unintended bits from archive metadata.

### `0750` (owner + group only, no world access)

More conservative for a `/usr/local/bin`-style shared install where non-group users should not be able to execute the binary. Rejected as the default because it would silently break the common personal-install case (`$HOME/.local/bin` with a default umask, single-user machine) where the "group" concept is not meaningful, and because `installerer` has no per-install configuration surface today for choosing a different mode per deployment shape. If a future config option adds this control, it must document the mode explicitly, per this ADR's own requirement below.

## Consequences

### Positive Consequences

- The installed binary's mode is identical across platforms, `cp` implementations, and invoking-shell `umask` settings.
- Archive metadata can no longer smuggle excess permission bits into the installed binary.
- The mode is documented and traceable to a single line of generated code.

### Negative Consequences

- Installers cannot currently opt into a more restrictive mode (such as `0750`) for shared, multi-user install targets that want to exclude non-group users. Adding that as a generator config option is out of scope for this ADR.

### Neutral Consequences

- `0755` was already the de facto behavior on most common combinations of OS, `cp`, and default `umask`; this decision makes it explicit and env-independent rather than changing typical observed behavior.
