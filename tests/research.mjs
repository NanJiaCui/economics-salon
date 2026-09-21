import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const compiled = ts.transpileModule(readFileSync(new URL('../lib/research.ts', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { extractArticle, parseResearch } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const html = '<html><head><meta name="description" content="A generic description that is long enough to be used when article paragraphs are absent."></head><body><nav><p>Subscribe for lots of irrelevant navigation content and promotions.</p></nav><article><p>Electric vehicles and battery supply chains are changing the way factories obtain components across borders, and companies now face different financing conditions.</p><p>Housing demand in major cities has shifted with mortgage rates, but transaction volume and prices do not always move together in the same quarter.</p></article></body></html>';
assert.match(extractArticle(html, 'Housing demand and mortgage rates'), /Housing demand/);
assert.ok(!extractArticle(html, 'Housing demand and mortgage rates').includes('Subscribe'));
assert.deepEqual(parseResearch([{ title: 'x', url: 'https://example.com', excerpt: 'y', access: 'feed' }, { title: 'bad', url: 'http://localhost', excerpt: 'y', access: 'feed' }]).map(x => x.title), ['x']);
console.log('PASS: article paragraph selection, navigation exclusion, research provenance parsing');
