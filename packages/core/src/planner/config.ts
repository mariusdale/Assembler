import { createRequire } from 'node:module';
import { access, readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { ProjectConfig, ProjectFramework, LoadedProjectConfig } from '@assembler/types';

export const PROJECT_CONFIG_FILENAMES = [
  'assembler.config.json',
  'assembler.config.js',
  'assembler.config.mjs',
  'assembler.config.cjs',
] as const;

export class ProjectConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectConfigError';
  }
}

const PROJECT_FRAMEWORKS = new Set<ProjectFramework>([
  'nextjs',
  'remix',
  'astro',
  'static',
  'node',
  'unknown',
]);

export async function loadProjectConfig(directory: string): Promise<LoadedProjectConfig | undefined> {
  const filepath = await findProjectConfig(directory);
  if (!filepath) {
    return undefined;
  }

  const raw = await readProjectConfig(filepath);
  return {
    path: filepath,
    config: normalizeProjectConfig(raw, filepath),
  };
}

export async function findProjectConfig(directory: string): Promise<string | undefined> {
  const projectDirectory = resolve(directory);

  for (const filename of PROJECT_CONFIG_FILENAMES) {
    const filepath = join(projectDirectory, filename);
    try {
      await access(filepath);
      return filepath;
    } catch {
      // Keep looking for the next supported filename.
    }
  }

  return undefined;
}

export function defineConfig(config: ProjectConfig): ProjectConfig {
  return config;
}

async function readProjectConfig(filepath: string): Promise<unknown> {
  const extension = extname(filepath);

  if (extension === '.json') {
    return JSON.parse(await readFile(filepath, 'utf8')) as unknown;
  }

  if (extension === '.cjs') {
    const require = createRequire(import.meta.url);
    return unwrapModuleExport(require(filepath) as unknown);
  }

  const module = await import(pathToFileURL(filepath).href);
  return unwrapModuleExport(module as Record<string, unknown>);
}

function unwrapModuleExport(value: unknown): unknown {
  if (isRecord(value) && 'default' in value) {
    return value.default;
  }

  return value;
}

function normalizeProjectConfig(raw: unknown, source: string): ProjectConfig {
  const errors: string[] = [];

  if (!isRecord(raw)) {
    throw new ProjectConfigError(`${source} must export a config object.`);
  }

  const config: ProjectConfig = {};

  if ('framework' in raw) {
    if (typeof raw.framework === 'string' && PROJECT_FRAMEWORKS.has(raw.framework as ProjectFramework)) {
      config.framework = raw.framework as ProjectFramework;
    } else {
      errors.push('framework must be one of nextjs, remix, astro, static, node, or unknown.');
    }
  }

  if ('target' in raw) {
    const target = readNonEmptyString(raw.target, 'target', errors);
    if (target) {
      config.target = target;
    }
  }

  if ('build' in raw) {
    if (isRecord(raw.build)) {
      const build = normalizeBuildConfig(raw.build, errors);
      if (Object.keys(build).length > 0) {
        config.build = build;
      }
    } else {
      errors.push('build must be an object.');
    }
  }

  if ('env' in raw) {
    if (isRecord(raw.env)) {
      const env = normalizeEnvConfig(raw.env, errors);
      if (Object.keys(env).length > 0) {
        config.env = env;
      }
    } else {
      errors.push('env must be an object keyed by environment variable name.');
    }
  }

  if ('providers' in raw) {
    if (isRecord(raw.providers)) {
      const providers = normalizeProviderConfig(raw.providers, errors);
      if (Object.keys(providers).length > 0) {
        config.providers = providers;
      }
    } else {
      errors.push('providers must be an object keyed by provider name.');
    }
  }

  if (errors.length > 0) {
    throw new ProjectConfigError(`${source} is invalid: ${errors.join(' ')}`);
  }

  return config;
}

function normalizeBuildConfig(
  raw: Record<string, unknown>,
  errors: string[],
): NonNullable<ProjectConfig['build']> {
  const build: NonNullable<ProjectConfig['build']> = {};
  const command = readOptionalNonEmptyString(raw.command, 'build.command', errors);
  const outputDirectory = readOptionalNonEmptyString(
    raw.outputDirectory,
    'build.outputDirectory',
    errors,
  );
  const nodeVersion = readOptionalNonEmptyString(raw.nodeVersion, 'build.nodeVersion', errors);

  if (command) {
    build.command = command;
  }
  if (outputDirectory) {
    build.outputDirectory = outputDirectory;
  }
  if (nodeVersion) {
    build.nodeVersion = nodeVersion;
  }

  return build;
}

function normalizeEnvConfig(
  raw: Record<string, unknown>,
  errors: string[],
): NonNullable<ProjectConfig['env']> {
  const env: NonNullable<ProjectConfig['env']> = {};

  for (const [name, value] of Object.entries(raw)) {
    if (!isEnvVarName(name)) {
      errors.push(`env.${name} must be an uppercase environment variable name.`);
      continue;
    }
    if (!isRecord(value)) {
      errors.push(`env.${name} must be an object.`);
      continue;
    }

    const entry: NonNullable<ProjectConfig['env']>[string] = {};
    const provider = readOptionalNonEmptyString(value.provider, `env.${name}.provider`, errors);
    const required = readOptionalBoolean(value.required, `env.${name}.required`, errors);
    const autoProvision = readOptionalBoolean(
      value.autoProvision,
      `env.${name}.autoProvision`,
      errors,
    );

    if (provider) {
      entry.provider = provider;
    }
    if (required !== undefined) {
      entry.required = required;
    }
    if (autoProvision !== undefined) {
      entry.autoProvision = autoProvision;
    }

    env[name] = entry;
  }

  return env;
}

function normalizeProviderConfig(
  raw: Record<string, unknown>,
  errors: string[],
): NonNullable<ProjectConfig['providers']> {
  const providers: NonNullable<ProjectConfig['providers']> = {};

  for (const [name, value] of Object.entries(raw)) {
    if (!isProviderName(name)) {
      errors.push(`providers.${name} must use lowercase provider id characters.`);
      continue;
    }
    if (typeof value === 'boolean') {
      providers[name] = value;
      continue;
    }
    if (!isRecord(value)) {
      errors.push(`providers.${name} must be a boolean or an object.`);
      continue;
    }

    const enabled = readOptionalBoolean(value.enabled, `providers.${name}.enabled`, errors);
    providers[name] = enabled === undefined ? {} : { enabled };
  }

  return providers;
}

function readNonEmptyString(value: unknown, label: string, errors: string[]): string | undefined {
  if (typeof value === 'string' && value.trim() !== '') {
    return value.trim();
  }

  errors.push(`${label} must be a non-empty string.`);
  return undefined;
}

function readOptionalNonEmptyString(
  value: unknown,
  label: string,
  errors: string[],
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return readNonEmptyString(value, label, errors);
}

function readOptionalBoolean(
  value: unknown,
  label: string,
  errors: string[],
): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return value;
  }

  errors.push(`${label} must be a boolean.`);
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isEnvVarName(value: string): boolean {
  return /^[A-Z][A-Z0-9_]*$/.test(value);
}

function isProviderName(value: string): boolean {
  return /^[a-z][a-z0-9-]*$/.test(value);
}
