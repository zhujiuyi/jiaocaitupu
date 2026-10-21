import json
from collections import Counter
t = json.load(open("data/topics.json", encoding="utf-8"))
en = [x for x in t if x.get("subject") == "english"]
c = Counter((x.get("grade"), x.get("semester")) for x in en)
for k in sorted(c, key=lambda z: (z[0], str(z[1]))):
    print("grade", k[0], "semester", k[1], "->", c[k])
print()
print("样例 chapter:", [x.get("chapter") for x in en if x.get("grade") == 9][:2])
print("样例 chapter:", [x.get("chapter") for x in en if x.get("grade") == 10][:2])
