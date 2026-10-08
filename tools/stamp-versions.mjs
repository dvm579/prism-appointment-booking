#!/usr/bin/env node
/**
 * Stamps index.html with a content hash for every page asset.
 *
 * GitHub Pages lets browsers cache each file for ten minutes and nothing here is
 * bundled, so right after a deploy a returning browser could run a cached
 * utils.js beside a fresh slots.js that imports something utils.js does not
 * have yet, and the page would fail to start. Under hashed URLs a fresh
 * index.html only ever names one consistent set of files.
 *
 * Modules import one another by relative path ('./utils.js'), which a query
 * string on main.js would not reach, so the hashes go in an import map: the
 * browser rewrites './src/utils.js' to './src/utils.js?v=<hash>' wherever it is
 * imported from. A file that has not changed keeps its URL and stays cached.
 *
 *   node tools/stamp-versions.mjs                    rewrite index.html
 *   node tools/stamp-versions.mjs --check            exit 1 if index.html is stale
 *   node tools/stamp-versions.mjs --check --staged   the same, for the git index
 *
 * The pre-commit hook in .githooks/ runs this; see CLAUDE.md for enabling it.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = 'index.html';
const STYLESHEET = 'assets/css/style.css';
const ENTRY = 'src/main.js';
const START = '<!-- asset-versions:start -->';
const END = '<!-- asset-versions:end -->';

const args = new Set(process.argv.slice(2));
const staged = args.has('--staged');
const check = args.has('--check') || staged;

/** A file as it is in the working tree, or as it is staged with --staged. */
function read(path) {
    if (staged) {
        return execFileSync('git', ['show', `:${path}`], { cwd: ROOT, encoding: 'utf8' });
    }
    return readFileSync(join(ROOT, path), 'utf8');
}

function moduleFiles() {
    const names = staged
        ? execFileSync('git', ['ls-files', '--cached', '--', 'src'], { cwd: ROOT, encoding: 'utf8' })
              .split('\n')
              .filter(path => /^src\/[^/]+\.js$/.test(path))
              .map(path => path.slice('src/'.length))
        : readdirSync(join(ROOT, 'src')).filter(name => name.endsWith('.js'));
    return names.sort().map(name => `src/${name}`);
}

/** Line endings are normalised so a CRLF checkout hashes the same as an LF one. */
function hash(path) {
    return createHash('sha256')
        .update(read(path).replace(/\r\n/g, '\n'))
        .digest('hex')
        .slice(0, 10);
}

function versioned(path) {
    return `${path}?v=${hash(path)}`;
}

function importMap() {
    const imports = Object.fromEntries(
        moduleFiles().map(path => [`./${path}`, `./${versioned(path)}`])
    );
    const json = JSON.stringify({ imports }, null, 2).replace(/^/gm, '    ');
    return `    <script type="importmap">\n${json}\n    </script>`;
}

/** Replaces exactly one match, so a renamed tag fails loudly instead of silently. */
function replaceOnce(html, pattern, replacement, what) {
    const matches = html.match(new RegExp(pattern.source, 'g')) ?? [];
    if (matches.length !== 1) {
        throw new Error(`${PAGE}: expected one ${what}, found ${matches.length}.`);
    }
    return html.replace(pattern, replacement);
}

function stamp(html) {
    const start = html.indexOf(START);
    const end = html.indexOf(END);
    if (start === -1 || end < start) {
        throw new Error(`${PAGE}: the ${START} … ${END} markers are missing.`);
    }
    html = `${html.slice(0, start + START.length)}\n${importMap()}\n    ${html.slice(end)}`;
    html = replaceOnce(
        html,
        /href="assets\/css\/style\.css(?:\?v=[0-9a-f]+)?"/,
        `href="${versioned(STYLESHEET)}"`,
        'stylesheet link'
    );
    html = replaceOnce(
        html,
        /src="src\/main\.js(?:\?v=[0-9a-f]+)?"/,
        `src="${versioned(ENTRY)}"`,
        'entry script'
    );
    return html;
}

const before = read(PAGE);
const after = stamp(before);

if (before === after) {
    console.log(`${PAGE}: asset versions are up to date.`);
} else if (check) {
    console.error(`${PAGE}: asset versions are stale. Run: node tools/stamp-versions.mjs`);
    process.exit(1);
} else {
    writeFileSync(join(ROOT, PAGE), after);
    console.log(`${PAGE}: asset versions updated.`);
}
