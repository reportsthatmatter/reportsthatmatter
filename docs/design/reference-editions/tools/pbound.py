import os
RTM=os.environ.get('RTM_SITE','.')  # site repo root holding reports/<id>/full.md
import re,sys,html,glob,json
sys.path.insert(0,'.'); from align import norm_words,our_paras
def ref_paras_html(files,ptag=r'<p[ >]'):
    out=[]
    for f in files:
        t=open(f,errors='ignore').read()
        t=re.sub(r'(?s)<(script|style).*?</\1>','',t); t=re.sub(r'<sup>.*?</sup>','',t)
        for chunk in re.split(r'<p[^>]*>|<h[1-6][^>]*>|<br\s*/?>\s*<br\s*/?>|<li[^>]*>',t):
            w=norm_words(re.sub(r'<[^>]+>',' ',chunk))
            if w: out.append(w)
    return out
def boundaries(ref_paras,ours_md,n=6,tol=3):
    rw=[]; rstarts=set()
    for p in ref_paras:
        rstarts.add(len(rw)); rw+=p
    idx={}
    for i in range(len(rw)-n+1): idx.setdefault(tuple(rw[i:i+n]),[]).append(i)
    ours=our_paras(ours_md); ostarts=[]; last=0; started=False
    for p in ours:
        w=norm_words(p)
        if len(w)<n+2: continue
        pos=None
        for i in range(0,min(len(w)-n+1,12)):
            h=[x for x in idx.get(tuple(w[i:i+n]),[]) if last-200<=x<=last+3000]
            if h: pos=min(h,key=lambda x:abs(x-last))-i; break
        if pos is None: continue
        ostarts.append(max(pos,0)); last=pos
    ost=set(ostarts)
    def near(s,S): return any((s+d) in S for d in range(-tol,tol+1))
    rs=[s for s in rstarts if len(rw)-s>=n]
    merged=sum(1 for s in rs if not near(s,ost))   # reference boundary missing in ours
    spurious=sum(1 for s in ostarts if not near(s,rstarts))
    return dict(ref_paras=len(rs),ours_aligned=len(ostarts),ref_boundaries_missing=merged,ours_spurious_starts=spurious)
if __name__=="__main__":
    which=sys.argv[1]
    if which=='911':
        files=[f for f in sorted(glob.glob('ref/911/*.htm')) if 'Notes' not in f and 'App' not in f]
        ours=open(RTM+'/reports/us-911-commission/full.md').read()
        print('911',boundaries(ref_paras_html(files),ours))
    if which=='sav':
        files=sorted(glob.glob('ref/saville/ch*.html'))
        ours=open(RTM+'/reports/uk-saville-inquiry/full.md').read()
        print('saville',boundaries(ref_paras_html(files),ours))
