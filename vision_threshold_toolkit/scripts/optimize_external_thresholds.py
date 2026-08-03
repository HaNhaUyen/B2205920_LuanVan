from __future__ import annotations
import argparse,csv,json
from pathlib import Path

def main():
    p=argparse.ArgumentParser();p.add_argument('--predictions',default='results/predictions.csv');p.add_argument('--output-dir',default='results');a=p.parse_args()
    rows=[r for r in csv.DictReader(Path(a.predictions).open(encoding='utf-8-sig')) if str(r.get('external_called'))=='1']
    ranked=[]
    for conf_i in range(50,91,2):
      for evidence in (1,2,3,4):
        conf=conf_i/100; tp=fp=fn=tn=0
        for r in rows:
          target=r['group']=='external'; travel=(r.get('external_image_type') or '') in {'travel_landscape','building_landmark'}
          accept=travel and float(r.get('external_confidence') or 0)>=conf and int(float(r.get('external_evidence_count') or 0))>=evidence
          # Đánh giá nhận diện ngoài dataset ở mức chấp nhận/từ chối; tên cụ thể vẫn cần review thủ công.
          if target and accept:tp+=1
          elif target and not accept:fn+=1
          elif not target and accept:fp+=1
          else:tn+=1
        precision=tp/(tp+fp) if tp+fp else 0; recall=tp/(tp+fn) if tp+fn else 0; f1=2*precision*recall/(precision+recall) if precision+recall else 0
        ranked.append({'confidence':conf,'min_evidence':evidence,'tp':tp,'fp':fp,'fn':fn,'tn':tn,'precision':precision,'recall':recall,'f1':f1})
    ranked.sort(key=lambda x:(x['f1'],x['precision']),reverse=True);out=Path(a.output_dir);out.mkdir(parents=True,exist_ok=True)
    with (out/'external_threshold_grid.csv').open('w',encoding='utf-8-sig',newline='') as fp:
      w=csv.DictWriter(fp,fieldnames=ranked[0].keys());w.writeheader();w.writerows(ranked)
    best=ranked[0];(out/'recommended_external_thresholds.env').write_text(f"VISION_EXTERNAL_MIN_CONFIDENCE={best['confidence']:.2f}\nVISION_EXTERNAL_MIN_EVIDENCE={best['min_evidence']}\n",encoding='utf-8')
    print(json.dumps(best,indent=2));print(out/'recommended_external_thresholds.env')
if __name__=='__main__':main()
