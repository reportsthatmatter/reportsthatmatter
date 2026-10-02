import sys,difflib
sys.argv=[sys.argv[0]]+sys.argv[1:]
from score import toks
g=toks(open(sys.argv[1]).read()); h=toks(open(sys.argv[2]).read())
sm=difflib.SequenceMatcher(None,g,h,autojunk=False)
for op,i1,i2,j1,j2 in sm.get_opcodes():
    if op!='equal': print(op,' '.join(g[max(0,i1-2):i2+1]),'|',' '.join(h[max(0,j1-2):j2+1]))
