"""Lines of code per area, for the audit reports in docs/audits/.

Counts TRACKED files only (git ls-files), so the generated bundle,
node_modules and anything gitignored are out by construction rather than by
an exclude list somebody has to remember to update.

Splits each file into code / comment / blank rather than reporting a single
total, because this codebase runs about a third comments by deliberate
policy and a bare line count would misrepresent it in both directions — it
overstates the code, and it hides that the prose is there.

The comment classifier is block-aware for the js family (it tracks whether
it is inside a slash-star run) and hash-based for Python. It is not a
parser: a `//` inside a string literal counts as code only because the line
does not START with it, and a line of code with a trailing comment counts
wholly as code. Both are the conservative direction — they never inflate
the comment share, which is the number most likely to be quoted.

`archive/` is counted but excluded from every total: it is reference
material, not built, not shipped, and folding it in would overstate the
project by a quarter.

Run:  python3 tools/audit/count-lines.py
"""
import subprocess, json, collections, os, sys
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
files = subprocess.check_output(["git","ls-files"], text=True).splitlines()
CODE_EXT = (".js",".jsx",".mjs",".cjs",".ts",".tsx",".py")

def area_of(p):
    if p.startswith("archive/"): return "archive (legacy, not built)"
    if p.startswith("frontend/"): return "frontend (React UI)"
    if p.startswith("backend/"): return "backend (browser domain sim)"
    if p.startswith("server/tests/"): return "server/tests"
    if p.startswith("server/"): return "server (Express API)"
    if p.startswith("tests/"): return "tests (browser + unit)"
    if p.startswith("financial-principles-tests/"): return "financial-principles-tests"
    if p.startswith("tools/"): return "tools (dev tooling)"
    if p.startswith("gloobal-essentials-preview/"): return "preview app (Vite shell)"
    if "/" not in p: return "root scripts"
    if p.startswith("docs/"): return "docs"
    return "other"

def classify(path):
    """total, blank, comment, code — block-comment aware for js-family."""
    total=blank=comment=code=0
    try:
        text=open(path, encoding="utf-8", errors="replace").read()
    except Exception:
        return 0,0,0,0
    py = path.endswith(".py")
    inblock=False
    for raw in text.splitlines():
        total+=1
        s=raw.strip()
        if not s: blank+=1; continue
        if py:
            if s.startswith("#"): comment+=1
            else: code+=1
            continue
        if inblock:
            comment+=1
            if "*/" in s: inblock=False
            continue
        if s.startswith("//"): comment+=1; continue
        if s.startswith("/*"):
            comment+=1
            if "*/" not in s: inblock=True
            continue
        code+=1
    return total,blank,comment,code

rows=collections.defaultdict(lambda: dict(files=0,total=0,blank=0,comment=0,code=0))
for p in files:
    if not p.endswith(CODE_EXT): continue
    a=area_of(p)
    t,b,c,k=classify(p)
    r=rows[a]; r["files"]+=1; r["total"]+=t; r["blank"]+=b; r["comment"]+=c; r["code"]+=k

order=["frontend (React UI)","backend (browser domain sim)","server (Express API)","preview app (Vite shell)","root scripts",
       "tests (browser + unit)","server/tests","financial-principles-tests","tools (dev tooling)","archive (legacy, not built)"]
print(f"{'area':<34}{'files':>6}{'total':>9}{'code':>9}{'comment':>9}{'blank':>8}{'cmt%':>7}")
print("-"*82)
ship=dict(files=0,total=0,code=0,comment=0,blank=0)
test=dict(files=0,total=0,code=0,comment=0,blank=0)
for a in order:
    r=rows.get(a)
    if not r: continue
    pct = round(100*r["comment"]/max(1,r["comment"]+r["code"]))
    print(f"{a:<34}{r['files']:>6}{r['total']:>9}{r['code']:>9}{r['comment']:>9}{r['blank']:>8}{pct:>6}%")
    bucket = test if ("test" in a) else (None if "archive" in a else ship)
    if bucket is not None:
        for k in ("files","total","code","comment","blank"): bucket[k]+=r[k]
print("-"*82)
for name,b in (("SHIPPED + TOOLING",ship),("TESTS",test)):
    pct=round(100*b["comment"]/max(1,b["comment"]+b["code"]))
    print(f"{name:<34}{b['files']:>6}{b['total']:>9}{b['code']:>9}{b['comment']:>9}{b['blank']:>8}{pct:>6}%")
grand=dict(files=0,total=0,code=0,comment=0,blank=0)
for a,r in rows.items():
    if "archive" in a: continue
    for k in grand: grand[k]+=r[k]
pct=round(100*grand["comment"]/max(1,grand["comment"]+grand["code"]))
print(f"{'ACTIVE REPO (excl. archive)':<34}{grand['files']:>6}{grand['total']:>9}{grand['code']:>9}{grand['comment']:>9}{grand['blank']:>8}{pct:>6}%")
if "--json" in sys.argv:
    json.dump({a: dict(r) for a, r in rows.items()}, sys.stdout, indent=1)
