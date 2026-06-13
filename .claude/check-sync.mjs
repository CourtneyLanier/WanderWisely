// WanderWisely session guardrail - warns if this machine's branch is behind GitHub.
// Cross-platform (Node). Wired via the SessionStart hook in .claude/settings.local.json.
// To remove the guardrail: delete this file and that hook.
import { execSync } from 'node:child_process'

function git(args) {
  return execSync(`git ${args}`, {
    stdio: ['ignore', 'pipe', 'ignore'],
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, // never block on a credential prompt
  }).trim()
}

try {
  // Best-effort fetch; stay silent if offline or anything errors.
  try { git('fetch origin --quiet') } catch { /* offline - ignore */ }

  const branch = git('rev-parse --abbrev-ref HEAD')
  if (!branch) process.exit(0)

  let behind = '0'
  try { behind = git(`rev-list --count HEAD..origin/${branch}`) } catch { process.exit(0) }

  const n = parseInt(behind, 10)
  if (Number.isFinite(n) && n > 0) {
    const msg =
      `WanderWisely: local '${branch}' is ${n} commit(s) behind origin/${branch}. ` +
      `Run 'git pull' before editing - this app is developed on more than one machine, ` +
      `so you may be on stale code.`
    process.stdout.write(JSON.stringify({ systemMessage: msg }))
  }
} catch {
  // Never block session startup.
}
process.exit(0)
