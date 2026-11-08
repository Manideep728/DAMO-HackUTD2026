import type { RuleCard, RuleCardStatement } from '../data/types';

const v = (runs: [string, string][]): RuleCardStatement['verification'] => ({ status: 'pending', runs: runs.map(([input, legacy]) => ({ input, legacy, expected: legacy, ok: true })) });

export const ruleCardStatements: RuleCardStatement[] = [
  { id: 's1', section: 'checks', text: 'Reads each rack\'s inlet temperature over SNMP (OID …52100.1.2.1.1.4.<rack>) on all 40 racks in hostgroup hall1-racks, every minute.', source: [{ file: 'commands.cfg', from: 3, to: 5 }, { file: 'services.cfg', from: 3, to: 6 }], verification: { status: 'pending', runs: [], note: 'Checked by reading the config, not by execution' } },
  { id: 's2', section: 'thresholds', text: 'Warns when the reading is outside 0–27 °C. In Nagios range syntax a bare "27" means alert when the value is below 0 or above 27.', source: [{ file: 'services.cfg', from: 5, to: 5 }, { file: 'commands.cfg', from: 5, to: 5 }], verification: v([['26.9 °C', 'OK'], ['27.0 °C', 'OK'], ['27.1 °C', 'WARNING'], ['-0.1 °C', 'WARNING']]) },
  { id: 's3', section: 'thresholds', text: 'Critical when the reading is outside 0–32 °C.', source: [{ file: 'services.cfg', from: 5, to: 5 }], verification: v([['32.0 °C', 'WARNING'], ['32.1 °C', 'CRITICAL'], ['-0.1 °C', 'CRITICAL']]) },
  { id: 's4', section: 'pages_when', text: 'Pages only after 3 consecutive failed checks one minute apart (max_check_attempts 3, retry_interval 1). A single bad reading is a soft state and sends nothing.', source: [{ file: 'services.cfg', from: 6, to: 8 }], verification: v([['26, 33, 26', 'no page'], ['33, 33, 33', 'page at 3rd']]) },
  { id: 's5', section: 'pages_when', text: 'An SNMP timeout returns UNKNOWN, and notification_options includes "u", so timeouts page.', source: [{ file: 'services.cfg', from: 10, to: 10 }, { file: 'commands.cfg', from: 5, to: 5 }], verification: v([['timeout', 'UNKNOWN'], ['noSuchObject', 'UNKNOWN']]) },
  { id: 's6', section: 'pages_who', text: 'Pages contact group "facilities", whose only member is rkowalski@northmark.example. That address is not on oncall_roster.csv.', source: [{ file: 'services.cfg', from: 11, to: 11 }, { file: 'contacts.cfg', from: 1, to: 12 }, { file: 'oncall_roster.csv', from: 1, to: 5 }], verification: { status: 'pending', runs: [], note: 'Cross-checked against the roster' } },
  { id: 's7', section: 'checks', text: 'Still checks D10, which inventory.csv marks decommissioned on 2024-03-18. Does not check D11, which is active.', source: [{ file: 'hosts.cfg', from: 3, to: 3 }, { file: 'inventory.csv', from: 10, to: 11 }], verification: { status: 'pending', runs: [], note: 'Cross-checked against the inventory' } },
  { id: 's8', section: 'ignores', text: 'Ignores trends, neighbouring racks, whether the sensor agrees with the outlet, and cooling unit power. A reading is judged alone, against a fixed number.', source: [{ file: 'commands.cfg', from: 3, to: 6 }], verification: { status: 'na', runs: [] } },
];

export const ruleCard: RuleCard = { checkId: 'check_rack_inlet', model: 'Nemotron Super', statements: ruleCardStatements, mode: 'mock' };

/** Planned-failure variant: the model misreads the critical threshold; execution catches it. */
export const flaggedStatement: RuleCardStatement = {
  ...ruleCardStatements[2],
  text: 'Critical when the reading is outside 0–30 °C.',
  verification: { status: 'pending', runs: [ { input: '30.1 °C', legacy: 'WARNING', expected: 'CRITICAL', ok: false }, { input: '32.1 °C', legacy: 'CRITICAL', expected: 'CRITICAL', ok: true } ], note: 'Card said critical above 30 °C. The plugin returned CRITICAL only above 32 °C.', corrected: 'Critical when the reading is outside 0–32 °C.' },
};
