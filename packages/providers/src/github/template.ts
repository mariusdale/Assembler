import { readdir, readFile } from 'node:fs/promises';
import { extname } from 'node:path';

import type { AppSpec } from '@assembler/types';

const TEMPLATE_ROOT = new URL('../../../../templates/next-saas/', import.meta.url);

export interface TemplateFile {
  path: string;
  content: string;
}

export async function loadGoldenPathTemplate(appSpec: AppSpec): Promise<TemplateFile[]> {
  const filePaths = await walkTemplateDirectory(TEMPLATE_ROOT);

  return Promise.all(
    filePaths.map(async (path) => {
      const templateUrl = new URL(path, TEMPLATE_ROOT);
      const raw = await readFile(templateUrl, 'utf8');

      return {
        path,
        content: renderTemplate(raw, appSpec),
      };
    }),
  );
}

async function walkTemplateDirectory(root: URL, prefix = ''): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    const entryUrl = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, root);

    if (entry.isDirectory()) {
      files.push(...(await walkTemplateDirectory(entryUrl, relativePath)));
      continue;
    }

    if (isTextTemplate(relativePath)) {
      files.push(relativePath);
    }
  }

  return files;
}

function renderTemplate(source: string, appSpec: AppSpec): string {
  const replacements = createReplacementMap(appSpec);

  return source.replaceAll(/\{\{([A-Z0-9_]+)\}\}/g, (match, key: string) => replacements[key] ?? match);
}

function createReplacementMap(appSpec: AppSpec): Record<string, string> {
  const appName = appSpec.name.trim();
  const title = toTitleCase(appName);
  const description = appSpec.description.trim();
  const dashboardTitle = `${title} Dashboard`;

  return {
    APP_NAME: title,
    APP_SLUG: toSlug(appName),
    APP_DESCRIPTION: description,
    APP_DOMAIN: appSpec.domain ?? `${toSlug(appName)}.preview.assembler.local`,
    DASHBOARD_TITLE: dashboardTitle,
    DATABASE_REQUIRED: appSpec.database.provider === 'neon' ? 'true' : 'false',
    BILLING_MODE: appSpec.billing.mode,
    AUTH_STRATEGY: appSpec.auth.strategy,
  };
}

function isTextTemplate(path: string): boolean {
  return !['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico'].includes(extname(path));
}

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63) || 'assembler-app';
}

function toTitleCase(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
