/**
 * Deployment preflight.
 *
 *   npm run preflight
 *
 * Checks the things that make a Vercel build fail *before* you push, rather
 * than after a five-minute build. Run it from the repository root — that is
 * the first thing it verifies.
 */
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

let fail = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  \x1b[32mPASS\x1b[0m  ${label}${detail ? `  \x1b[90m${detail}\x1b[0m` : ''}`)
  else { fail++; console.log(`  \x1b[31mFAIL\x1b[0m  ${label}${detail ? `  ${detail}` : ''}`) }
}

const here = process.cwd()
console.log(`\n\x1b[1mDeployment preflight\x1b[0m  \x1b[90m${here}\x1b[0m\n`)

/* ---------- the files Vercel needs, at the repo root ---------- */
const required = ['vercel.json', 'package.json', 'api/index.js', 'api/[...path].js', 'client/package.json', 'server/src/app.js']
for (const f of required) ok(`${f} exists at the root`, fs.existsSync(path.join(here, f)))

/* ---------- git actually tracks them ----------
   Copying files in but forgetting to `git add` produces exactly the same
   Vercel error as not having them at all. */
let tracked = null
try {
  tracked = execSync('git ls-files', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n')
} catch { /* not a git repo yet */ }

if (tracked) {
  for (const f of ['vercel.json', 'api/index.js', 'api/[...path].js']) {
    ok(`git tracks ${f}`, tracked.includes(f), tracked.includes(f) ? '' : 'run: git add -A')
  }
  const nested = tracked.find((f) => /^[^/]+\/(vercel\.json|api\/index\.js)$/.test(f))
  ok(
    'repo root is the project root',
    !nested,
    nested ? `found "${nested}" — the project is nested one level too deep` : '',
  )
} else {
  console.log('  \x1b[90mSKIP  git checks — not a git repository yet\x1b[0m')
}

/* ---------- config sanity ---------- */
if (fs.existsSync('vercel.json')) {
  const v = JSON.parse(fs.readFileSync('vercel.json', 'utf8'))
  ok('outputDirectory is client/dist', v.outputDirectory === 'client/dist', v.outputDirectory)
  ok('buildCommand is set', !!v.buildCommand, v.buildCommand)
  ok('SPA rewrite excludes /api', JSON.stringify(v.rewrites || []).includes('?!api/'))

  // "api/**/*.js" silently matches nothing when the files sit directly in api/.
  const globs = Object.keys(v.functions || {})
  const matchesFlat = globs.some((g) => g === 'api/*.js' || g === 'api/**')
  ok('functions glob matches api/*.js', matchesFlat, globs.join(', ') || 'none')
}

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
ok('root package.json has "type": "module"', pkg.type === 'module', pkg.type || 'missing — api/ will be parsed as CommonJS')
ok('build script exists', !!pkg.scripts?.build, pkg.scripts?.build)

/* ---------- secrets ---------- */
ok('.env is not committed', !tracked || !tracked.includes('.env'))

console.log(
  fail
    ? `\n  \x1b[31m${fail} problem${fail === 1 ? '' : 's'} — fix before pushing\x1b[0m\n`
    : `\n  \x1b[32mReady to push.\x1b[0m Root Directory in Vercel must be blank or "./".\n`,
)
process.exit(fail ? 1 : 0)
