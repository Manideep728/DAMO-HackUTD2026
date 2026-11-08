"""Mock-mode payloads mirror the frontend fixtures so the UI behaves identically on either source."""
import json, pathlib, re
FE = pathlib.Path(__file__).resolve().parents[2] / "frontend" / "src" / "fixtures"
LEG = pathlib.Path(__file__).resolve().parents[2] / "legacy"
def source_files():
    return [{"file": f, "text": (LEG / f).read_text()} for f in ["services.cfg", "commands.cfg", "contacts.cfg", "hosts.cfg", "inventory.csv", "oncall_roster.csv"]]
def ts_block(name, file):  # pull a TS const's object literal as JSON-ish via a tiny evaluator (fixtures are plain literals)
    s = (FE / file).read_text(); m = re.search(rf"export const {name}[^=]*=\s*(\[.*?\]|\{{.*?\}});\n", s, re.S)
    return m.group(1) if m else None
RULES = re.search(r"export const rulesYaml = `([^`]*)`", (FE / "source.ts").read_text()).group(1)
ONESHOT = re.search(r"export const oneShotYaml = `([^`]*)`", (FE / "source.ts").read_text()).group(1)
