# installerer CLI Exit Codes

See [docs/adr/20260703T132416Z_cli-exit-code-contract.md](adr/20260703T132416Z_cli-exit-code-contract.md) for the decision record.

| Exit Code | Cause                      |
| --------- | -------------------------- |
| 0         | success                    |
| 1         | unknown command            |
| 2         | unknown option             |
| 3         | config file already exists |
| 4         | config file write failed   |
