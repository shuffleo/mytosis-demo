# Cloudflare Workers deployment

This Vite SPA deploys as Cloudflare Workers Static Assets, not Pages.

- Worker/project name: `mytosis`
- Build output: `dist/`
- SPA fallback: `assets.not_found_handling = "single-page-application"`
- Production: pushes to the repository's default branch, plus manual dispatch
- Pull requests: Workers Previews named `pr-<number>` for same-repository PRs
- Preview URLs are public unless Cloudflare Access is configured separately

## One-time setup

No credentials belong in source control or chat. Add these GitHub Actions secrets:

```bash
gh secret set CLOUDFLARE_API_TOKEN --repo shuffleo/mytosis-demo
gh secret set CLOUDFLARE_ACCOUNT_ID --repo shuffleo/mytosis-demo
```

For the first deployment, creating `mytosis` requires an account-owned API
token with the Workers product **Admin** role, scoped only to the target
Cloudflare account. After `mytosis` exists, rotate the secret to a token with
the per-Worker **Editor** role scoped only to `mytosis`. No zone or Workers
Routes permission is needed unless a custom domain or route is added later.

Worker names are account-scoped. Before the first deployment, authenticate
locally and confirm that `mytosis` does not identify an unrelated Worker:

```bash
npx wrangler login
npx wrangler deployments list --name mytosis
```

Then run the **Deploy mytosis** workflow manually once. Later pushes to the
default branch deploy automatically. With secrets absent, workflows still
build and dry-run safely, then report that remote deployment was skipped.

## Local validation

```bash
npm ci
npm run build
npm run deploy:dry-run
```

Wrangler is pinned in `devDependencies`; use the project-local version through
`npm`/`npx`.

## Rollback

List recent deployments and roll back to a known-good version:

```bash
npx wrangler deployments list --name mytosis
npx wrangler rollback <VERSION_ID> --name mytosis \
  --message "Rollback to known-good deployment"
```

Alternatively, select a version from **Workers & Pages → mytosis →
Deployments** in the Cloudflare dashboard. A rollback immediately sends 100%
of traffic to that version. It does not roll back or restore connected
resource data.

For a source-level rollback, revert the offending Git commit and push the
revert to the default branch; the production workflow will publish it as a new
Worker version.
