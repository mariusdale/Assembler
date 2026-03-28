# Test Fixtures

Projects in this directory are used for testing `devassemble launch` end-to-end.

## Usage

Since these fixtures live inside the DevAssemble git repo, the scanner will detect
the parent repo's git remote. To test the "create new repo" path, copy the fixture
to a temporary directory outside this repo first:

```bash
TMPDIR=$(mktemp -d)
cp -r test-fixtures/sample-nextjs-app "$TMPDIR/sample-nextjs-app"
cd "$TMPDIR/sample-nextjs-app"
devassemble launch
```

## sample-nextjs-app

Minimal Next.js 15 app with:
- `app/page.tsx` — single page that shows whether DATABASE_URL is configured
- `.env.example` — declares `DATABASE_URL` so the scanner detects Neon
- No git remote (when copied outside this repo)

The scanner should detect: Next.js framework, Neon provider (from DATABASE_URL),
Vercel hosting (from Next.js dependency).
