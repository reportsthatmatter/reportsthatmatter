import sys, collections, pikepdf
p=pikepdf.open(sys.argv[1])
root=p.Root.get('/StructTreeRoot')
if root is None: print("no StructTreeRoot"); sys.exit()
rm=root.get('/RoleMap')
cnt=collections.Counter(); depth=0; n=0
seq=[]
def walk(k,d=0):
    global n
    if isinstance(k,pikepdf.Array):
        for x in k: walk(x,d)
        return
    if not isinstance(k,pikepdf.Dictionary): return
    t=k.get('/S')
    if t is not None:
        t=str(t); cnt[t]+=1; n+=1
        if len(seq)<int(sys.argv[2]) : seq.append(("  "*min(d,6))+t)
    kids=k.get('/K')
    if kids is not None: walk(kids,d+1)
walk(root.get('/K'))
print(dict(cnt.most_common(25)))
print("rolemap:", {str(a):str(b) for a,b in (rm or {}).items()} if rm else None)
print("\n".join(seq[:int(sys.argv[2])]))
