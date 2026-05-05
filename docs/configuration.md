# Project Configuration

Assembler can read project-level configuration from one of these files in the project root:

- `assembler.config.json`
- `assembler.config.ts`
- `assembler.config.js`
- `assembler.config.mjs`
- `assembler.config.cjs`

Run `assembler init` to create a detected `assembler.config.json`, then edit it when the scan heuristics need a nudge.

```json
{
  "$schema": "https://assembler.dev/schemas/assembler.config.schema.json",
  "framework": "static",
  "target": "cloudflare-pages",
  "build": {
    "command": "pnpm build",
    "outputDirectory": "dist",
    "nodeVersion": "20.x"
  },
  "env": {
    "DATABASE_URL": {
      "provider": "neon",
      "required": true,
      "autoProvision": true
    }
  },
  "providers": {
    "sentry": false,
    "neon": true
  }
}
```

Use `assembler config show` to print the normalized config Assembler will use.

TypeScript config supports the common `export default defineConfig({ ... })` shape. JavaScript config files can export the object directly.

## Supported Fields

- `framework`: overrides framework detection. Supported values are `nextjs`, `remix`, `astro`, `static`, `node`, and `unknown`.
- `target`: sets the default deployment target for `assembler plan` and `assembler launch`. CLI flags such as `--target cloudflare-pages` still take precedence.
- `build.command`: overrides the detected build command sent to the deployment target.
- `build.outputDirectory`: overrides the output directory sent to the deployment target.
- `build.nodeVersion`: passes a Node.js version hint to the deployment target.
- `env`: adds or adjusts required environment variables. Set `required` to `false` to remove a variable discovered from `.env.example`.
- `providers`: enables or disables provider flows. A value of `false` removes that provider from detected providers and clears it from env requirements.

The JSON schema lives at [`assembler.config.schema.json`](../assembler.config.schema.json).
