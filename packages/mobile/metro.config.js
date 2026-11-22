const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const fs = require('fs');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch all files in the monorepo so packages/shared is tracked
config.watchFolders = [monorepoRoot];

// 2. Resolve modules from both local mobile node_modules and root node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// 3. Fallback resolution via extraNodeModules proxy for monorepo packages and babel helpers
config.resolver.extraNodeModules = new Proxy(
  {},
  {
    get: (target, name) => {
      const localPath = path.join(projectRoot, 'node_modules', name);
      if (fs.existsSync(localPath)) {
        return localPath;
      }
      const rootPath = path.join(monorepoRoot, 'node_modules', name);
      if (fs.existsSync(rootPath)) {
        return rootPath;
      }
      return localPath;
    },
  }
);

config.resolver.disableHierarchicalLookup = false;

module.exports = config;
