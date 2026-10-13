#!/usr/bin/env node
// Enforces the modular-monolith rules from docs/architecture.md. Fails CI on a violation.
//
//  1. A module may import another module only through its public surface: modules/<name>/index.
//  2. A module may use only the database tables it owns (ownership map below). Everything else is
//     reached through the owner's public service.
//  3. platform/, shared/ and common/ never import from modules/.
//  4. Controllers do not import repositories; domain/ imports nothing from Nest, the database or other layers.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const SRC = join(process.cwd(), 'apps/api/src');
const OWNERS = {
  identity: ['users', 'userRoles', 'otpChallenges', 'sessions'],
  gurus: ['gurus'],
  rules: ['ruleSets', 'ruleSetVersions'],
  candidates: ['candidates', 'applications', 'applicationStageEvents', 'notes'],
  documents: ['documents'],
  recommendations: ['ruleExceptions', 'recommendations', 'guruResponses', 'packageExports'],
  ceremonies: ['ceremonies', 'ceremonyAttendees'],
  register: ['registerEntries'],
  audit: ['auditLog'],
  notifications: ['notifications'],
  imports: ['importJobs'],
};
const PLATFORM_TABLES = ['tenants', 'outboxEvents', 'processedEvents'];
const tableOwner = new Map(Object.entries(OWNERS).flatMap(([m, ts]) => ts.map((t) => [t, m])));

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.ts') && !p.endsWith('.spec.ts')) files.push(p);
  }
})(SRC);

const problems = [];
const fail = (file, msg) => problems.push(`${relative(process.cwd(), file)}: ${msg}`);

for (const file of files) {
  const rel = relative(SRC, file).split(sep);
  const area = rel[0];
  const mod = area === 'modules' ? rel[1] : null;
  const layer = area === 'modules' ? rel[2] : null;
  const src = readFileSync(file, 'utf8');
  const imports = [...src.matchAll(/import\s+(?:type\s+)?(?:([\s\S]*?)\s+from\s+)?['"]([^'"]+)['"]/g)];

  for (const m of imports) {
    const clause = m[1] ?? '';
    const spec = m[2];
    if (!spec.startsWith('.')) {
      if (layer === 'domain' && /^@nestjs\/|^drizzle-orm|^pg$/.test(spec)) fail(file, `domain code must not import "${spec}"`);
      continue;
    }
    const target = relative(SRC, join(file, '..', spec)).split(sep);

    // Rule 3
    if (['platform', 'shared', 'common'].includes(area) && target[0] === 'modules') {
      fail(file, `${area}/ must not import from modules/ ("${spec}")`);
    }
    if (target[0] !== 'modules' || !mod) {
      // Rule 2: table ownership
      if (mod && target[0] === 'database' && target[1] === 'schema') {
        const names = [...clause.matchAll(/\b([a-z][A-Za-z0-9]*)\b/g)].map((x) => x[1]);
        for (const n of names) {
          const owner = tableOwner.get(n);
          if (owner && owner !== mod) fail(file, `uses table "${n}" owned by module "${owner}"; call its public service instead`);
          if (PLATFORM_TABLES.includes(n)) fail(file, `uses platform table "${n}"`);
        }
      }
      continue;
    }
    // Rule 1
    const targetMod = target[1];
    if (targetMod !== mod) {
      const rest = target.slice(2);
      if (rest.length > 0 && !(rest.length === 1 && rest[0] === 'index')) {
        fail(file, `imports "${spec}" from module "${targetMod}" but only its index is public`);
      }
    }
  }

  // Rule 4
  if (layer === 'http') {
    for (const m of imports) {
      if (/\/infrastructure\//.test(m[2])) fail(file, `controller imports infrastructure ("${m[2]}")`);
    }
  }
  if (layer === 'domain') {
    for (const m of imports) {
      if (m[2].startsWith('.') && /\/(application|infrastructure|http)\//.test(m[2])) fail(file, `domain imports an outer layer ("${m[2]}")`);
    }
  }
}

if (problems.length) {
  console.error(`Module boundary violations (${problems.length}):\n` + problems.map((p) => `  - ${p}`).join('\n'));
  process.exit(1);
}
console.log(`Module boundaries OK (${files.length} files checked).`);
