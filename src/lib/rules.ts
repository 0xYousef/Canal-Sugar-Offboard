// The house rules shown when someone opens the portal. Edit the text here.
const BASE: { title: string; text: string }[] = [
  { title: 'Keep every field standard', text: 'Fill in each field the same way as everyone else, whoever you are: use the dropdown choices, write names in full, and use the same date format. Do not invent your own wording.' },
  { title: 'Leaving? Export your sheet first', text: 'If you are about to leave, go to Reports, export the sheet, and send it to your team leader before you go.' },
  { title: 'Export again at the end of every day', text: 'Before you finish for the day, export the sheet from Reports so the latest work is saved outside the portal.' },
  { title: 'Make sure you are on the right sheet', text: 'Check the leaver name, the employee ID and the dates before you save or mark anything done. A change on the wrong person is hard to find later.' },
]

/** The rules for today. When a closing time is set, one more rule says the shared file is removed then. */
export function rulesFor(endTime?: string) {
  return endTime ? [...BASE, { title: `Finish before ${endTime}`, text: `The shared file is removed from the server automatically at ${endTime} every day. Export your sheet from Reports before then. After that time, upload a fresh file to start the next day.` }] : BASE
}
