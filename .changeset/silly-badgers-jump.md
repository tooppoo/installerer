---
"@installerer/web": minor
"@installerer/core": minor
"@philomagi/installerer": minor
---

Generated installer `--help` now documents every option and local execution example. The standard `curl | sh` install command (with `sh -s --` and review-first alternatives) is no longer in the generated installer's own `--help`; instead it's shown in the `installerer` generator CLI's `--help` and in the Web UI's copyable "Standard curl install" section, both built from the same shared core helper.
