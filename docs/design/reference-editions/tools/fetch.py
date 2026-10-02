import sys,time,urllib.request
def get(u,out):
    for i in range(5):
        try:
            d=urllib.request.urlopen(urllib.request.Request(u,headers={"User-Agent":"rtm-research"}),timeout=120).read()
            open(out,'wb').write(d); print(out,len(d)); return
        except Exception as e: err=e; time.sleep(5)
    print(out,"FAIL",err)
for a in sys.argv[1:]:
    u,o=a.split('=>'); get(u,o)
