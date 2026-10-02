import re,sys,random,html,json
from rapidfuzz import fuzz
from rapidfuzz.distance import Levenshtein
def norm_words(t):
    t=html.unescape(t).lower()
    t=re.sub(r'\[\^[^\]]*\]','',t)
    t=t.replace('’',"'").replace('‘',"'").replace('“','"').replace('”','"')
    return re.findall(r"[a-z0-9]+",t)
def our_paras(md):
    md=re.sub(r'^---\n.*?\n---\n','',md,flags=re.S)
    out=[]
    for p in re.split(r'\n\s*\n',md):
        p=p.strip()
        if not p or p.startswith(('#','|','!','<','[^','---')) : continue
        out.append(p)
    return out
def shingles(w,n=6):
    return {tuple(w[i:i+n]) for i in range(len(w)-n+1)}
def report(name,ours_md,ref_text,n=6,sample=6,seed=1):
    ow=norm_words(ours_md); rw=norm_words(ref_text)
    so=shingles(ow,n); sr=shingles(rw,n)
    inter=len(so&sr)
    print(f"[{name}] our words {len(ow)}, ref words {len(rw)}; {n}-gram containment: ours-in-ref {inter/len(so):.1%}, ref-in-ours {inter/len(sr):.1%}")
    paras=[p for p in our_paras(ours_md) if len(p.split())>=40]
    # paragraph-level anchor
    idx={}
    for i in range(len(rw)-n+1): idx.setdefault(tuple(rw[i:i+n]),[]).append(i)
    random.seed(seed); samp=random.sample(paras,min(sample,len(paras)))
    found=0; tot=len(paras)
    for p in paras:
        w=norm_words(p)
        if any(tuple(w[i:i+n]) in idx for i in range(0,max(1,len(w)-n),max(1,(len(w)-n)//4 or 1))): found+=1
    print(f"  paragraphs>=40w: {tot}; with an anchor found in ref: {found/tot:.1%}")
    res=[]
    for p in samp:
        w=norm_words(p); a=None
        for i in range(0,len(w)-n+1):
            h=idx.get(tuple(w[i:i+n]))
            if h: a=h[0]-i; break
        if a is None: res.append((None,p[:100])); continue
        seg=rw[max(0,a):max(0,a)+len(w)+2]
        d=Levenshtein.normalized_similarity(" ".join(w)," ".join(seg))
        res.append((round(d,3),p[:90].replace("\n"," ")))
    for r in res: print("   ",r)
if __name__=="__main__":
    pass
