# installerer CLI Exit Codes

See [docs/adr/20260703T132416Z_cli-exit-code-contract.md](adr/20260703T132416Z_cli-exit-code-contract.md) for the decision record.

| Exit Code | Cause                       |
| --------- | --------------------------- |
| 0         | success                     |
| 1         | unknown command             |
| 2         | unknown option              |
| 3         | config file already exists  |
| 4         | config file write failed    |
| 5         | config validation failed    |
| 6         | invalid config syntax       |
| 7         | config file read failed     |
| 8         | invalid validate arguments  |
| 9         | invalid generate arguments  |
| 10        | output file write failed    |
| 11        | installer generation failed |
