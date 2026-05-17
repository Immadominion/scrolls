# @scrolls/cli

The `scrolls` command. Publish [Scrolls](https://scrolls.wal.app) forms from YAML, list submissions, and export to CSV — all from your terminal.

```
✦ scrolls · walrus-native forms
```

## Install

```bash
npm install -g @scrolls/cli
# or one-shot
npx -y @scrolls/cli --help
```

## First run

```bash
scrolls init                    # interactive: pick network, paste Sui key
scrolls create bug-report.yaml  # publish a form
scrolls list                    # show your forms
scrolls export <formId> --out responses.csv
```

## Example spec

```yaml
# bug-report.yaml
title: Bug report
description: Help us squash it.
settings:
    isPrivate: false
    allowAnonymous: true
fields:
    - { type: short_text, label: Title, required: true }
    - { type: long_text,  label: What happened?, required: true }
    - { type: dropdown,   label: Severity, options: [low, medium, high, critical] }
```

```bash
scrolls create bug-report.yaml --json
```

## Commands

| Command | What it does |
| --- | --- |
| `scrolls init` | Interactive config wizard |
| `scrolls create <spec>` | Publish a form |
| `scrolls list` | List your forms |
| `scrolls get <formId>` | Print a form's config |
| `scrolls submissions <formId>` | List submissions (`--key` to decrypt) |
| `scrolls export <formId>` | CSV dump |
| `scrolls submit <formId> <file>` | Submit a response |

Every command accepts `--network`, `--private-key`, `--publisher`, `--aggregator`, `--rpc`, `--pkg`, `--epochs`, `--app-url`, `--json`.

## Full documentation

See [docs/PROGRAMMATIC.md](https://github.com/Immadominion/scrolls/blob/main/docs/PROGRAMMATIC.md).

## License

MIT.
