import os
RTM=os.environ.get('RTM_SITE','.')  # site repo root holding reports/<id>/full.md
import re,sys,bisect,glob,json
sys.path.insert(0,'.'); from align import norm_words,our_paras
from pbound import ref_paras_html
def lis(pairs):
    # pairs sorted by our idx; longest strictly increasing in ref idx
    tails=[];tid=[];prev=[-1]*len(pairs)
    for k,(o,r) in enumerate(pairs):
        j=bisect.bisect_left(tails,r)
        if j==len(tails): tails.append(r); tid.append(k)
        else: tails[j]=r; tid[j]=k
        prev[k]=tid[j-1] if j>0 else -1
    out=[];k=tid[-1] if tid else -1
    while k>=0: out.append(pairs[k]); k=prev[k]
    return out[::-1]
def score(ref_paras,ours_md,n=7,tol=4,label=''):
    rw=[];rstart=[]
    for p in ref_paras: rstart.append(len(rw)); rw+=p
    ow=[];ostart=[]
    for p in our_paras(ours_md):
        w=norm_words(p)
        if w: ostart.append(len(ow)); ow+=w
    def cnt(w):
        d={}
        for i in range(len(w)-n+1):
            k=tuple(w[i:i+n]); d[k]=d.get(k,[])+[i] if k in d else [i]
        return d
    rd=cnt(rw); od=cnt(ow)
    pairs=sorted((od[k][0],rd[k][0]) for k in od if len(od[k])==1 and k in rd and len(rd[k])==1)
    sk=lis(pairs)
    cov_o=len(sk)  # anchors
    oi=[a for a,b in sk]; ri=[b for a,b in sk]
    def omap(o):  # our idx -> ref idx via nearest preceding anchor
        j=bisect.bisect_right(oi,o)-1
        if j<0: return None
        return ri[j]+(o-oi[j]), o-oi[j]
    mapped=[]
    for s in ostart:
        m=omap(s)
        if m and m[1]<400: mapped.append(m[0])
    rs=set(rstart); ms=set(mapped)
    near=lambda s,S:any((s+d) in S for d in range(-tol,tol+1))
    rref=[s for s in rstart if any(abs(s-r)<400 for r in ri[:0]) or True]
    # restrict ref boundaries to span covered by anchors
    lo,hi=ri[0],ri[-1]
    rin=[s for s in rstart if lo<=s<=hi]
    oin=[m for m in mapped if lo<=m<=hi]
    hit=sum(1 for s in rin if near(s,ms))
    ohit=sum(1 for m in oin if near(m,rs))
    P=ohit/len(oin) if oin else 0; R=hit/len(rin) if rin else 0
    print(f"{label}: anchors {len(sk)}; ref paras in span {len(rin)}, ours {len(oin)}; boundary recall {R:.1%} (ref boundaries we reproduce), precision {P:.1%} (our paragraph starts that are real); missing {len(rin)-hit}, spurious {len(oin)-ohit}")
    return rin,mapped,rw,ow
if __name__=="__main__":
    w=sys.argv[1]
    if w=='911':
        files=[f for f in sorted(glob.glob('ref/911/*.htm')) if 'Notes' not in f and 'App' not in f]
        ours=open(RTM+'/reports/us-911-commission/full.md').read()
        score(ref_paras_html(files),ours,label='911 HTML')
    if w=='sav':
        files=sorted(glob.glob('ref/saville/ch*.html'))
        ours=open(RTM+'/reports/uk-saville-inquiry/full.md').read()
        score(ref_paras_html(files),ours,label='Saville HTML')
