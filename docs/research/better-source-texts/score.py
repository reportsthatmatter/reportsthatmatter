import re,sys,difflib,os
def norm(t):
    t=t.replace('&amp;','&')
    t=re.sub(r'(\w)-\n\s*(\w)',r'\1\2',t)
    t=re.sub(r'(\w)[\xad›]\s*(\w)',r'\1\2',t)
    t=re.sub(r'([a-z])- ([a-z])',r'\1\2',t)  # hyphenation left inside a joined line
    for a,b in [('’',"'"),('‘',"'"),('“','"'),('”','"'),('—','--'),('–','-')]: t=t.replace(a,b)
    t=re.sub(r'^#+ ','',t,flags=re.M)
    return t
def toks(t): return re.findall(r"[A-Za-z]+|\d+|[^\w\s]",norm(t))
def dist(a,b):
    sm=difflib.SequenceMatcher(None,a,b,autojunk=False); e=0
    for op,i1,i2,j1,j2 in sm.get_opcodes():
        if op!='equal': e+=max(i2-i1,j2-j1)
    return e
def score(gt,hyp):
    g=toks(open(gt).read()); h=toks(open(hyp).read())
    gw=[x for x in g if x[0].isalpha()]; hw=[x for x in h if x[0].isalpha()]
    gn=[x for x in g if x[0].isdigit()]; hn=[x for x in h if x[0].isdigit()]
    return dist(gw,hw)/len(gw), dist(gn,hn)/max(1,len(gn)), dist(g,h)/len(g), len(gw), len(gn)
if __name__=="__main__":
    pages=['ch11','ch29','js30','js40']
    srcs={'text layer (ours)':'outputs/layer/{p}.txt','tesseract 5.5':'outputs/tesseract/{p}.txt','docling+Apple Vision':'outputs/docling-applevision/{p}.md','docling granite VLM':'outputs/docling-granite-vlm/{p}.md'}
    print('| page | words | numbers | '+' | '.join(srcs)+' |')
    for p in pages:
        row=[]
        for k,f in srcs.items():
            f=f.format(p=p)
            if not os.path.exists(f): row.append('-'); continue
            w,n,a,nw,nn=score(f'gt/{p}.txt',f)
            row.append(f'{w*100:.1f}% / {n*100:.0f}%')
        print(f'| {p} | {nw} | {nn} | '+' | '.join(row)+' |')
