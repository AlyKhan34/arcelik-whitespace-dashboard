"""Make the hand-in files in dist/: note.pdf (from docs/note.md) and whitespace_data.zip
(data/ + docs/data_dictionary.md). Run after build_dashboard.py."""
import subprocess, zipfile
from pathlib import Path
import markdown

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'
CSS = """body{font:9.6pt/1.38 -apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#111;margin:0}
h1{font-size:15pt;margin:0 0 4pt}h2{font-size:11pt;margin:9pt 0 3pt;border-bottom:1px solid #ddd;padding-bottom:2pt}
p{margin:3pt 0}table{border-collapse:collapse;width:100%;margin:3pt 0;font-size:8.6pt}
th,td{border:1px solid #ddd;padding:2.5pt 5pt;text-align:left;vertical-align:top}th{background:#f3f3f1}
ol{margin:2pt 0;padding-left:16pt}li{margin:1pt 0}code{font-size:8.5pt}"""

def note_pdf():
    body = markdown.markdown((ROOT / 'docs/note.md').read_text(encoding='utf-8'), extensions=['tables'])
    html = DIST / 'note.html'
    html.write_text(f'<!doctype html><meta charset="utf-8"><title>Note</title><style>{CSS}</style>{body}', encoding='utf-8')
    subprocess.run(['node', str(ROOT / 'scripts/print_pdf.mjs'), str(html), str(DIST / 'note.pdf')], check=True)
    html.unlink()

def data_zip():
    out = DIST / 'whitespace_data.zip'
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for f in sorted((ROOT / 'data').rglob('*')):
            if f.is_file() and f.name != '.DS_Store':
                z.write(f, f.relative_to(ROOT))
        z.write(ROOT / 'docs/data_dictionary.md', 'docs/data_dictionary.md')
    print(f'wrote {out.relative_to(ROOT)} ({out.stat().st_size / 1e6:.1f} MB)')

if __name__ == '__main__':
    DIST.mkdir(exist_ok=True)
    note_pdf()
    data_zip()
