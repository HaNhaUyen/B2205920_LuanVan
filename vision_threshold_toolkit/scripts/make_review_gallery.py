from __future__ import annotations
import argparse, csv, html
from pathlib import Path


def main():
    p=argparse.ArgumentParser()
    p.add_argument('--dataset', default='threshold_dataset')
    p.add_argument('--output', default='threshold_dataset/review_gallery.html')
    a=p.parse_args()
    root=Path(a.dataset).resolve(); meta=root/'metadata.csv'; out=Path(a.output).resolve()
    rows=list(csv.DictReader(meta.open(encoding='utf-8-sig')))
    cards=[]
    for i,r in enumerate(rows,1):
        src=(root/r['relative_path']).resolve().as_uri()
        cards.append(f'''<article><img src="{src}"><div><b>{i}. {html.escape(r['expected_name'])}</b><br>{html.escape(r['group'])} / {html.escape(r.get('expected_slug',''))}<br><small>{html.escape(r.get('source_url',''))}</small></div></article>''')
    out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text('''<!doctype html><meta charset="utf-8"><title>Travela dataset review</title><style>body{font-family:Arial;margin:24px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px}article{border:1px solid #ddd;border-radius:10px;padding:10px}img{width:100%;height:180px;object-fit:cover;border-radius:7px}small{word-break:break-all}</style><h1>Dataset review</h1><p>Kiểm tra từng ảnh, sau đó cập nhật cột <code>review_status</code> trong metadata.csv thành <b>approved</b> hoặc <b>rejected</b>.</p><div class="grid">'''+''.join(cards)+'</div>',encoding='utf-8')
    print(out)
if __name__=='__main__': main()
