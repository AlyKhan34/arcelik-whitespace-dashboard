# Arçelik store white-space dashboard (ECON 449 · use case 08)

Where does Arçelik have demand without a store? Brief: [docs/design.md](docs/design.md).

```
npm install                          # once: ECharts 5.6.0 (inlined) + Playwright
npx playwright install chromium      # once, for the tests and the PDF
npm run build                        # -> dist/whitespace_dashboard.html (one offline file)
npm run test:parity                  # JS metrics vs scripts/metrics.py, 2023/2024/2025
npm run test:ui                      # filters, offline, EN/TR x 1280/390 screenshots
npm run handin                       # -> dist/note.pdf, dist/whitespace_data.zip
```

| Folder | Content |
|---|---|
| `data/` | Cleaned CSVs (stores are **dummy**) |
| `scripts/` | Data prep, `metrics.py` (reference), `build_dashboard.py` (thresholds in `CONFIG`), `handin.py` |
| `site/` | `index.html`, `app.js`, `metrics.js`, `i18n.js`, `styles.css` (templates inlined by the build) |
| `tests/` | `parity.mjs`, `ui.mjs` |
| `dist/` | Hand-in files |
