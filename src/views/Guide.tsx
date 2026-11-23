import { useState } from 'react'
import { Button } from '@heroui/react'
import { TOPICS, type Topic } from '../guide/topics'
import { embedUrl, isFileUrl, saveLinks, useLinks } from '../guide/links'
import { can } from '../lib/rbac'
import { Dialog, Empty, PageHead, TextInput } from '../ui/kit'

function Player({ topic, url, onClose }: { topic: Topic; url: string; onClose: () => void }) {
  const file = isFileUrl(url), src = file ? url : embedUrl(url)
  return (
    <Dialog open onClose={onClose} wide title={topic.title}
      footer={<><Button variant="tertiary" onPress={onClose}>Close</Button><a className="button button--md button--primary" href={url} target="_blank" rel="noreferrer">{file ? 'Open video' : 'Open in Drive'}</a></>}>
      {file
        ? <video src={url} controls autoPlay playsInline className="aspect-video w-full rounded-2xl bg-black" />
        : src
          ? <div className="aspect-video overflow-hidden rounded-2xl bg-black"><iframe src={src} title={topic.title} allow="autoplay; fullscreen" allowFullScreen className="size-full border-0" /></div>
          : <p className="text-sm">This link cannot be played inside the portal. Use Open in Drive.</p>}
    </Dialog>
  )
}

function LinksDialog({ onClose }: { onClose: () => void }) {
  const cur = useLinks()
  const [folder, setFolder] = useState(cur.folder)
  const [per, setPer] = useState<Record<string, string>>({ ...cur.topics })
  const save = () => {
    const topics = Object.fromEntries(Object.entries(per).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()]))
    saveLinks({ folder: folder.trim(), windows: cur.windows, topics }); onClose()
  }
  return (
    <Dialog open onClose={onClose} wide title="Edit video links"
      footer={<><Button variant="tertiary" onPress={onClose}>Cancel</Button><Button onPress={save}>Save links</Button></>}>
      <p className="mb-4 text-sm text-muted">Every topic already plays its built-in video. To use a Google Drive copy instead, upload it, set sharing to "Anyone with the link can view", and paste its link here. Links are saved in this browser.</p>
      <div className="grid gap-3">
        <TextInput label="Folder with all videos (optional)" value={folder} onChange={setFolder} placeholder="https://drive.google.com/drive/folders/…" />
        {TOPICS.map((t) => (
          <TextInput key={t.id} label={`${t.title}  (${t.id}.mp4)`} value={per[t.id] ?? ''} onChange={(v) => setPer((p) => ({ ...p, [t.id]: v }))} placeholder="https://drive.google.com/file/d/…/view" />
        ))}
      </div>
    </Dialog>
  )
}


export default function Guide() {
  const links = useLinks()
  const [q, setQ] = useState('')
  const [play, setPlay] = useState<Topic | null>(null)
  const [edit, setEdit] = useState(false)
  const list = TOPICS.filter((t) => (t.title + ' ' + t.summary + ' ' + t.steps.join(' ') + ' ' + t.example).toLowerCase().includes(q.toLowerCase()))

  return (
    <div>
      <PageHead title="Guide" sub="How to use Canal Sugar Offboarding, step by step, with a short video for each topic."
        actions={<>
          {links.folder && <a className="button button--md button--secondary" href={links.folder} target="_blank" rel="noreferrer">All videos</a>}
          {can('guide', 'edit') && <Button variant="secondary" onPress={() => setEdit(true)}>Edit video links</Button>}
        </>} />
      <div className="mb-4 max-w-md"><TextInput label="Search the guide" type="search" value={q} onChange={setQ} placeholder="e.g. SLA, import, password" /></div>
      {!list.length ? <Empty>Nothing in the guide matches “{q}”.</Empty> : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((t) => {
            const url = links.topics[t.id]
            return (
              <article key={t.id} className="panel flex flex-col gap-3 rounded-3xl p-5">
                <div>
                  <h2 className="text-xl font-medium">{t.title}</h2>
                  <p className="mt-1 text-sm text-muted">{t.summary}</p>
                </div>
                <ol className="list-decimal space-y-1.5 pl-5 text-sm">{t.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
                <p className="rounded-2xl bg-accent/10 px-4 py-3 text-sm"><b className="text-accent">For example: </b>{t.example}</p>
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
                  {url ? (
                    <>
                      <Button onPress={() => setPlay(t)}>Watch here</Button>
                      <a className="button button--md button--secondary" href={url} target="_blank" rel="noreferrer">{isFileUrl(url) ? 'Open video' : 'Open in Drive'}</a>
                    </>
                  ) : <span className="text-sm text-muted">Video coming soon · about {t.seconds}s</span>}
                </div>
              </article>
            )
          })}
        </div>
      )}
      {play && <Player topic={play} url={links.topics[play.id]} onClose={() => setPlay(null)} />}
      {edit && <LinksDialog onClose={() => setEdit(false)} />}
    </div>
  )
}
