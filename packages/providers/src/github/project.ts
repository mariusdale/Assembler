import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

export interface ProjectFile {
  path: string;
  content: Buffer;
}

const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.next',
  '.turbo',
  '.devassemble',
  'node_modules',
  'dist',
  'coverage',
]);

const IGNORED_FILES = new Set(['.DS_Store']);

export async function loadProjectFiles(directory: string): Promise<ProjectFile[]> {
  const files = await walkProjectDirectory(directory, directory);

  return files.sort((left, right) => left.path.localeCompare(right.path));
}

async function walkProjectDirectory(root: string, directory: string): Promise<ProjectFile[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: ProjectFile[] = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (IGNORED_FILES.has(entry.name)) {
      continue;
    }

    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) {
        continue;
      }

      files.push(...(await walkProjectDirectory(root, entryPath)));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    files.push({
      path: toPosixPath(relative(root, entryPath)),
      content: await readFile(entryPath),
    });
  }

  return files;
}

function toPosixPath(value: string): string {
  return value.split('\\').join('/');
}
