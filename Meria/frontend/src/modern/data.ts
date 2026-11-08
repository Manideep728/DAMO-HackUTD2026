/**
 * Demo data for the modernization (M1–M5) and operations (R1–R5) workflows.
 *
 * Legacy facts come from the public TTU Nagios–Redfish integration
 * (github.com/nsfcac/Nagios-Redfish-API-Integration, BSD-3-Clause; Texas Tech University HPCC and Dell).
 * Everything marked `demo: true` (asset map, owners, runbook, scenario readings) is ours, written for this demo.
 */

export const REPO = 'nsfcac/Nagios-Redfish-API-Integration';
export const REPO_URL = 'https://github.com/nsfcac/Nagios-Redfish-API-Integration';

// ---------------------------------------------------------------- M1 · inputs
export type InputStatus = 'pinned' | 'missing' | 'unsupported' | 'flag';
export interface LegacyInput { id: string; name: string; kind: string; status: InputStatus; source: string; note: string; demo?: boolean }

export const inputs: LegacyInput[] = [
  { id: 'temp', name: 'redfishplugins/check_temperature.sh', kind: 'Old check', status: 'pinned', source: `${REPO}@master`, note: 'Reads Chassis/<first>/Thermal over Redfish, maps Status.Health to an exit code.' },
  { id: 'bmc', name: 'redfishplugins/check_bmc.sh', kind: 'Old check', status: 'pinned', source: `${REPO}@master`, note: 'Reads Managers/<first>.Status.Health (exact match).' },
  { id: 'cmds', name: 'objects/commands.cfg', kind: 'Inherited config', status: 'pinned', source: `${REPO}@master`, note: 'check-temperature → $USER1$/check_temperature.sh $HOSTADDRESS$' },
  { id: 'tmpl', name: 'objects/templates.cfg', kind: 'Inherited config', status: 'pinned', source: `${REPO}@master`, note: 'local-service: max_check_attempts 4, check_interval 5, retry_interval 1.' },
  { id: 'hosts', name: 'objects/hosts.cfg', kind: 'Inherited config', status: 'pinned', source: `${REPO}@master`, note: 'Compute1–3 (10.9.1.1–3), each with a "check temperature" service.' },
  { id: 'contacts', name: 'objects/contacts.cfg', kind: 'Inherited config', status: 'pinned', source: `${REPO}@master`, note: 'admins → nagiosadmin → nagios@localhost.' },
  { id: 'assets', name: 'assets.csv', kind: 'Asset / owner map', status: 'pinned', source: 'site export', note: '3 assets with rack, owner team, on-call primary and fallback.', demo: true },
  { id: 'runbook', name: 'runbooks/high-cpu-temperature.md', kind: 'Procedure', status: 'pinned', source: 'site wiki', note: 'Triage, fan check, drain request, recovery criteria.', demo: true },
  { id: 'health-py', name: 'check_*_health.py (5 scripts)', kind: 'Old check', status: 'missing', source: 'referenced in commands.cfg', note: 'Defined as commands but not in the repo. Services using them cannot be reproduced.' },
  { id: 'alive', name: 'check-host-alive', kind: 'Inherited config', status: 'unsupported', source: 'templates.cfg', note: 'Used by a host template but never defined in commands.cfg.' },
  { id: 'resource', name: 'resource.cfg ($USER5/7/9/10)', kind: 'Inherited config', status: 'missing', source: 'notify-*-by-email', note: 'Email macros are undefined, so the old notification path cannot be replayed as shipped.' },
  { id: 'timeout', name: 'nagios.cfg service_check_timeout', kind: 'Inherited config', status: 'missing', source: 'not in repo', note: 'The plugin sets no curl timeout, so a hung BMC is bounded only by this unknown value.' },
  { id: 'creds', name: 'Hardcoded BMC credentials', kind: 'Security', status: 'flag', source: 'check_temperature.sh, check_bmc.sh', note: 'curl -u root:redfish in every plugin. Must move to a secret before release.' },
];

export const pluginSnippet = `chassis_uri=$(curl -k https://$1/redfish/v1/Chassis/ -u root:redfish \\
  | jq '.Members|.[0]|."@odata.id"' | sed 's/"//g')
health=$(curl -k https://$1$chassis_uri/Thermal/ -u root:redfish \\
  | jq '.Temperatures[]|(.Name,.ReadingCelsius,(.Status|.Health))' | sed 's/"//g')

if [[ $health == *"Critical"* ]] ; then
  severity='Critical'
elif [[ $health == *"Warning"* ]]; then
  severity='Warning'
elif [[ $health = *"OK"* ]]; then
  severity='OK'
fi
# OK → exit 0 · Warning → exit 1 · Critical → exit 2
# else: echo "UNKNOWN-Plugin was unable to determine the status for the host CPU temperatures!"; exit 3`;

export const templateSnippet = `define service {
    name                    local-service
    use                     generic-service
    max_check_attempts      4
    check_interval          5
    retry_interval          1
}
define service {            ; parent
    name                    generic-service
    contact_groups          admins
    notification_options    w,u,c,r
    notification_interval   60
    notification_period     24x7
}`;

export interface Asset { id: string; host: string; bmc: string; rack: string; owner: string; primary: string; fallback: string; workload: string }
export const assets: Asset[] = [
  { id: 'hpc-c1', host: 'Compute1', bmc: '10.9.1.1', rack: 'R12 · U14', owner: 'HPC Ops', primary: 'Luis O.', fallback: 'Priya N.', workload: 'Research Computing (job owner)' },
  { id: 'hpc-c2', host: 'Compute2', bmc: '10.9.1.2', rack: 'R12 · U16', owner: 'HPC Ops', primary: 'Luis O.', fallback: 'Priya N.', workload: 'Research Computing (job owner)' },
  { id: 'hpc-c3', host: 'Compute3', bmc: '10.9.1.3', rack: 'R13 · U02', owner: 'Platform', primary: 'Dev K.', fallback: 'Priya N.', workload: 'Platform (job owner)' },
];

// ---------------------------------------------------------------- M2 · behavior and intent
export interface Behavior { id: string; area: string; text: string; source: string }
export const behaviors: Behavior[] = [
  { id: 'b1', area: 'States', text: 'Severity is a substring match over every Thermal sensor\'s Status.Health: any Critical → CRITICAL (2), else any Warning → WARNING (1), else OK (0).', source: 'check_temperature.sh · state mapping' },
  { id: 'b2', area: 'Threshold', text: 'No Celsius threshold. ReadingCelsius is printed, never compared. The BMC decides what "too hot" means.', source: 'check_temperature.sh · jq output' },
  { id: 'b3', area: 'Missing data', text: 'Empty or unparseable Thermal response → UNKNOWN (3): "Plugin was unable to determine the status for the host CPU temperatures!"', source: 'check_temperature.sh · else branch' },
  { id: 'b4', area: 'Missing data', text: 'Unreachable BMC → same UNKNOWN. No curl timeout, so a hang lasts until the Nagios service timeout (not shipped).', source: 'check_temperature.sh · curl -k' },
  { id: 'b5', area: 'Retries', text: 'A non-OK result is SOFT, rechecked every 1 min; it becomes HARD and notifies on the 4th consecutive failure (~3 min). OK results are checked every 5 min.', source: 'templates.cfg · local-service' },
  { id: 'b6', area: 'Recovery', text: 'A recovery notification is sent when the service returns to OK; problems re-notify every 60 min.', source: 'templates.cfg · generic-service w,u,c,r / 60' },
  { id: 'b7', area: 'Recipients', text: 'All services notify contact group admins → nagiosadmin → nagios@localhost, a placeholder address.', source: 'contacts.cfg · admins' },
];

export interface Decision { id: string; title: string; detail: string; critical: boolean; options: { id: string; label: string; kind: 'preserve' | 'change' }[]; recommended: string }
export const decisions: Decision[] = [
  { id: 'd1', critical: true, title: 'Who should actually be paged?', detail: 'The inherited recipient is nagios@localhost, a placeholder. Unresolved, this blocks acceptance.', options: [{ id: 'owner', label: 'Route by asset owner map (primary, then fallback)', kind: 'change' }, { id: 'keep', label: 'Keep admins / nagiosadmin', kind: 'preserve' }], recommended: 'owner' },
  { id: 'd2', critical: false, title: 'Keep BMC-health semantics, or add a local Celsius limit?', detail: 'The old check trusts the BMC. A local limit needs an operator rationale, owner and test before it can be added.', options: [{ id: 'keep', label: 'Preserve BMC Health mapping (no °C limit yet)', kind: 'preserve' }, { id: 'limit', label: 'Add a local limit (capture rationale first)', kind: 'change' }], recommended: 'keep' },
  { id: 'd3', critical: false, title: 'Missing temperature feed', detail: 'Old behavior: UNKNOWN, and it pages like any problem. Missing telemetry is not healthy.', options: [{ id: 'keep', label: 'Preserve: missing feed alerts as Unknown', kind: 'preserve' }, { id: 'ok', label: 'Treat missing feed as OK', kind: 'change' }], recommended: 'keep' },
  { id: 'd4', critical: false, title: 'Bound the Redfish request time', detail: 'The plugin has no timeout. Proposed: 10 s per request, and a timeout counts as missing data.', options: [{ id: 'timeout', label: 'Add a 10 s timeout → Unknown', kind: 'change' }, { id: 'keep', label: 'Keep unbounded', kind: 'preserve' }], recommended: 'timeout' },
  { id: 'd5', critical: false, title: 'BMC credentials', detail: 'root:redfish is hardcoded in every plugin.', options: [{ id: 'secret', label: 'Move to a secret reference', kind: 'change' }, { id: 'keep', label: 'Keep inline', kind: 'preserve' }], recommended: 'secret' },
  { id: 'd6', critical: false, title: 'Warn before the BMC flips Critical?', detail: 'The old check only pages once the BMC reports thermal Critical. A stalled fan is visible in the same Redfish Thermal response minutes earlier.', options: [{ id: 'early', label: 'Add a fan-stall early warning (new, tested)', kind: 'change' }, { id: 'keep', label: 'Keep thermal-only paging', kind: 'preserve' }], recommended: 'early' },
];

// ---------------------------------------------------------------- M3 · generated change
export const preserved = [
  'Severity comes from the BMC\'s Thermal Status.Health; the worst sensor wins',
  'No local Celsius threshold (decision d2)',
  'Missing or unparseable feed alerts as Unknown (decision d3)',
  'Hard state after 4 consecutive failures at 1 min retry (for: 3m)',
  'Recovery notifications and 60 min re-notify',
];
export const changed = [
  'Recipients come from the asset owner map, primary then fallback, instead of nagios@localhost (d1)',
  '10 s Redfish timeout, counted as missing data (d4)',
  'Credentials read from a secret, not inline (d5)',
  'Every alert carries asset_id, rack and owner labels',
  'New: fan-stall early warning, minutes before the BMC flips thermal Critical (d6)',
];

const rulesCommon = (forClause: string) => `groups:
- name: ttu-redfish-temperature
  rules:
  - alert: ThermalHealthCritical        # legacy exit 2
    expr: max by (asset_id) (redfish_thermal_health) == 2
${forClause}    labels: { severity: critical }
  - alert: ThermalHealthWarning         # legacy exit 1
    expr: max by (asset_id) (redfish_thermal_health) == 1
${forClause}    labels: { severity: warning }
  - alert: ThermalFeedMissing           # legacy exit 3 (UNKNOWN)
    expr: redfish_thermal_scrape_success == 0
${forClause}    labels: { severity: unknown }`;

export const rulesV1 = rulesCommon('');
export const rulesV2 = rulesCommon('    for: 3m                             # 4 attempts × 1 min retry\n') + `
  - alert: FanStalledEarlyWarning       # new (d6): warns before thermal Critical
    expr: min by (asset_id) (redfish_fan_rpm) == 0
    for: 1m
    labels: { severity: warning }`;

export const routesV1 = `route:
  receiver: admins
  group_by: [asset_id, alertname]
  repeat_interval: 60m                  # notification_interval 60`;
export const routesV2 = `route:
  receiver: oncall-fallback
  group_by: [asset_id, alertname]
  repeat_interval: 60m                  # notification_interval 60
  routes:
  - matchers: [ owner="HPC Ops" ]
    receiver: hpc-ops-primary           # from assets.csv
  - matchers: [ owner="Platform" ]
    receiver: platform-primary`;

export const collectorSnippet = `# gauntlet-redfish-collector.yaml (generated)
targets_from: assets.csv                # asset_id, bmc, owner, rack
credentials: secret://bmc/redfish       # was: -u root:redfish
timeout: 10s                            # was: none
thermal:
  path: /redfish/v1/Chassis/{first}/Thermal
  emit:
    redfish_thermal_health: Status.Health   # OK=0 Warning=1 Critical=2
    redfish_thermal_reading_celsius: ReadingCelsius
    redfish_thermal_scrape_success: 1 if parsed else 0`;

// ---------------------------------------------------------------- M4 · tests
export type Verdict = 'pass' | 'fail';
export interface CaseResult { missedExtra: Verdict; severity: Verdict; timing: Verdict; recipient: Verdict; recovery: Verdict; note?: string }
export interface TestCase { id: string; name: string; scenario: string; legacy: string; expected: string; v1: CaseResult; v2: CaseResult }
const ok: CaseResult = { missedExtra: 'pass', severity: 'pass', timing: 'pass', recipient: 'pass', recovery: 'pass' };

export const cases: TestCase[] = [
  { id: 'c1', name: 'Normal', scenario: 'All sensors Health OK for 60 min', legacy: 'No alert', expected: 'No alert', v1: ok, v2: ok },
  { id: 'c2', name: 'Sustained Critical', scenario: 'CPU1 Temp Health Critical for 20 min on Compute2', legacy: 'CRITICAL, HARD at +3 min', expected: 'Critical at +3 min to HPC Ops primary', v1: { ...ok, recipient: 'fail', timing: 'fail', note: 'Fired at +0 min, sent to admins' }, v2: ok },
  { id: 'c3', name: 'Brief spike', scenario: 'Critical for 90 s, then OK', legacy: 'SOFT only, no notification', expected: 'No alert', v1: { ...ok, missedExtra: 'fail', note: 'Extra alert: no for: clause' }, v2: ok },
  { id: 'c4', name: 'Missing temperature feed', scenario: 'Thermal returns empty for 15 min', legacy: 'UNKNOWN, HARD at +3 min', expected: 'Unknown at +3 min to HPC Ops primary', v1: { ...ok, recipient: 'fail', timing: 'fail', note: 'Fired at +0 min, sent to admins' }, v2: ok },
  { id: 'c5', name: 'Recovery', scenario: 'Critical for 10 min, then OK', legacy: 'CRITICAL, then RECOVERY', expected: 'Critical, then resolved notice', v1: { ...ok, recipient: 'fail', note: 'Resolved notice sent to admins' }, v2: ok },
  { id: 'c6', name: 'Fan stops before heat', scenario: 'Fan 4 at 0 RPM from minute 4; CPU Health Critical from minute 9', legacy: 'CRITICAL, HARD at +13 min', expected: 'Early warning by +6 min, then Critical', v1: { ...ok, missedExtra: 'fail', timing: 'fail', recipient: 'fail', note: 'Missed early warning; Critical at +0 min to admins' }, v2: { ...ok, note: 'Early warning 8 min before the old check paged' } },
];
export const decoy = { name: 'Alert-on-everything decoy', detail: 'A candidate that fires Critical for every asset at every evaluation.', result: 'Fails Normal and Brief spike (extra alerts) and severity on Missing feed. The suite has teeth.' };
export const heldOut = [
  { id: 'h1', name: 'Warning escalates to Critical', v1: 'fail' as Verdict, v2: 'pass' as Verdict },
  { id: 'h2', name: 'Feed flaps every 2 min', v1: 'fail' as Verdict, v2: 'pass' as Verdict },
  { id: 'h3', name: 'Platform-owned asset', v1: 'fail' as Verdict, v2: 'pass' as Verdict },
];

export const repairNotes = [
  { failure: 'Brief spike pages; alerts fire at +0 min instead of after the debounce', diagnosis: 'The old check needs 4 consecutive failures at 1 min retry before HARD. v1 has no for: clause.', fix: 'Add for: 3m to the three thermal rules.' },
  { failure: 'Fan stops before heat: early warning missed', diagnosis: 'Decision d6 approved a fan-stall warning; v1 has no rule for it.', fix: 'Add FanStalledEarlyWarning: min(redfish_fan_rpm) == 0 for 1m.' },
  { failure: 'Recipient wrong on 3 cases', diagnosis: 'Route sends everything to admins. Decision d1 says route by the asset owner map.', fix: 'Add owner matchers → hpc-ops-primary / platform-primary, with fallback receiver.' },
];

// ---------------------------------------------------------------- R1–R5 · operations scenario
export type Freshness = 'fresh' | 'stale' | 'missing';
export interface OpsEvent { t: string; kind: 'telemetry' | 'alert' | 'delivery' | 'dedupe' | 'workorder' | 'note' | 'escalation' | 'info'; text: string; tone?: 'critical' | 'warning' | 'ok' | 'muted' }

/** Scripted night: each step reveals one event. Interaction steps wait for the operator. */
export const opsScript: OpsEvent[] = [
  { t: '02:06:00', kind: 'telemetry', text: 'Compute2 · Fan4 reading 0 RPM (Redfish Thermal.Fans). CPU Health still OK.', tone: 'warning' },
  { t: '02:07:00', kind: 'alert', text: 'FanStalledEarlyWarning fired for hpc-c2: 6 min before the old check would page.', tone: 'warning' },
  { t: '02:10:00', kind: 'telemetry', text: 'Compute2 · CPU1 Temp Status.Health = Critical (reported 91 °C). Compute1 OK. Compute3: no Thermal sample since 02:04, marked stale, not healthy.', tone: 'critical' },
  { t: '02:11:00', kind: 'telemetry', text: 'Compute2 still Critical (1/4)', tone: 'muted' },
  { t: '02:13:00', kind: 'alert', text: 'ThermalHealthCritical fired for hpc-c2 (for: 3m satisfied). Evaluated by deterministic rules.', tone: 'critical' },
  { t: '02:13:02', kind: 'delivery', text: 'Page → Luis O. (HPC Ops primary): FAILED, receiver returned 503', tone: 'critical' },
  { t: '02:13:05', kind: 'delivery', text: 'Fallback SMS → Priya N.: DELIVERED', tone: 'ok' },
  { t: '02:13:05', kind: 'workorder', text: 'Work order WO-1042 opened for hpc-c2 · R12 · U16' },
  { t: '02:15:00', kind: 'dedupe', text: 'Duplicate: CPU2 Temp also Critical on hpc-c2. Grouped into the same incident; WO-1042 reused, no new work order.', tone: 'muted' },
];

export const techNote = { occurred: '02:31', entered: '02:40', author: 'Ana P. (technician)', text: 'Front panel: fan 3 not spinning. Cold-aisle inlet feels normal. Did not touch the server.', correction: { at: '02:44', text: 'Correction: fan 4, not fan 3 (bay labels are swapped on this chassis).' } };

export const evidence = [
  { id: 'e1', label: 'redfish_thermal_health{asset_id="hpc-c2"} = 2 since 02:10', source: 'telemetry', supports: 'Overheating' },
  { id: 'e2', label: 'Fan4 reading 0 RPM since 02:06; Fan1–3, 5–6 normal', source: 'telemetry', supports: 'Fan failure' },
  { id: 'e3', label: 'Rack R12 inlet 22.4 °C (neighbour sensors normal)', source: 'telemetry', supports: 'Not a room problem' },
  { id: 'e4', label: 'Technician note 02:31 (corrected 02:44): fan 4 not spinning, inlet normal', source: 'logbook', supports: 'Fan failure' },
  { id: 'e5', label: 'Runbook §3: a single failed fan can raise CPU temperature within minutes under load', source: 'runbook', supports: 'Fan failure' },
];

export const hypotheses = [
  { id: 'h1', title: 'Fan 4 failed; the CPU is genuinely hot', confidence: 'Likely', cites: ['e2', 'e4', 'e5', 'e1'], against: 'Only one host affected, consistent with a local cause.' },
  { id: 'h2', title: 'Thermal sensor is misreporting', confidence: 'Unresolved', cites: ['e3'], against: 'Normal inlet does not prove the CPU sensor wrong: CPU temperature can rise with normal inlet if a fan fails. Verify, do not conclude.' },
];

export const nextTask = { role: 'Technician (HPC Ops)', owner: 'Ana P., per shift map', task: 'Replace or reseat fan 4 on Compute2, then take a fresh Redfish Thermal reading.', needsApproval: 'Draining jobs off Compute2 needs the workload owner (Research Computing). Nemotron cannot request it on its own.' };

export const opsAcceptance = [
  { id: 'a1', text: 'Model outage still produces alerts' },
  { id: 'a2', text: 'Receiver failure triggers fallback' },
  { id: 'a3', text: 'Conflicting evidence stays uncertain' },
  { id: 'a4', text: 'Duplicate events do not duplicate work orders' },
  { id: 'a5', text: 'Closing a ticket without recovery evidence does not close the incident' },
];
