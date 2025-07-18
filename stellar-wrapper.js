#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Find the project root by looking for package.json
function findProjectRoot() {
  let currentDir = __dirname;
  while (currentDir !== '/') {
    try {
      const packagePath = join(currentDir, 'package.json');
      readFileSync(packagePath);
      return currentDir;
    } catch {
      currentDir = dirname(currentDir);
    }
  }
  throw new Error('Could not find project root with package.json');
}

// Set the working directory to the project root
const projectRoot = findProjectRoot();
process.chdir(projectRoot);

// Import and run the actual application
import('./dist/index.js').catch(console.error);