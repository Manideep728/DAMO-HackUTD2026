"""M1: inventory the pinned legacy inputs and find what is referenced but missing. Computed from the files, not hardcoded."""
import re
from . import LEGACY

PIN = "d55eadf9ff05ee5a0ce7a077880da440ac3117d2"
UPSTREAM_SCRIPTS = {"check_bmc.sh", "check_cpu.sh", "check_fans.sh", "check_host.sh", "check_memory.sh", "check_temperature.sh"}  # repo listing at PIN


def analyse():
    plugins = {p.name for p in (LEGACY / "redfishplugins").glob("*")}
    cmds = (LEGACY / "objects" / "commands.cfg").read_text(errors="ignore")
    tmpl = (LEGACY / "objects" / "templates.cfg").read_text(errors="ignore")
    hosts = (LEGACY / "objects" / "hosts.cfg").read_text(errors="ignore")
    contacts = (LEGACY / "objects" / "contacts.cfg").read_text(errors="ignore")
    defined = set(re.findall(r"command_name\s+(\S+)", cmds))
    files = [{"path": f"redfishplugins/{p}", "kind": "Old check", "status": "pinned"} for p in sorted(plugins)]
    files += [{"path": f"objects/{n}", "kind": "Inherited config", "status": "pinned"} for n in ["commands.cfg", "templates.cfg", "hosts.cfg", "contacts.cfg"]]
    gaps = []
    referenced = sorted(set(re.findall(r"\$USER1\$/(\S+)", cmds)))
    standard = [s for s in referenced if "." not in s]           # stock Monitoring Plugins (check_ping, check_http…)
    siblings = [s for s in referenced if s in UPSTREAM_SCRIPTS and s not in plugins]  # in the TTU repo, other checks
    if standard:
        files.append({"path": f"{len(standard)} stock Monitoring Plugins", "kind": "External package", "status": "external", "note": ", ".join(standard[:6]) + "…"})
    if siblings:
        files.append({"path": ", ".join(siblings), "kind": "Other TTU checks", "status": "out of scope", "note": "In the upstream repo; not part of the temperature check."})
    for script in referenced:
        if script not in plugins and script not in standard and script not in siblings:
            users = re.findall(rf"command_name\s+(\S+)\s+command_line\s+\$USER1\$/{re.escape(script)}", cmds)
            gaps.append({"item": script, "status": "missing", "where": "commands.cfg" + (f" ({', '.join(users)})" if users else ""),
                         "impact": "Referenced as a command but not in the repo; services using it cannot be reproduced."})
    used = set(re.findall(r"check_command\s+(\S+?)(?:!|\s|$)", tmpl + hosts))
    for c in sorted(used - defined):
        gaps.append({"item": c, "status": "unsupported", "where": "templates.cfg / hosts.cfg", "impact": "Used as check_command but never defined in commands.cfg."})
    macros = sorted(set(re.findall(r"\$(USER(?!1\$)\d+)\$", cmds)))
    if macros:
        gaps.append({"item": "resource.cfg (" + ", ".join(f"${m}$" for m in macros) + ")", "status": "missing", "where": "notify-*-by-email commands",
                     "impact": "Macros are undefined, so the old notification path cannot be replayed as shipped."})
    gaps.append({"item": "nagios.cfg service_check_timeout", "status": "missing", "where": "not in repo",
                 "impact": "The plugin sets no curl timeout; a hung BMC is bounded only by this unknown value."})
    creds = sorted({m for p in (LEGACY / "redfishplugins").glob("*.sh") for m in re.findall(r"-u\s+(\S+:\S+)", p.read_text(errors="ignore"))})
    if creds:
        gaps.append({"item": "Hardcoded BMC credentials", "status": "flag", "where": "redfishplugins/*.sh", "impact": f"curl -u {', '.join(creds)} in every plugin; must move to a secret."})
    broken_jq = sorted(p.name for p in (LEGACY / "redfishplugins").glob("*.sh")
                       if re.search(r"jq\s+'[^']*\\\r?\n", p.read_text(errors="ignore")))
    if broken_jq:
        gaps.append({"item": "jq filter split with a backslash-newline", "status": "flag", "where": ", ".join(broken_jq),
                     "impact": "Inside single quotes the backslash reaches jq, which rejects the filter, so the check "
                               "reports UNKNOWN on every poll. Replays run it through a jq shim that removes the "
                               "line continuation (app/ttu/shims/jq)."})
    email = re.search(r"email\s+(\S+)", contacts)
    services = len(re.findall(r"define\s+service", hosts))
    host_names = re.findall(r"host_name\s+(\S+)", hosts)
    return {"pin": PIN, "files": files, "gaps": gaps, "facts": {"recipient": email.group(1) if email else None,
            "hosts": sorted(set(host_names)), "services": services, "commands_defined": len(defined), "scripts_referenced": len(referenced)}}
