import sys, pikepdf, pdfplumber, json
path,outp=sys.argv[1],sys.argv[2]
pk=pikepdf.open(path); pl=pdfplumber.open(path)
pgnum={p.objgen:i+1 for i,p in enumerate(pk.pages)}
mc={}
for i,page in enumerate(pl.pages):
    for c in page.chars:
        if c.get('mcid') is not None: mc.setdefault((i+1,c['mcid']),[]).append(c['text'])
    page.flush_cache()
LEAF={'/P','/H1','/H2','/H3','/H4','/LI','/Note','/Footnote','/Body','/note','/Caption','/TD','/TH'}
out=[]
def collect(k,seen,buf,pg):
    if isinstance(k,pikepdf.Array):
        for x in k: collect(x,seen,buf,pg)
    elif isinstance(k,int): seen.add(pg); buf.append("".join(mc.get((pg,k),[])))
    elif isinstance(k,pikepdf.Dictionary):
        p=k.get('/Pg'); pn=pgnum.get(p.objgen) if p is not None else pg
        if '/MCID' in k: seen.add(pn); buf.append("".join(mc.get((pn,int(k.MCID)),[]))); return
        if '/K' in k: collect(k.K,seen,buf,pn)
def walk(k,pg):
    if isinstance(k,pikepdf.Array):
        for x in k: walk(x,pg)
    elif isinstance(k,pikepdf.Dictionary):
        p=k.get('/Pg'); pn=pgnum.get(p.objgen) if p is not None else pg
        t=str(k.get('/S','')); kids=k.get('/K')
        if t in LEAF or 'Heading' in t or t.startswith('/Body'):
            seen=set(); buf=[]; collect(kids,seen,buf,pn)
            txt="".join(buf).strip()
            if txt: out.append({'t':t,'p':sorted(seen),'x':txt})
        elif kids is not None: walk(kids,pn)
walk(pk.Root.StructTreeRoot.K,None)
json.dump(out,open(outp,'w'))
print(path,len(out))
