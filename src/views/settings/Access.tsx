import { useEffect, useState } from 'react'
import { Button, Chip } from '@heroui/react'
import { useApp } from '../../lib/store'
import { EXTRAS, MODULES, PERM_LABEL, TEMPLATES, addRole, allRoles, removeRole, renameRoleTo, setExtra, setPerm, setTeams, useRbac, type Perm, type Template } from '../../lib/rbac'
import { allUsers, peopleWithRole, refreshUsers, renameRole } from '../../lib/auth'
import { Check, Confirm, DataTable, Dialog, Pick, TextInput, Toggle } from '../../ui/kit'

const PERMS: Perm[] = ['view', 'edit', 'action']

export default function Access() {
  const s = useApp(); useRbac()
  useEffect(() => { void refreshUsers() }, [])
  const roles = allRoles()
  const [sel, setSel] = useState('')
  const role = roles.find((r) => r.name === sel)
  const [adding, setAdding] = useState(false)
  const [nm, setNm] = useState('')
  const [tpl, setTpl] = useState<Template>('junior')
  const [err, setErr] = useState('')
  const [del, setDel] = useState<string | null>(null)
  const [rename, setRename] = useState<string | null>(null)

  return (
    <>
      <p className="mb-4 max-w-2xl text-sm text-muted">Make a role, choose what it may do in each section, then give it to people on the People page. Admin always exists and can do everything.</p>
      <div className="grid items-start gap-5 lg:grid-cols-[19rem_minmax(0,1fr)]">
      <aside aria-label="Roles" className="panel rounded-3xl p-3 lg:sticky lg:top-4">
        <div className="mb-2 flex items-center justify-between gap-2 px-2 pt-1">
          <h3 className="font-semibold">Roles</h3>
          <Button size="sm" onPress={() => { setNm(''); setErr(''); setAdding(true) }}>Add role</Button>
        </div>
        <ul className="grid gap-1">
          <li className="rounded-2xl px-3 py-2">
            <span className="flex items-center gap-2"><span className="size-2.5 shrink-0 rounded-full bg-success" /><b>Admin</b></span>
            <span className="mt-0.5 block pl-4 text-xs text-muted">{peopleWithRole('Admin')} {peopleWithRole('Admin') === 1 ? 'person' : 'people'} · can do everything</span>
          </li>
          {roles.map((r) => {
            const n = peopleWithRole(r.name), on = r.name === role?.name
            return (
              <li key={r.name} className={`flex items-center gap-1 rounded-2xl px-3 py-2 transition-colors ${on ? 'bg-accent/12 ring-1 ring-accent/40' : 'hover:bg-foreground/5'}`}>
                <button type="button" aria-pressed={on} onClick={() => setSel(on ? '' : r.name)} className="min-w-0 flex-1 text-left">
                  <span className="flex items-center gap-2"><span className={`size-2.5 shrink-0 rounded-full ${on ? 'bg-accent' : 'bg-foreground/25'}`} /><b className="truncate">{r.name}</b></span>
                  <span className="mt-0.5 block pl-4 text-xs text-muted">{n} {n === 1 ? 'person' : 'people'}</span>
                </button>
                <Button size="sm" variant="ghost" isIconOnly aria-label={`Rename ${r.name}`} onPress={() => { setNm(r.name); setErr(''); setRename(r.name) }}>
                  <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true"><path d="M3 17.3V21h3.7L17.8 9.9l-3.7-3.7L3 17.3ZM20.7 7a1 1 0 0 0 0-1.4l-2.3-2.3a1 1 0 0 0-1.4 0l-1.8 1.8 3.7 3.7L20.7 7Z" /></svg>
                </Button>
                <Button size="sm" variant="ghost" isIconOnly aria-label={n > 0 ? `${r.name} cannot be deleted while people have it` : `Delete ${r.name}`} isDisabled={n > 0} onPress={() => setDel(r.name)}>
                  <svg viewBox="0 0 24 24" className={`size-4 ${n > 0 ? '' : 'text-danger'}`} fill="currentColor" aria-hidden="true"><path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12ZM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4Z" /></svg>
                </Button>
              </li>
            )
          })}
        </ul>
      </aside>
      <div className="min-w-0">
      {!role ? (
        <div className="panel rounded-3xl p-8 text-center text-muted">{roles.length ? <>Choose a role on the left to see and change what it can do.</> : <>No roles yet. Press <b>Add role</b> to make the first one, for example "Auditor" or "IT support".</>}</div>
      ) : (
        <>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2"><h3 className="font-serif text-lg">What {role.name} Can Do</h3><span className="text-xs text-muted">Changes save as soon as you switch them.</span></div>
          <DataTable label={`What ${role.name} can do`}
            cols={[{ key: 'm', label: 'Section' }, ...PERMS.map((p) => ({ key: p, label: PERM_LABEL[p], align: 'start' as const }))]}
            rows={MODULES.map((m) => {
              const have = role.perms[m.id] ?? (m.id === 'logs' ? [] : ['view'])
              return {
                id: m.id,
                cells: [<span key="m" className="font-semibold">{m.label}</span>,
                  ...PERMS.map((p) => m.perms.includes(p) ? (
                    <div key={p} className="flex items-center gap-3">
                      <Toggle on={have.includes(p)} label={`${role.name}: ${PERM_LABEL[p]} ${m.label}`} onChange={(v) => setPerm(role.name, m.id, p, v)} />
                      <span className="hidden text-xs text-muted xl:inline">{p === 'view' ? 'See it' : m[p]}</span>
                    </div>
                  ) : <span key={p} className="text-muted" aria-label="Not used">—</span>)],
              }
            })} />

          <div className="panel mt-4 rounded-3xl p-5">
            <h3 className="font-semibold">Extra Rights</h3>
            <p className="mb-3 mt-1 text-sm text-muted">Single actions that sit outside the sections above. The Owner and Admins always have them.</p>
            <div className="grid gap-3">
              {EXTRAS.map((x) => (
                <div key={x.id} className="flex items-center gap-3">
                  <Toggle on={!!role.extras?.includes(x.id)} label={`${role.name}: ${x.label}`} onChange={(v) => setExtra(role.name, x.id, v)} />
                  <span className="text-sm"><b>{x.label}.</b> <span className="text-muted">{x.text}</span></span>
                </div>
              ))}
            </div>
          </div>

          <div className="panel mt-4 rounded-3xl p-5">
            <h3 className="font-semibold">Teams This Role Can Take Action for</h3>
            <p className="mb-3 mt-1 text-sm text-muted">Applies to marking tasks done, waived or blocked. Choose every team, or pick only some.</p>
            <Check label="Every team" checked={role.teams === null} onChange={(v) => setTeams(role.name, v ? null : [])} />
            {role.teams !== null && (
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
                {s.groups.map((g) => (
                  <Check key={g} label={g} checked={role.teams!.includes(g)} onChange={(v) => setTeams(role.name, v ? [...role.teams!, g] : role.teams!.filter((x) => x !== g))} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
      </div>
      </div>

      <div className="panel mt-5 rounded-3xl p-5">
        <h3 className="font-semibold">Who Can See Archived Leavers</h3>
        <p className="mb-3 mt-1 text-sm text-muted">Archived leavers are hidden from everyone else, Admins included. Change this per person on the People tab.</p>
        <div className="flex flex-wrap gap-2">
          {allUsers().filter((u) => u.owner || u.archive).map((u) => (
            <Chip key={u.id} size="sm" variant="soft"><Chip.Label>{u.name}{u.owner ? ' (Owner)' : ''} · {u.role}</Chip.Label></Chip>
          ))}
        </div>
      </div>

      <Dialog open={adding} onClose={() => setAdding(false)} title="Add a role"
        footer={<><Button variant="tertiary" onPress={() => setAdding(false)}>Cancel</Button>
          <Button onPress={() => { const e = addRole(nm, tpl); if (e) setErr(e); else { setSel(nm.trim()); setAdding(false) } }}>Add role</Button></>}>
        <TextInput label="Role name" value={nm} onChange={(v) => { setNm(v); setErr('') }} placeholder="For example, Auditor" />
        <div className="mt-3"><Pick label="Start from" value={tpl} onChange={(v) => setTpl(v as Template)} options={TEMPLATES.map((t) => ({ v: t.id, l: t.label }))} /></div>
        <p className="mt-2 text-sm text-muted">{TEMPLATES.find((t) => t.id === tpl)!.text} You can switch each permission on or off afterwards.</p>
        {err && <p role="alert" className="mt-2 text-sm text-danger">{err}</p>}
      </Dialog>
      <Dialog open={rename !== null} onClose={() => setRename(null)} title="Rename the role"
        footer={<><Button variant="tertiary" onPress={() => setRename(null)}>Cancel</Button>
          <Button onPress={() => { const from = rename!; const e = renameRoleTo(from, nm); if (e) setErr(e); else { renameRole(from, nm.trim()); if (sel === from) setSel(nm.trim()); setRename(null) } }}>Save name</Button></>}>
        <TextInput label="Role name" value={nm} onChange={(v) => { setNm(v); setErr('') }} />
        <p className="mt-2 text-sm text-muted">People who have this role keep it under the new name.</p>
        {err && <p role="alert" className="mt-2 text-sm text-danger">{err}</p>}
      </Dialog>
      <Confirm open={del !== null} title={`Delete the role ${del}?`} text="No one has it, so nothing else changes." onClose={() => setDel(null)} onOk={() => { removeRole(del!); if (sel === del) setSel(''); setDel(null) }} />
    </>
  )
}
