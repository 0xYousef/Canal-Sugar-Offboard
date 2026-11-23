export const csv = (rows: (string | number | null | undefined)[][]) =>
  rows.map((r) => r.map((c) => {
    const t = c == null ? '' : String(c)
    return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t
  }).join(',')).join('\n')

export function downloadFile(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
