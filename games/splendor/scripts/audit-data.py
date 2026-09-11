"""Cross-check pinned published datasets without executing downloaded code."""
import ast
import collections
import csv
import hashlib
import io
import json
from pathlib import Path
import re
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
COLORS = ["white", "blue", "green", "red", "black"]
SOURCES = {
    "mit_dataset": {
        "url": "https://raw.githubusercontent.com/roeey777/Splendor-AI/95f84d2e6e839c0ef09ca97bdc3b3048a792fb0b/src/splendor/splendor/splendor_utils.py",
        "sha256": "f4318e25da33ff14acab12cdad3e04377f1b2f5f89ac674dbebe07d118631444",
    },
    "splendimax_csv": {
        "url": "https://raw.githubusercontent.com/bouk/splendimax/5ffcb148ee0093e3b47f612b04a1927301ff13ee/Splendor%20Cards.csv",
        "sha256": "33e7e966758f73a6a236b8336f1ab7e9f057c8a55d33300671c9e918426cc2fb",
    },
    "photo_transcription": {
        "url": "https://raw.githubusercontent.com/anicolao/splendor/5b3efd26f2e460b1bef3839a058270b536a13648/data/verified_card_properties.csv",
        "sha256": "3e7025f64c7788a8021688099048aa4d21198a28286f3b227aa16fc805057f5b",
    },
    "seal256_nobles": {
        "url": "https://raw.githubusercontent.com/seal256/splendor/263abc066c563a1c89dba4bdc408446a20ad9d1d/pysplendor/splendor.py",
        "sha256": "4df17f4a5173f3849a2c9a38a69a411739dfb2986d543ccf9ce1a6456ea522ac",
    },
}


def load(name):
    source = SOURCES[name]
    with urllib.request.urlopen(source["url"], timeout=30) as response:
        content = response.read()
    if hashlib.sha256(content).hexdigest() != source["sha256"]:
        raise ValueError(f"Source hash changed: {name}")
    return content.decode("utf-8")


def signature(tier, color, points, cost):
    return (tier, color, points, *(cost.get(c, 0) for c in COLORS))


data = json.loads((ROOT / "data/base-game.json").read_text())
local = collections.Counter(signature(c["tier"], c["bonus"], c["points"], c["cost"]) for c in data["cards"])
tree = ast.parse(load("mit_dataset"))
values = {
    n.targets[0].id: ast.literal_eval(n.value)
    for n in tree.body
    if isinstance(n, ast.Assign) and isinstance(n.targets[0], ast.Name) and n.targets[0].id in ("CARDS", "NOBLES")
}
mit = collections.Counter(signature(t, c, p, costs) for c, costs, t, p in values["CARDS"].values())
csv_rows = list(csv.DictReader(io.StringIO(load("splendimax_csv"))))
csv_deck = collections.Counter(signature(int(r["Level"]), r["Color"].lower(), int(r["PV"]), {c: int(r[c.title()]) for c in COLORS}) for r in csv_rows)
photo_rows = list(csv.DictReader(io.StringIO(load("photo_transcription"))))
photo_deck = collections.Counter(signature(int(r["id"].split("-")[1][1:]), r["id"].split("-")[0], int(r["prestige_points"]), {c: int(r[c]) for c in COLORS}) for r in photo_rows)
assert sum(local.values()) == 90 and local == mit == csv_deck == photo_deck, "Card dataset mismatch"
local_nobles = collections.Counter(tuple(n["cost"].get(c, 0) for c in COLORS) for n in data["nobles"])
mit_nobles = collections.Counter(tuple(cost.get(c, 0) for c in COLORS) for _, cost in values["NOBLES"])
seal_source = load("seal256_nobles")
seal_line = next(line for line in seal_source.splitlines() if line.startswith("NOBLES ="))
notation = {"w": "white", "b": "blue", "g": "green", "r": "red", "k": "black"}
seal_nobles = []
for spec in re.findall(r"\[3\|([^\]]+)\]", seal_line):
    cost = {notation[c]: int(n) for c, n in re.findall(r"([wbgrk])(\d+)", spec)}
    seal_nobles.append(tuple(cost.get(c, 0) for c in COLORS))
assert len(seal_nobles) == 10 and local_nobles == mit_nobles == collections.Counter(seal_nobles), "Noble dataset mismatch"
report = {
    "date": "2026-09-12", "cards": 90, "nobles": 10, "card_mismatches": 0, "noble_mismatches": 0,
    "method": "Exact multiset comparison of tier, bonus, prestige and all five costs; exact noble cost multiset.",
    "limitation": "Agreement of community transcriptions is not a publisher certification or a full independent physical-card visual audit.",
    "local_catalog_sha256": hashlib.sha256((ROOT / "data/base-game.json").read_bytes()).hexdigest(), "sources": SOURCES,
}
(ROOT / "docs/data-audit.json").write_text(json.dumps(report, indent=2) + "\n")
print("90 cards and 10 nobles agree with pinned comparison sources. Report: docs/data-audit.json")
