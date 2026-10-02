import re,time,urllib.request,sys,os,collections
B="https://web.archive.org"
def get(u):
    for i in range(4):
        try:
            return urllib.request.urlopen(urllib.request.Request(u,headers={"User-Agent":"rtm-research"}),timeout=90).read().decode('utf8','ignore')
        except Exception as e: time.sleep(3)
    return ""
def norm(h): return re.sub(r'/web/\d+[a-z_]*/','/web/20131210101206/',h)
start=B+"/web/20131210101206/http://hillsborough.independent.gov.uk/report/"
q=collections.deque([start]); seen={start}; pages={}
while q:
    u=q.popleft(); t=get(u)
    path=re.sub(r'.*hillsborough.independent.gov.uk','',u)
    pages[path]=t; print(len(pages),path,len(t),flush=True)
    for h in re.findall(r'href="(/web/\d+[a-z_]*/http://hillsborough.independent.gov.uk/report/[^"#]*)"',t):
        h=norm(h)
        if 'appendices' in h or h.endswith('.pdf') or '/repository/' in h: continue
        full=B+h
        if full not in seen: seen.add(full); q.append(full)
import json; json.dump(pages,open("ref/hills/pages.json","w"))
print(len(pages)); print(sorted(pages)[:80])
