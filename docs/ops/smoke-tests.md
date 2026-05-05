# Smoke Tests

Use these checks before a beta tag, npm publish, live demo, or onboarding wave. Run them from outside this repository unless the step explicitly references a fixture.

## Packaged CLI

```bash
pnpm build
pnpm bundle
npm pack ./apps/cli --pack-destination /tmp
npm install -g /tmp/mariusdale-assembler-*.tgz
assembler --version
assembler --help
```

Expected result: the installed CLI reports the package version and shows the public command surface.

## Next.js Plan

Use a throwaway app with a committed lockfile.

```bash
npx create-next-app@latest assembler-next-smoke --ts --eslint --app --src-dir --import-alias "@/*"
cd assembler-next-smoke
git init
git add .
git commit -m "Initial smoke app"
assembler doctor
assembler plan
```

Expected result: doctor reports project readiness, and the plan includes GitHub, Vercel, and any detected provider tasks.

## Astro Plan

Use the repo fixture for a fast static Astro check:

```bash
cd tests/fixtures/astro/sample-app
assembler plan
```

Expected result: the plan detects Astro and creates a Vercel static deploy path with `dist` output.

For SSR mode, copy the fixture to a temporary directory and add `output: 'server'` to `astro.config.mjs`, then run `assembler plan`.

Expected result: the plan emits an Astro `ssr-node` deploy intent.

## Static Site Plan

No-build static site:

```bash
tmpdir="$(mktemp -d)"
printf '<h1>Assembler static smoke</h1>\n' > "$tmpdir/index.html"
cd "$tmpdir"
assembler plan
```

Expected result: the plan detects a static site and uses root output `.`.

Package-based static site:

```bash
tmpdir="$(mktemp -d)"
cd "$tmpdir"
printf '{"name":"static-smoke","scripts":{"build":"mkdir -p dist && cp index.html dist/index.html"}}\n' > package.json
printf '<h1>Assembler build smoke</h1>\n' > index.html
mkdir -p dist
cp index.html dist/index.html
assembler plan
```

Expected result: the plan detects a static site with build output `dist`.

## Cloudflare Pages Target

Use a no-build static site and select Cloudflare Pages explicitly:

```bash
tmpdir="$(mktemp -d)"
printf '<h1>Assembler Pages smoke</h1>\n' > "$tmpdir/index.html"
cd "$tmpdir"
assembler plan --target cloudflare-pages
```

Expected result: the plan contains `cloudflare-pages-create-project`, `cloudflare-pages-trigger-deployment`, `cloudflare-pages-wait-for-ready`, and `cloudflare-pages-health-check`, and does not contain Vercel deploy tasks.

## Config Commands

```bash
tmpdir="$(mktemp -d)"
printf '<h1>Assembler config smoke</h1>\n' > "$tmpdir/index.html"
cd "$tmpdir"
assembler init
assembler config show
assembler doctor
```

Expected result: `assembler.config.json` is created, `config show` prints normalized config, and doctor reports the config as valid.
