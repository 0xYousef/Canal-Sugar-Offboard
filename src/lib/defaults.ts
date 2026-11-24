// Default configuration and demo data. Everything here is only a starting point:
// reasons, groups, fields and SLA steps are all editable in Settings.
import type { Field, Reason, State, Step, Leaver } from './types'
import { DEFAULT_FLOW } from './flowDefaults'
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))

export const REASONS: Reason[] = [
  { id: 'R01', name: 'Resignation', notice: true },
  { id: 'R02', name: 'Probation Termination', notice: false },
  { id: 'R03', name: 'Contract Expiry (Fixed-term / Task)', notice: false },
  { id: 'R04', name: 'Open-ended Contract Termination', notice: true },
  { id: 'R05', name: 'Disciplinary Termination', notice: false },
  { id: 'R06', name: 'Mutual Separation', notice: false },
  { id: 'R07', name: 'Retirement', notice: false },
  { id: 'R08', name: 'Disability', notice: false },
  { id: 'R09', name: 'Death', notice: false },
  { id: 'R10', name: 'Economic / Structural', notice: false },
];

export const GROUPS: string[] = ['HR', 'Direct Manager', 'Legal', 'IT', 'Security', 'Admin & Fleet', 'Warehouse', 'HSE', 'Payroll', 'Finance'];

export const DEPARTMENTS = ['Sales', 'Operations', 'Finance', 'HR', 'IT', 'Legal', 'Security', 'Warehouse', 'HSE', 'Payroll', 'Admin & Fleet']

// Field types: text | textarea | number | date | select | checkbox | reason (built-in, uses the reasons list)
export const FIELDS: Field[] = [
  { key: 'name', label: 'Employee name', type: 'text', section: 'Employee', builtin: true, required: true, requiredFor: [], showInList: true },
  { key: 'empId', label: 'Employee ID', type: 'text', section: 'Employee', builtin: false, required: false, requiredFor: [], showInList: false },
  { key: 'dept', label: 'Department', type: 'select', options: DEPARTMENTS, section: 'Employee', builtin: false, required: false, requiredFor: [], showInList: true },
  { key: 'site', label: 'Site', type: 'text', section: 'Employee', builtin: false, required: false, requiredFor: [], showInList: false },
  { key: 'reason', label: 'Reason for leaving', type: 'reason', section: 'Employee', builtin: true, required: true, requiredFor: [], showInList: true },
  { key: 'hireDate', label: 'Hire date', type: 'date', section: 'Dates', builtin: false, required: false, requiredFor: ['R01', 'R04'], showInList: false },
  { key: 'requestDate', label: 'Date request received', type: 'date', section: 'Dates', builtin: false, required: true, requiredFor: [], showInList: false },
  { key: 'approvalDate', label: 'Date approved', type: 'date', section: 'Dates', builtin: false, required: false, requiredFor: [], showInList: false, fallback: 'requestDate' },
  { key: 'lwd', label: 'Last working day', type: 'date', section: 'Dates', builtin: false, required: true, requiredFor: [], showInList: true, fallback: 'termDate' },
  { key: 'termDate', label: 'Termination date', type: 'date', section: 'Dates', builtin: false, required: false, requiredFor: [], showInList: false, fallback: 'lwd' },
  { key: 'probEnd', label: 'Probation end date', type: 'date', section: 'Dates', builtin: false, required: false, requiredFor: ['R02'], showInList: false },
  { key: 'contractEnd', label: 'Contract end date', type: 'date', section: 'Dates', builtin: false, required: false, requiredFor: ['R03'], showInList: false },
  { key: 'certDate', label: 'Certificate requested on', type: 'date', section: 'Dates', builtin: false, required: false, requiredFor: [], showInList: false },
  { key: 'notes', label: 'HR notes', type: 'textarea', section: 'Other', builtin: false, required: false, requiredFor: [], showInList: false },
];

const ALL = 'YYYYYYYYYY';
function parseStart(s: string): Step['start'] {
  if (!s) return { type: 'none' }
  const [t, v] = s.split(':')
  return t === 'f' ? { type: 'field', field: v } : { type: 'step', step: v }
}
// start: 'f:<fieldKey>' | 's:<stepId>' | ''   ap: 10-char Y/. string over REASONS order
function S(id: string, group: string, name: string, start: string, days: number | null, when: 'After' | 'Before', unit: 'WD' | 'CD', ap?: string): Step {
  const st: Step = { id, active: true, group, name, start: parseStart(start), days, when, unit, applies: { mode: 'all', reasons: [] }, condition: null };
  if (ap && ap !== ALL) st.applies = { mode: 'reasons', reasons: REASONS.filter((_r, i) => ap[i] === 'Y').map((r) => r.id) };
  return st;
}

export const STEPS: Step[] = [
  S('HR-01', 'HR', 'Register termination request / decision', 'f:requestDate', 1, 'After', 'WD'),
  S('HR-02', 'HR', 'Resignation approved at Labour Office; cooling-off (10 days) cleared [OFB-01]', 'f:requestDate', 10, 'After', 'CD', 'Y.........'),
  S('HR-03', 'HR', 'Notify IT, Security & Payroll of the decision', 'f:approvalDate', 1, 'After', 'CD'),
  S('HR-04', 'HR', 'Fixed-term / task contract: renewal or non-renewal alert', 'f:contractEnd', 60, 'Before', 'CD', '..Y.......'),
  S('HR-05', 'HR', 'Disability: authority decision received & no alternative job confirmed', '', null, 'After', 'CD', '.......Y..'),
  S('HR-06', 'HR', 'Calculate service period & leave balance with Payroll', 'f:termDate', 1, 'After', 'WD'),
  S('HR-07', 'HR', 'Clearance Form completed & signed by all departments [OFB-03]', 'f:lwd', 1, 'After', 'WD'),
  S('HR-08', 'HR', 'Service certificate issued & original documents returned [OFB-05]', 'f:certDate', 15, 'After', 'CD'),
  S('HR-09', 'HR', 'Social insurance Form 6 issued & delivered', 'f:certDate', 15, 'After', 'CD'),
  S('HR-10', 'HR', 'Close & archive personnel file [OFB-06]', 's:FIN-02', 30, 'After', 'CD'),
  S('MGR-01', 'Direct Manager', 'Probation: documented evaluation report before probation ends', 'f:probEnd', 0, 'After', 'CD', '.Y........'),
  S('MGR-02', 'Direct Manager', 'Work handover protocol signed by employee, successor & manager', 'f:lwd', 0, 'After', 'CD', 'YYYYYYYY.Y'),
  S('LGL-01', 'Legal', 'Disciplinary: legal review of the full investigation file before action', 'f:approvalDate', 0, 'After', 'CD', '....Y.....'),
  S('LGL-02', 'Legal', 'Mutual separation agreement drafted / reviewed', 'f:approvalDate', 0, 'After', 'CD', '.....Y....'),
  S('LGL-03', 'Legal', 'Death: inheritance deed (and guardianship order if minors) verified', '', null, 'After', 'CD', '........Y.'),
  S('IT-01', 'IT', 'Laptop, screens & hardware received; data moved to successor', 'f:lwd', 0, 'After', 'CD'),
  S('IT-02', 'IT', 'Email, VPN & system access revoked', 'f:lwd', 0, 'After', 'CD'),
  S('SEC-01', 'Security', 'All site access permits cancelled', 'f:lwd', 0, 'After', 'CD'),
  S('ADM-01', 'Admin & Fleet', 'Company car, fuel card, keys & housing received', 'f:lwd', 0, 'After', 'CD'),
  S('WH-01', 'Warehouse', 'Items / custody issued to the employee received', 'f:lwd', 0, 'After', 'CD'),
  S('HSE-01', 'HSE', 'Safety equipment / PPE issued to the employee received', 'f:lwd', 0, 'After', 'CD'),
  S('PAY-01', 'Payroll', 'Final settlement sheet prepared & reviewed with Legal [OFB-04]', 'f:termDate', 3, 'After', 'WD'),
  S('FIN-01', 'Finance', 'Death: urgent funeral grant paid', 'f:requestDate', 1, 'After', 'WD', '........Y.'),
  S('FIN-02', 'Finance', 'Final settlement paid to employee', 'f:termDate', 7, 'After', 'WD'),
];

export function defaultHolidays() {
  const out: { date: string; name: string }[] = [];
  [2026, 2027].forEach((y) =>
    [['01-07', 'Coptic Christmas'], ['01-25', 'Revolution & Police Day'], ['04-25', 'Sinai Liberation Day'], ['05-01', 'Labour Day'], ['06-30', 'June 30 Revolution'], ['07-23', 'July 23 Revolution'], ['10-06', 'Armed Forces Day']].forEach((h) =>
      out.push({ date: y + '-' + h[0], name: h[1] })
    )
  );
  return out;
}

function demoLeavers(): Leaver[] {
  return [
    {
      id: 'l1',
      values: { name: 'Ahmed Mohamed Ali', empId: '10045', dept: 'Sales', site: 'Cairo HQ', hireDate: '2019-03-10', reason: 'R01', requestDate: '2026-08-30', approvalDate: '2026-09-10', lwd: '2026-10-29', termDate: '2026-10-30', notes: 'Demo record' },
      tasks: {
        'HR-01': { s: 'done', d: '2026-08-31' }, 'HR-02': { s: 'done', d: '2026-09-08' }, 'HR-03': { s: 'done', d: '2026-09-13' },
        'MGR-02': { s: 'done', d: '2026-10-28' }, 'IT-01': { s: 'done', d: '2026-10-29' }, 'IT-02': { s: 'done', d: '2026-10-29' },
        'SEC-01': { s: 'done', d: '2026-10-29' }, 'WH-01': { s: 'done', d: '2026-10-30' }, 'HSE-01': { s: 'done', d: '2026-10-29' }, 'ADM-01': { s: 'done', d: '2026-11-02' },
      },
    },
    {
      id: 'l2',
      values: { name: 'Sara Mahmoud Hassan', empId: '10112', dept: 'Operations', site: '10th of Ramadan Plant', hireDate: '2025-01-15', reason: 'R03', requestDate: '2026-10-28', approvalDate: '2026-12-31', lwd: '2026-12-31', termDate: '2026-12-31', contractEnd: '2026-12-31', notes: 'Demo record' },
      tasks: { 'HR-01': { s: 'done', d: '2026-10-29' }, 'HR-03': { s: 'done', d: '2026-10-30' } },
    },
    {
      id: 'l3',
      values: { name: 'Omar Hassan Fathy', empId: '10230', dept: 'Finance', site: 'Cairo HQ', hireDate: '2026-07-01', reason: 'R02', requestDate: '2026-11-01', approvalDate: '2026-11-15', lwd: '2026-11-15', termDate: '2026-11-30', probEnd: '2026-11-30', notes: 'Demo record' },
      tasks: {},
    },
  ];
}

export function defaultState(): State {
  return clone<State>({
    version: 2,
    settings: {
      weekend: 'FS', dueSoon: 2, reportDate: '', holidays: defaultHolidays(),
      notice: { hireField: 'hireDate', requestField: 'requestDate', endField: 'termDate', years: 10, short: 2, long: 3 },
      flow: DEFAULT_FLOW,
    },
    reasons: REASONS, groups: GROUPS, fields: FIELDS, steps: STEPS, leavers: import.meta.env.VITE_SEED_DEMO ? demoLeavers() : [],
  });
}
