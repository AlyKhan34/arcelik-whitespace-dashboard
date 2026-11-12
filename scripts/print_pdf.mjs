// Print an HTML file to an A4 PDF with headless Chromium: node scripts/print_pdf.mjs IN.html OUT.pdf
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const [inp, out] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage();
await p.goto(pathToFileURL(path.resolve(inp)).href);
await p.pdf({ path: out, format: 'A4', margin: { top: '12mm', bottom: '12mm', left: '13mm', right: '13mm' }, printBackground: true });
const pages = await p.evaluate(() => Math.ceil(document.body.scrollHeight / (297 - 24) / 3.78));
console.log(`wrote ${out} (~${pages} page(s))`);
await b.close();
