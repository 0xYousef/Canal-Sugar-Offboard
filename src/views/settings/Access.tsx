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
  const role = roles.find((r) => r.name === sel) ?? roles[0]
  const [adding, setAdding] = useState(false)
  const [nm, setNm] = useState('')
  const [tpl, setTpl] = useState<Template>('junior')
  const [err, setErr] = useState('')
  const [del, setDel] = useState(false)
  const [rename, setRename] = useState<string | null>(null)
  const people = role ? peopleWithRole(role.name) : 0

  return (
    <>
      <p className="mb-4 max-w-2xl text-sm text-muted">
        Make a role, choose what it may do in each section, then give it to people on the People tab.
        <b> View</b> shows a section, <b>Edit</b> changes its content, and <b>Take action</b> marks work done, waived or blocked, and exports from Reports.
        Admin always exists and can do everything.
      </p>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        {roles.length > 0 && <div className="w-64"><Pick label="Role" value={role!.name} onChange={setSel} options={roles.map((r) => ({ v: r.name, l: r.name }))} /></div>}
        <Button variant="secondary" onPress={() => { setNm(''); setErr(''); setAdding(true) }}>Add role</Button>
        {role && <Button variant="secondary" onPress={() => { setNm(role.name); setErr(''); setRename(role.name) }}>Rename</Button>}
        {role && <Button variant="danger-soft" isDisabled={people > 0} onPress={() => setDel(true)}>Delete role</Button>}
        {role && <Chip size="sm" variant="soft"><Chip.Label>{people} {people === 1 ? 'person' : 'people'}</Chip.Label></Chip>}
      </div>

      {!role ? (
        <div className="panel rounded-3xl p-8 text-center text-muted">No roles yet. Press <b>Add role</b> to make the first one, for example "Auditor" or "IT support".</div>
      ) : (
        <>
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
                  ) : <span key={p} className="text-muted">Not used</span>)],
              }
            })} />

          <div className="panel mt-4 rounded-3xl p-5">
            <h3 className="font-semibold">Extra rights</h3>
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
            <h3 className="font-semibold">Teams this role can take action for</h3>
            <p className="mb-3 mt-1 text-sm text-muted">Applies to marking tasks done, waived or blocked. Choose every team, or only some.</p>
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

      <div className="panel mt-4 rounded-3xl p-5">
        <h3 className="font-semibold">Who can see archived leavers</h3>
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
          <Button onPress={() => { const from = rename!; const e = renameRoleTo(from, nm); if (e) setErr(e); else { renameRole(from, nm.trim()); setSel(nm.trim()); setRename(null) } }}>Save name</Button></>}>
        <TextInput label="Role name" value={nm} onChange={(v) => { setNm(v); setErr('') }} />
        <p className="mt-2 text-sm text-muted">People who have this role keep it under the new name.</p>
        {err && <p role="alert" className="mt-2 text-sm text-danger">{err}</p>}
      </Dialog>
      <Confirm open={del} title={`Delete the role ${role?.name}?`} text="No one has it, so nothing else changes." onClose={() => setDel(false)} onOk={() => { removeRole(role!.name); setDel(false); setSel('') }} />
    </>
  )
}
