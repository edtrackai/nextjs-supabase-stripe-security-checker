# GitHub Action

Run the checker on every pull request. The action writes a job summary, adds file/line annotations, and keeps **one** PR comment up to date. A hidden marker means re-runs edit that comment instead of adding new ones. It fails the step when a finding is at or above `fail-on`.

## Example workflow

Save this as `.github/workflows/security-check.yml` in **your** repository. (It lives in `docs/` here, not in `.github/workflows/`, because it's an example for you to copy.)

```yaml
name: Security check
on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read        # check out the code
  pull-requests: write  # create/update the single PR comment (drop it if you set comment: false)

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: edtrackai/nextjs-supabase-stripe-security-checker@v0   # pin a tag or commit SHA
        with:
          path: .            # directory to scan
          fail-on: high      # critical | high | medium | low | none
          comment: true      # PR comment on pull_request events
          # github-token defaults to the workflow's GITHUB_TOKEN
```

The `@v0` tag doesn't exist until a release is published. Until then, pin a commit SHA from this repository.

## Inputs
| Input | Default | What it does |
|---|---|---|
| `path` | `.` | Directory to scan, relative to the repository root |
| `fail-on` | `high` | Fail the step if any finding is at or above this severity (`none` never fails) |
| `comment` | `true` | Create or update one PR comment (only on `pull_request` events) |
| `github-token` | `${{ github.token }}` | Used only to list, create and update that PR comment |

## Outputs
`findings`, `failing` (count at or above `fail-on`), and `comment-id`.

## Annotations limit
GitHub shows at most 10 error and 10 warning annotations per step inline. Larger scans still list every finding in the job summary and the PR comment.

## Several paths in one workflow
Each step's comment marker includes its `path`, so two steps scanning different folders keep two separate comments. Only comments by `github-actions[bot]` are ever edited.

## Permissions and privacy
- **Least privilege:** the action needs `contents: read`, plus `pull-requests: write` only if `comment: true`. It uses only the token you pass (the default `GITHUB_TOKEN`); no other secrets.
- **Network:** the scan itself runs locally on the runner with no network calls. Setup runs `npm ci` for the one dependency (`@babel/parser`). The PR comment step calls only the GitHub REST API (`GITHUB_API_URL`): list issue comments, then create or update one. There's no telemetry.
- **Redaction:** evidence snippets are passed through a redactor before they go into the comment or summary. It masks Stripe keys, webhook secrets, Supabase secret keys, JWTs, GitHub tokens, AWS key IDs and database URL passwords. Live Stripe keys are already redacted by the scanner.
- **Forks:** PRs from forks get a read-only `GITHUB_TOKEN`, so the comment can't be posted. The action logs a warning and still reports, and still fails on findings. Don't switch to `pull_request_target` just to comment, because that runs with write access on untrusted code.
- **No ads in CI:** the comment and job summary contain no promotional content, and the CLI's terminal footer is off in CI.
