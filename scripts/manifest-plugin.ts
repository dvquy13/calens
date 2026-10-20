import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { Plugin, ResolvedConfig } from 'vite';

/**
 * Writes dist/manifest.json from public/manifest.json without ever touching the
 * source file (Vite has already copied public/ by the time writeBundle runs).
 *
 * - production: drops `key`, so CWS assigns the listing's own ID. The version is
 *   whatever is in public/manifest.json (CI stamps it from the release tag).
 * - development: keeps `key` (stable ID for OAuth) and sets the version from the
 *   latest `v*` git tag, with `version_name` "<tag>-dev" so the panel shows which
 *   release the dev build is based on instead of the never-bumped source value.
 *   Without a `v*` tag (fresh clone of a fork, shallow checkout) it warns and
 *   keeps the source version.
 */
function latestReleaseTag(cwd: string): string | null {
  try {
    return execSync("git describe --tags --abbrev=0 --match 'v*'", { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

export function manifestPlugin(): Plugin {
  let config: ResolvedConfig;

  return {
    name: 'calens-manifest',
    apply: 'build',
    configResolved(resolved) {
      config = resolved;
    },
    writeBundle() {
      const manifest = JSON.parse(fs.readFileSync(path.join(config.root, 'public/manifest.json'), 'utf8'));

      const clientId: string | undefined = manifest.oauth2?.client_id;
      if (!clientId || clientId.includes('YOUR_CLIENT_ID')) {
        throw new Error('public/manifest.json is missing a real oauth2.client_id');
      }

      if (config.mode === 'production') {
        delete manifest.key;
      } else {
        if (!manifest.key) throw new Error('public/manifest.json has no "key"; the dev extension ID would not match OAuth');
        const tag = latestReleaseTag(config.root);
        if (tag) {
          const version = tag.slice(1);
          if (!/^\d+(\.\d+){0,3}$/.test(version)) throw new Error(`Latest tag ${tag} is not a valid Chrome extension version`);
          manifest.version = version;
        } else {
          console.warn(`[calens-manifest] no v* git tag found; dev build uses the source version ${manifest.version}`);
        }
        manifest.version_name = `${manifest.version}-dev`;
      }

      fs.writeFileSync(path.join(config.root, config.build.outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    },
  };
}
