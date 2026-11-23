import type { ReactNode } from 'react'
import { Button, Checkbox, Chip, Input, Label, ListBox, Modal, ProgressBar, Select, TextArea, TextField, Switch } from '@heroui/react'

type Tone = 'success' | 'warning' | 'danger' | 'default' | 'accent'
const TONE: Record<string, Tone> = {
  Done: 'success', 'On Time': 'success', Completed: 'success', OK: 'success',
  Late: 'warning', 'Due Soon': 'warning', 'Missing data': 'warning',
  'Short Notice': 'danger', Overdue: 'danger', Breached: 'danger',
  Blocked: 'default', 'In Progress': 'accent', 'Set Reason': 'warning',
}
export const StatusChip = ({ text }: { text: string }) => (
  <Chip size="sm" variant="soft" className="whitespace-nowrap" color={TONE[text] ?? 'default'}><Chip.Label className="whitespace-nowrap">{text}</Chip.Label></Chip>
)

const KPI_BAR: Record<string, string> = { success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger', accent: 'bg-accent' }
export function Kpi({ label, value, tone }: { label: string; value: string | number; tone?: 'success' | 'warning' | 'danger' | 'accent' }) {
  return (
    <div className="kpi relative overflow-hidden rounded-3xl p-5">
      <span className={`absolute inset-x-5 top-0 h-1 rounded-b-full ${tone ? KPI_BAR[tone] : 'bg-foreground/25'}`} />
      <div className="text-sm font-medium text-muted">{label}</div>
      <div className="num mt-1 font-serif text-5xl font-semibold leading-none">{value}</div>
    </div>
  )
}

/** Row status is shown by the status chip; no coloured edge on table rows. */
export const stripe = (_s: string) => ''
export const pctText = (p: number | null) => (p === null ? '—' : p + '%')

export function PageHead({ title, sub, actions, onBack }: { title: string; sub?: ReactNode; actions?: ReactNode; onBack?: () => void }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {onBack && (
          <button onClick={onBack} className="-ml-2 mb-2 inline-flex h-9 items-center gap-1 rounded-full px-3 text-sm font-semibold text-accent transition-colors hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-accent">
            <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true"><path d="m14 6 1.4 1.4L10.8 12l4.6 4.6L14 18l-6-6 6-6Z" /></svg>Back
          </button>
        )}
        <h1 className="text-4xl font-medium">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      </div>
      <div className="flex flex-wrap gap-2">{actions}</div>
    </div>
  )
}

/** "See all" style navigation: a small real button with an arrow. */
export const SeeAll = ({ label, onPress }: { label: string; onPress: () => void }) => (
  <Button size="sm" variant="secondary" onPress={onPress}>{label}
    <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true"><path d="m10 6-1.4 1.4L13.2 12l-4.6 4.6L10 18l6-6-6-6Z" /></svg>
  </Button>
)

/** A name that opens its record: looks like a button on hover instead of an underlined link. */
export const NameBtn = ({ children, onPress, className = '' }: { children: ReactNode; onPress: () => void; className?: string }) => (
  <button onClick={(e) => { e.stopPropagation(); onPress() }}
    className={`-ml-2.5 rounded-full px-2.5 py-1 text-left font-semibold text-accent transition-colors hover:bg-accent/12 focus-visible:outline-2 focus-visible:outline-accent ${className}`}>{children}</button>
)

export const SectionTitle = ({ title, aside }: { title: string; aside?: ReactNode }) => (
  <div className="mb-3 mt-8 flex items-baseline justify-between gap-3">
    <h2 className="text-2xl font-medium">{title}</h2>
    <div className="text-sm text-muted">{aside}</div>
  </div>
)

const FILL: Record<Tone, string> = { success: 'var(--success)', warning: 'var(--warning)', danger: 'var(--danger)', accent: 'var(--accent)', default: 'color-mix(in oklab, currentColor 45%, transparent)' }
/** The state as a soft pill with a coloured dot. */
export function StatusBadge({ status }: { status: string }) {
  const c = FILL[TONE[status] ?? 'default']
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold" style={{ background: `color-mix(in oklab, ${c} 16%, transparent)`, color: `color-mix(in oklab, ${c} 70%, var(--foreground))` }}>
      <i className="size-1.5 rounded-full" style={{ background: c }} />{status}
    </span>
  )
}

/** Progress on its own: a slim bar, the percentage, and how many tasks that is. */
export function ProgressCell({ pct, done, total, status }: { pct: number; done: number; total: number; status?: string }) {
  const c = FILL[TONE[status ?? ''] ?? 'accent']
  return (
    <div className="grid min-w-36 gap-1" role="group" aria-label={`${pct}% done, ${done} of ${total} tasks`}>
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/10"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: c }} /></div>
        <b className="num w-10 text-right text-sm">{pct}%</b>
      </div>
      <span className="text-xs text-muted">{done} of {total} tasks</span>
    </div>
  )
}

export const Meter = ({ pct, label }: { pct: number; label: string }) => (
  <ProgressBar aria-label={label} value={pct} color={pct === 100 ? 'success' : 'accent'} size="sm">
    <ProgressBar.Track><ProgressBar.Fill /></ProgressBar.Track>
  </ProgressBar>
)

export const Empty = ({ children }: { children: ReactNode }) => (
  <div className="rounded-3xl border border-dashed border-separator p-10 text-center text-muted">{children}</div>
)

export interface Col { key: string; label: string; align?: 'end' | 'start'; rowHeader?: boolean }
export interface Row { id: string; cells: ReactNode[]; onAction?: () => void; className?: string }

/** Lightweight table: plain elements with HeroUI's table classes. Far cheaper than a react-aria collection. */
const NUMERIC = /^[\d\s.,%/()+\u2212-]+$|^\u2014$/
/** A column is right-aligned when it is marked so, or when every value in it is a number, so figures line up under their headings. */
const isNum = (c: Col, rows: Row[], i: number) =>
  c.align === 'end' || (c.align !== 'start' && rows.length > 0 && rows.every((r) => { const v = r.cells[i]; return typeof v === 'number' || (typeof v === 'string' && NUMERIC.test(v.trim())) }))

export function DataTable({ label, cols, rows }: { label: string; cols: Col[]; rows: Row[] }) {
  const right = cols.map((c, i) => isNum(c, rows, i))
  return (
    <div className="table-root table-root--primary">
      <div className="table__scroll-container">
        <table className="table__content w-full min-w-[880px]" aria-label={label}>
          <thead className="table__header">
            <tr>{cols.map((c) => <th key={c.key} scope="col" className={`table__column ${right[cols.indexOf(c)] ? 'text-right' : 'text-left'}`}>{c.label}</th>)}</tr>
          </thead>
          <tbody className="table__body">
            {rows.map((r) => (
              <tr key={r.id} className={`table__row ${r.className ?? ''}`} data-action={r.onAction ? '' : undefined}
                tabIndex={r.onAction ? 0 : undefined} onClick={r.onAction}
                onKeyDown={r.onAction ? (e) => { if (e.key === 'Enter' && e.target === e.currentTarget) r.onAction!() } : undefined}>
                {r.cells.map((cell, i) => <td key={i} className={`table__cell ${right[i] ? 'num text-right' : 'num text-left'} ${typeof cell === 'string' && /^\d{1,2} [A-Za-z]{3} \d{4}$/.test(cell) ? 'whitespace-nowrap' : ''}`}>{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

type BtnTone = 'primary' | 'secondary' | 'tertiary' | 'ghost' | 'danger-soft'
/** HeroUI button styling on a native <button>: identical look, a fraction of the render cost. */
export function QuickBtn({ children, onClick, disabled, tone = 'secondary', label }: { children: ReactNode; onClick: () => void; disabled?: boolean; tone?: BtnTone; label?: string }) {
  return <button type="button" className={`button button--sm button--${tone}`} onClick={onClick} disabled={disabled} aria-label={label}>{children}</button>
}
/** Native date input with HeroUI input styling. */
export const QuickDate = ({ value, onChange, disabled, label }: { value: string; onChange: (v: string) => void; disabled?: boolean; label: string }) => (
  <input type="date" aria-label={label} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="input input--primary h-9 w-40 rounded-xl px-2 text-sm" />
)

/* ---- form controls ---- */
export function TextInput(p: {
  label: string; value: string; onChange: (v: string) => void
  type?: 'text' | 'number' | 'date' | 'time' | 'search' | 'password' | 'email'; placeholder?: string; disabled?: boolean; className?: string
}) {
  return (
    <TextField className={p.className} value={p.value} onChange={p.onChange} isDisabled={p.disabled} aria-label={p.label}>
      <Label>{p.label}</Label>
      <Input type={p.type ?? 'text'} placeholder={p.placeholder} />
    </TextField>
  )
}

export interface Opt { v: string; l: string }
export function Pick(p: {
  label: string; value: string; onChange: (v: string) => void; options: Opt[]
  placeholder?: string; disabled?: boolean; className?: string; hideLabel?: boolean
}) {
  return (
    <Select
      className={p.className}
      aria-label={p.label}
      placeholder={p.placeholder ?? 'Select…'}
      value={p.value === '' ? null : p.value}
      onChange={(k) => p.onChange(k == null ? '' : String(k))}
      isDisabled={p.disabled}
    >
      <Label className={p.hideLabel ? 'sr-only' : undefined}>{p.label}</Label>
      <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
      <Select.Popover>
        <ListBox>
          {p.options.map((o) => (
            <ListBox.Item key={o.v} id={o.v} textValue={o.l}>{o.l}<ListBox.ItemIndicator /></ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  )
}

/* ---- dialogs ---- */
/** `required` makes it a must-answer dialog: no close button, Escape or outside click. */
export function Dialog(p: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean; required?: boolean }) {
  return (
    <Modal.Backdrop isOpen={p.open} isDismissable={!p.required} isKeyboardDismissDisabled={p.required} onOpenChange={(o) => { if (!o && !p.required) p.onClose() }}>
      <Modal.Container size={p.wide ? 'lg' : 'md'} scroll="inside">
        <Modal.Dialog>
          {!p.required && <Modal.CloseTrigger />}
          <Modal.Header><Modal.Heading>{p.title}</Modal.Heading></Modal.Header>
          <Modal.Body className="p-1">{p.children}</Modal.Body>
          {p.footer && <Modal.Footer>{p.footer}</Modal.Footer>}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}

export function Confirm(p: { open: boolean; title: string; text: ReactNode; onClose: () => void; onOk?: () => void }) {
  return (
    <Dialog
      open={p.open} onClose={p.onClose} title={p.title}
      footer={p.onOk
        ? <><Button variant="tertiary" onPress={p.onClose}>Cancel</Button><Button variant="danger" onPress={p.onOk}>Confirm</Button></>
        : <Button onPress={p.onClose}>OK</Button>}
    >
      <p className="text-sm">{p.text}</p>
    </Dialog>
  )
}

/* ---- more controls ---- */
/** The box and its words both sit inside Checkbox.Content, which is the part that reacts to clicks. */
export const Check = ({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) => (
  <Checkbox isSelected={checked} onChange={onChange} isDisabled={disabled}>
    <Checkbox.Content className="flex-row items-center gap-2">
      <Checkbox.Control><Checkbox.Indicator /></Checkbox.Control>
      <Label>{label}</Label>
    </Checkbox.Content>
  </Checkbox>
)

export const LongText = ({ label, value, onChange, rows = 3 }: { label: string; value: string; onChange: (v: string) => void; rows?: number }) => (
  <TextField value={value} onChange={onChange} aria-label={label} className="sm:col-span-2">
    <Label>{label}</Label>
    <TextArea rows={rows} />
  </TextField>
)

/** A working on/off switch. The control has to sit inside Switch.Content or HeroUI renders no input and clicks do nothing. */
export function Toggle({ on, onChange, label, disabled, children }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; children?: ReactNode }) {
  return (
    <Switch isSelected={on} isDisabled={disabled} onChange={onChange}>
      <Switch.Content aria-label={label} className="flex-row items-center gap-2">
        <Switch.Control><Switch.Thumb /></Switch.Control>
        {children}
      </Switch.Content>
    </Switch>
  )
}
