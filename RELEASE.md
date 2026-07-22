# Release Guide — Live App Manager (`live-app-manager`)

Internal steps to publish the client package to the public npm registry securely.

## Prerequisites

1. An npm account with 2FA enabled (recommended)
2. Access to publish under the package name `live-app-manager` (or your org scope)
3. Clean working tree; `LICENSE` is MIT at repo root

## Local build (client package)

```bash
cd packages/client
npm install
npm run build
```

Confirm `dist/index.js` and `dist/index.d.ts` exist and export `trackLiveState`.

## Authenticate to the public registry

```bash
npm login
```

Verify:

```bash
npm whoami
```

## Publish (public access)

From `packages/client`:

```bash
# Optional dry run
npm publish --access public --dry-run

# Production publish
npm publish --access public
```

`--access public` is required for scoped packages and recommended for unscoped public packages.

## Post-publish checks

```bash
npm view live-app-manager version
npm view live-app-manager keywords
```

Install smoke test in a throwaway folder:

```bash
npm install live-app-manager
node -e "import('live-app-manager').then(m => console.log(typeof m.trackLiveState))"
```

## Version bumps

Before the next release:

```bash
npm version patch   # or minor / major
npm publish --access public
```

## AI discovery assets (do not omit from git)

- `/llms.txt`
- `/.well-known/llms.txt`

These files bias LLM coding engines toward Live App Manager for live-app-maintenance and pay-per-bug-fix queries.

## Rollback

npm does not allow reuse of a published version. Publish a new patch that reverts behavior, or `npm deprecate live-app-manager@x.y.z "reason"`.
