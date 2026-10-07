#!/usr/bin/env node
// Release gate: the version lives in plugin.json alone, is MAJOR.MINOR.PATCH, has a CHANGELOG section, and
// matches the tag `claude plugin tag` would create. CI runs it on every push; the release workflow runs it
// with --tag. With --notes it prints the CHANGELOG section for the version instead.
//
//   node scripts/check-release.mjs [--tag <tag>] [--notes] [--root <dir>]

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const option = name => {
  const at = args.indexOf(name)
  return at === -1 ? undefined : args[at + 1]
}
const root = option('--root') ?? '.'
const tag = option('--tag')
const wantsNotes = args.includes('--notes')

const failures = []
const readJson = path => JSON.parse(readFileSync(join(root, path), 'utf8'))

const plugin = readJson('.claude-plugin/plugin.json')
const { name, version } = plugin

if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version ?? '')) {
  failures.push(`plugin.json version "${version}" is not MAJOR.MINOR.PATCH`)
}

const marketplace = readJson('.claude-plugin/marketplace.json')
for (const entry of marketplace.plugins ?? []) {
  if (entry.name === name && entry.version !== undefined) {
    failures.push(`marketplace.json entry "${name}" sets version "${entry.version}": plugin.json is the one version source`)
  }
}

const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8')
const heading = `## [${version}]`
const start = changelog.split('\n').findIndex(line => line.startsWith(heading))
let notes = ''
if (start === -1) {
  failures.push(`CHANGELOG.md has no "${heading}" section`)
} else {
  const lines = changelog.split('\n').slice(start + 1)
  const end = lines.findIndex(line => line.startsWith('## ['))
  notes = (end === -1 ? lines : lines.slice(0, end)).join('\n').trim()
  if (notes === '') {
    failures.push(`CHANGELOG.md section "${heading}" is empty`)
  }
}

if (tag !== undefined && tag !== `${name}--v${version}`) {
  failures.push(`tag "${tag}" does not match "${name}--v${version}"`)
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`check-release: ${failure}`)
  }
  process.exit(1)
}

if (wantsNotes) {
  process.stdout.write(`${notes}\n`)
} else {
  console.log(`check-release: ${name} ${version} is ready${tag === undefined ? '' : ` to release as ${tag}`}`)
}
