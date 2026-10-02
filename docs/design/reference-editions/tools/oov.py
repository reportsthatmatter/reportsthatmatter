import os
RTM=os.environ.get('RTM_SITE','.')  # site repo root holding reports/<id>/full.md
import sys,glob,re,collections
sys.path.insert(0,'.'); from align import norm_words
from pbound import ref_paras_html
files=sorted(glob.glob('ref/911/*.htm'))
vocab=set(w for p in ref_paras_html(files) for w in p)
md=open(RTM+'/reports/us-911-commission/full.md').read()
cut=md.find('\n## Notes')
body=md[:cut] if cut>0 else md
ow=norm_words(body)
bad=[w for w in ow if w not in vocab]
print(len(ow),len(bad),f"{len(bad)/len(ow):.2%}")
c=collections.Counter(bad); print(c.most_common(25))
# example line
for l in md.split('\n'):
    if 'Tue sday' in l: print(l[:260])
