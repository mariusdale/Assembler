import { access, readFile, readdir } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

import type {
  DetectedProvider,
  EnvVarRequirement,
  LockfileCheck,
  PackageManager,
  ProjectFramework,
  ProjectScan,
} from '@assembler/types';

const execFile = promisify(execFileCallback);

const ENV_EXAMPLE_FILENAMES = [
  '.env.example',
  '.env.local.example',
  '.env.template',
  '.env.sample',
] as const;

const DATABASE_ENV_VARS = new Set(['DATABASE_URL', 'DIRECT_DATABASE_URL']);

export async function scanProject(directory: string): Promise<ProjectScan> {
  const projectDirectory = resolve(directory);
  const packageJson = await readPackageJson(projectDirectory);
  const packageName = getPackageName(packageJson) ?? basename(projectDirectory);
  const framework = detectFramework(packageJson);
  const [gitRemoteUrl, requiredEnvVars, detectedProviders, lockfileCheck] = await Promise.all([
    getGitRemoteUrl(projectDirectory),
    collectEnvRequirements(projectDirectory),
    detectProviders(projectDirectory, packageJson),
    checkLockfileSync(projectDirectory, packageJson),
  ]);

  mergeEnvVarProvidersIntoDetectedProviders(requiredEnvVars, detectedProviders);

  return {
    name: packageName,
    framework,
    directory: projectDirectory,
    hasGitRemote: typeof gitRemoteUrl === 'string' && gitRemoteUrl.length > 0,
    ...(gitRemoteUrl ? { gitRemoteUrl } : {}),
    detectedProviders: sortDetectedProviders(detectedProviders),
    requiredEnvVars: requiredEnvVars.sort((left, right) => left.name.localeCompare(right.name)),
    packageJson,
    lockfileCheck,
  };
}

async function readPackageJson(directory: string): Promise<Record<string, unknown>> {
  const raw = await readFile(join(directory, 'package.json'), 'utf8');
  return JSON.parse(raw) as Record<string, unknown>;
}

function getPackageName(packageJson: Record<string, unknown>): string | undefined {
  const value = packageJson.name;
  return typeof value === 'string' && value.trim() !== '' ? sanitizeProjectName(value) : undefined;
}

function sanitizeProjectName(value: string): string {
  return value.replace(/^@[^/]+\//, '').trim();
}

function detectFramework(packageJson: Record<string, unknown>): ProjectFramework {
  const dependencies = getDependencyMap(packageJson);

  if (dependencies.has('next')) {
    return 'nextjs';
  }
  if (dependencies.has('@remix-run/node') || dependencies.has('@remix-run/react')) {
    return 'remix';
  }
  if (dependencies.has('astro')) {
    return 'astro';
  }
  if (dependencies.size > 0) {
    return 'node';
  }

  return 'unknown';
}

async function getGitRemoteUrl(directory: string): Promise<string | undefined> {
  try {
    const result = await execFile('git', ['config', '--get', 'remote.origin.url'], {
      cwd: directory,
    });
    const remoteUrl = result.stdout.trim();
    return remoteUrl === '' ? undefined : remoteUrl;
  } catch {
    return undefined;
  }
}

async function collectEnvRequirements(directory: string): Promise<EnvVarRequirement[]> {
  const files = await Promise.all(
    ENV_EXAMPLE_FILENAMES.map(async (filename) => {
      const filepath = join(directory, filename);
      try {
        await access(filepath);
        return {
          filename,
          content: await readFile(filepath, 'utf8'),
        };
      } catch {
        return undefined;
      }
    }),
  );

  const requirements = new Map<string, EnvVarRequirement>();

  for (const file of files) {
    if (!file) {
      continue;
    }

    for (const envVar of parseEnvVarNames(file.content)) {
      const provider = inferProviderFromEnvVar(envVar);
      requirements.set(envVar, {
        name: envVar,
        ...(provider ? { provider } : {}),
        source: file.filename,
        isAutoProvisionable: isAutoProvisionableEnvVar(envVar),
      });
    }
  }

  return [...requirements.values()];
}

function parseEnvVarNames(source: string): string[] {
  const names = new Set<string>();

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }

    const match = /^(?:export\s+)?([A-Z][A-Z0-9_]+)\s*=/.exec(line);
    if (match?.[1]) {
      names.add(match[1]);
    }
  }

  return [...names];
}

async function detectProviders(
  directory: string,
  packageJson: Record<string, unknown>,
): Promise<Map<string, DetectedProvider>> {
  const providers = new Map<string, DetectedProvider>();
  const dependencies = getDependencyMap(packageJson);
  const packageEvidence = new Map<string, string[]>();

  if (dependencies.has('next')) {
    addProviderEvidence(providers, 'vercel', 'high', 'package.json: dependency next');
  }
  if (
    dependencies.has('@neondatabase/serverless') ||
    dependencies.has('drizzle-orm') ||
    dependencies.has('prisma') ||
    dependencies.has('@prisma/client') ||
    dependencies.has('pg')
  ) {
    packageEvidence.set('neon', [
      ...collectMatchingDependencies(dependencies, [
        '@neondatabase/serverless',
        'drizzle-orm',
        'prisma',
        '@prisma/client',
        'pg',
      ]),
    ]);
  }
  if (dependencies.has('@clerk/nextjs')) {
    packageEvidence.set('clerk', ['package.json: dependency @clerk/nextjs']);
  }
  if (dependencies.has('stripe')) {
    packageEvidence.set('stripe', ['package.json: dependency stripe']);
  }
  if (dependencies.has('resend')) {
    packageEvidence.set('resend', ['package.json: dependency resend']);
  }
  if (dependencies.has('@sentry/nextjs') || dependencies.has('@sentry/node')) {
    packageEvidence.set(
      'sentry',
      collectMatchingDependencies(dependencies, ['@sentry/nextjs', '@sentry/node']),
    );
  }
  if (dependencies.has('posthog-js') || dependencies.has('posthog-node')) {
    packageEvidence.set(
      'posthog',
      collectMatchingDependencies(dependencies, ['posthog-js', 'posthog-node']),
    );
  }

  for (const [provider, evidence] of packageEvidence.entries()) {
    for (const entry of evidence) {
      addProviderEvidence(providers, provider, 'medium', entry);
    }
  }

  const fileChecks = await Promise.all([
    maybeExists(directory, 'drizzle.config.ts'),
    maybeExists(directory, 'prisma/schema.prisma'),
    maybeExists(directory, 'app/api/webhooks/stripe/route.ts'),
    maybeExists(directory, 'middleware.ts'),
    maybeExists(directory, 'sentry.client.config.ts'),
    maybeExists(directory, 'sentry.server.config.ts'),
  ]);

  if (fileChecks[0]) {
    addProviderEvidence(providers, 'neon', 'high', 'drizzle.config.ts');
  }
  if (fileChecks[1]) {
    addProviderEvidence(providers, 'neon', 'high', 'prisma/schema.prisma');
  }
  if (fileChecks[2]) {
    addProviderEvidence(providers, 'stripe', 'high', 'app/api/webhooks/stripe/route.ts');
  }
  if (fileChecks[3] && dependencies.has('@clerk/nextjs')) {
    addProviderEvidence(providers, 'clerk', 'high', 'middleware.ts');
  }
  if (fileChecks[4] || fileChecks[5]) {
    addProviderEvidence(
      providers,
      'sentry',
      'high',
      fileChecks[4] ? 'sentry.client.config.ts' : 'sentry.server.config.ts',
    );
  }

  return providers;
}

async function maybeExists(directory: string, relativePath: string): Promise<boolean> {
  try {
    await access(join(directory, relativePath));
    return true;
  } catch {
    return false;
  }
}

function collectMatchingDependencies(
  dependencies: Map<string, string>,
  names: string[],
): string[] {
  return names
    .filter((name) => dependencies.has(name))
    .map((name) => `package.json: dependency ${name}`);
}

function mergeEnvVarProvidersIntoDetectedProviders(
  requiredEnvVars: EnvVarRequirement[],
  providers: Map<string, DetectedProvider>,
): void {
  for (const envVar of requiredEnvVars) {
    if (!envVar.provider) {
      continue;
    }

    addProviderEvidence(providers, envVar.provider, 'high', `${envVar.source}: ${envVar.name}`);
  }
}

function addProviderEvidence(
  providers: Map<string, DetectedProvider>,
  provider: string,
  confidence: DetectedProvider['confidence'],
  evidence: string,
): void {
  const existing = providers.get(provider);
  if (!existing) {
    providers.set(provider, {
      provider,
      confidence,
      evidence: [evidence],
    });
    return;
  }

  existing.confidence = maxConfidence(existing.confidence, confidence);
  if (!existing.evidence.includes(evidence)) {
    existing.evidence.push(evidence);
  }
}

function maxConfidence(
  left: DetectedProvider['confidence'],
  right: DetectedProvider['confidence'],
): DetectedProvider['confidence'] {
  const order = ['low', 'medium', 'high'];
  return order.indexOf(left) >= order.indexOf(right) ? left : right;
}

function sortDetectedProviders(
  providers: Map<string, DetectedProvider>,
): DetectedProvider[] {
  return [...providers.values()].sort((left, right) => left.provider.localeCompare(right.provider));
}

function getDependencyMap(packageJson: Record<string, unknown>): Map<string, string> {
  const dependencies = new Map<string, string>();

  for (const fieldName of ['dependencies', 'devDependencies'] as const) {
    const field = packageJson[fieldName];
    if (typeof field !== 'object' || field === null || Array.isArray(field)) {
      continue;
    }

    for (const [name, version] of Object.entries(field)) {
      if (typeof version === 'string') {
        dependencies.set(name, version);
      }
    }
  }

  return dependencies;
}

function inferProviderFromEnvVar(name: string): string | undefined {
  if (DATABASE_ENV_VARS.has(name)) {
    return 'neon';
  }
  if (name.startsWith('CLERK_') || name.startsWith('NEXT_PUBLIC_CLERK_')) {
    return 'clerk';
  }
  if (name.startsWith('STRIPE_') || name === 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY') {
    return 'stripe';
  }
  if (name.startsWith('RESEND_')) {
    return 'resend';
  }
  if (name.startsWith('SENTRY_') || name === 'NEXT_PUBLIC_SENTRY_DSN') {
    return 'sentry';
  }
  if (name.startsWith('POSTHOG_') || name.startsWith('NEXT_PUBLIC_POSTHOG_')) {
    return 'posthog';
  }

  return undefined;
}

function isAutoProvisionableEnvVar(name: string): boolean {
  return inferProviderFromEnvVar(name) !== undefined;
}

const LOCKFILE_TO_MANAGER: Record<string, PackageManager> = {
  'pnpm-lock.yaml': 'pnpm',
  'package-lock.json': 'npm',
  'yarn.lock': 'yarn',
};

async function checkLockfileSync(
  directory: string,
  packageJson: Record<string, unknown>,
): Promise<LockfileCheck> {
  const manifestDeps = getManifestDependencyNames(packageJson);

  // Walk up from the project directory to the filesystem root to find the
  // nearest lockfile — monorepos keep the lockfile at the workspace root,
  // not inside individual packages.
  let current = resolve(directory);
  while (true) {
    for (const [filename, manager] of Object.entries(LOCKFILE_TO_MANAGER)) {
      const lockfilePath = join(current, filename);
      let raw: string;
      try {
        raw = await readFile(lockfilePath, 'utf8');
      } catch {
        continue;
      }

      // For monorepos the lockfile lives above the project directory.
      // Compute the relative path so parsers can locate the right importer entry.
      const importerKey = current === resolve(directory) ? '.' : relative(current, resolve(directory));
      const lockfileDeps = extractLockfileDependencyNames(raw, manager, importerKey);
      // If the lockfile doesn't contain an entry for this project (e.g. a
      // monorepo lockfile that doesn't include this sub-directory as a
      // workspace member), skip it and keep searching.
      if (lockfileDeps === undefined) {
        continue;
      }
      const missingFromLockfile = [...manifestDeps].filter((dep) => !lockfileDeps.has(dep));
      const extraInLockfile = [...lockfileDeps].filter((dep) => !manifestDeps.has(dep));
      const inSync = missingFromLockfile.length === 0 && extraInLockfile.length === 0;

      return { packageManager: manager, lockfileExists: true, inSync, missingFromLockfile, extraInLockfile };
    }

    const parent = dirname(current);
    if (parent === current) {
      break; // reached filesystem root
    }
    current = parent;
  }

  return {
    packageManager: undefined,
    lockfileExists: false,
    inSync: false,
    missingFromLockfile: [...manifestDeps],
    extraInLockfile: [],
  };
}

function getManifestDependencyNames(packageJson: Record<string, unknown>): Set<string> {
  const names = new Set<string>();
  for (const field of ['dependencies', 'devDependencies'] as const) {
    const section = packageJson[field];
    if (typeof section === 'object' && section !== null && !Array.isArray(section)) {
      for (const name of Object.keys(section)) {
        names.add(name);
      }
    }
  }
  return names;
}

function extractLockfileDependencyNames(raw: string, manager: PackageManager, importerKey: string): Set<string> | undefined {
  switch (manager) {
    case 'pnpm':
      return extractPnpmDeps(raw, importerKey);
    case 'npm':
      return extractNpmDeps(raw);
    case 'yarn':
      return extractYarnDeps(raw);
  }
}

function extractPnpmDeps(raw: string, importerKey: string): Set<string> | undefined {
  // pnpm-lock.yaml v6+ has an importers section keyed by relative path.
  // Root packages use '.', monorepo sub-packages use paths like 'apps/my-app'.
  // Returns undefined if the importer key isn't found in the lockfile.
  const deps = new Set<string>();
  const lines = raw.split(/\r?\n/);
  let inImporters = false;
  let foundImporter = false;
  let inTargetImporter = false;
  let inDepsSection = false;

  // Build a pattern that matches the importer key with or without quotes
  const escapedKey = importerKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const importerPattern = new RegExp(`^\\s{2}'?${escapedKey}['"]?:`);

  for (const line of lines) {
    if (/^importers:/.test(line)) {
      inImporters = true;
      inTargetImporter = false;
      inDepsSection = false;
      continue;
    }
    // Detect start of a new top-level section (not indented) → leave importers
    if (inImporters && /^\S/.test(line) && line.trim() !== '' && !/^importers:/.test(line)) {
      inImporters = false;
      inTargetImporter = false;
      inDepsSection = false;
      continue;
    }
    if (inImporters && !inTargetImporter && importerPattern.test(line)) {
      foundImporter = true;
      inTargetImporter = true;
      inDepsSection = false;
      continue;
    }
    // Detect start of a different importer (sibling at indent 2) → leave target
    if (inTargetImporter && /^\s{2}\S/.test(line) && !importerPattern.test(line) && !/^\s{4}/.test(line)) {
      inTargetImporter = false;
      inDepsSection = false;
      continue;
    }
    if (inTargetImporter && /^\s{4}(?:dependencies|devDependencies|optionalDependencies):/.test(line)) {
      inDepsSection = true;
      continue;
    }
    if (inTargetImporter && /^\s{4}\S/.test(line) && !/^\s{4}(?:dependencies|devDependencies|optionalDependencies):/.test(line) && !/^\s{6}/.test(line)) {
      inDepsSection = false;
      continue;
    }
    if (inDepsSection) {
      // Dep entries look like: '      package-name:' or '      '@scope/name':'
      const match = /^\s{6}'?(@?[^:'\s][^:']*)'?:/.exec(line);
      if (match?.[1]) {
        deps.add(match[1]);
      }
    }
  }

  return foundImporter ? deps : undefined;
}

function extractNpmDeps(raw: string): Set<string> {
  // package-lock.json v2/v3: packages[""] has dependencies as keys
  try {
    const lockfile = JSON.parse(raw) as Record<string, unknown>;
    const deps = new Set<string>();

    // v2/v3 format: packages."" contains the root project
    const packages = lockfile.packages as Record<string, unknown> | undefined;
    if (packages && typeof packages === 'object') {
      const root = packages[''] as Record<string, unknown> | undefined;
      if (root) {
        for (const field of ['dependencies', 'devDependencies', 'optionalDependencies'] as const) {
          const section = root[field];
          if (typeof section === 'object' && section !== null) {
            for (const name of Object.keys(section)) {
              deps.add(name);
            }
          }
        }
        return deps;
      }
    }

    // v1 format: top-level dependencies
    const topDeps = lockfile.dependencies as Record<string, unknown> | undefined;
    if (topDeps && typeof topDeps === 'object') {
      for (const name of Object.keys(topDeps)) {
        deps.add(name);
      }
    }

    return deps;
  } catch {
    return new Set();
  }
}

function extractYarnDeps(raw: string): Set<string> {
  // yarn.lock lists entries like: "package-name@^version": or package-name@^version:
  const deps = new Set<string>();
  for (const line of raw.split(/\r?\n/)) {
    // Match lines like: "react@^18.0.0": or react@^18.0.0:
    const match = /^"?(@?[^@"\s][^@"]*?)@[^:]+:?\s*$/.exec(line);
    if (match?.[1]) {
      // yarn.lock can combine multiple version ranges with ", " — take each package name
      for (const segment of match[1].split(/, "?/)) {
        const nameMatch = /^(@?[^@"\s][^@"]*)/.exec(segment);
        if (nameMatch?.[1]) {
          deps.add(nameMatch[1]);
        }
      }
    }
  }
  return deps;
}
