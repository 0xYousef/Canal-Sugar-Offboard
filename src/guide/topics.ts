// Guide content, written the way you'd explain it to a colleague.
// `id` doubles as the video file name: guide-videos/<id>.mp4 (see e2e/record).
export interface Topic { id: string; title: string; summary: string; steps: string[]; example: string; seconds: number }

export const TOPICS: Topic[] = [
  {
    id: 'sign-in', title: 'Signing in and setting up your profile', seconds: 40,
    summary: 'Get into the portal and make it yours.',
    steps: [
      'Type your email and password, then press Sign in. On your own computer, leave "Keep me signed in" ticked so you don\'t have to log in every time.',
      'Click your name in the top right corner. That opens your profile, where you can change your name or password, or sign out.',
      'Prefer a darker screen? The moon button next to your name switches to dark mode. Press it again to go back. The portal remembers your choice.',
      'The round buttons at the bottom of the screen take you around the portal. Press one and you\'ll see a circle grow out of it as the new page opens.',
    ],
    example: `Hana has just joined the IT team. Her manager created her a profile with the email hana@canalsugar.com. She opens the portal, types that email and her password, leaves "Keep me signed in" ticked and lands on the dashboard. On her first day she opens her profile and changes her password to one only she knows.`,
  },
  {
    id: 'dashboard', title: 'Reading the dashboard', seconds: 45,
    summary: 'See at a glance what is late and what you can finish right now.',
    steps: [
      'The five cards at the top tell you how many people are leaving, how many tasks are still open, how many are due soon, how many are already late, and how well deadlines are being met.',
      'Under "Needs your attention" you\'ll see the tasks that belong to you and are late or nearly due. Press Done on any of them when it\'s finished, check the date (today is filled in), and press Done again.',
      '"By team" shows the same picture for each team, like HR, IT or Legal, so you can see who is behind.',
      'Further down, "Most overdue" and "Leaver progress" show who needs chasing. Click a name to open that person.',
    ],
    example: `The card says "Overdue now: 15". You scroll down to "Needs your attention" and see a task that is 20 days late. Someone already finished it last week but nobody ticked it off, so you press Done. The number of overdue tasks drops by one.`,
  },
  {
    id: 'add-leaver', title: 'Adding someone who is leaving', seconds: 60,
    summary: 'Record a new leaver. The portal then builds their task list and due dates for you.',
    steps: [
      'Go to Leavers and press Add leaver.',
      'Type their name and choose why they are leaving. The reason matters, because it decides which tasks they get.',
      'Fill in the dates, such as when the request came in and their last working day. Anything marked with a star has to be filled in.',
      'Press Save leaver. Their tasks appear straight away, each with a due date worked out from your rules.',
      'Later on, use the search box and the Reason and Status filters to find people quickly.',
    ],
    example: `Mona Adel from HR has resigned. Her request arrived on 18 November 2026 and her last working day is 17 December 2026. You press Add leaver, type her name, choose "Resignation" as the reason, fill in those two dates and save. Her tasks appear straight away: IT gets the laptop back on her last day, Finance pays the final settlement a few working days later, and so on.`,
  },
  {
    id: 'leaver-tasks', title: 'Working through a leaver\'s tasks', seconds: 60,
    summary: 'Tick off steps as they happen, or mark them as not needed or stuck.',
    steps: [
      'Click a person in the Leavers list to open their page. The bar at the top shows how much is done.',
      'When a task is finished, press the Take action button next to its status. A short list opens. Choose Done. A small window asks for the date, with today already filled in. Change it if the task was finished earlier, then press Done.',
      'The same list lets you Waive a task that doesn\'t apply to this person, or Block one that something is holding up. Made a mistake? Choose Reopen and it goes back to open.',
      'You can change the tasks your role allows, usually your own team\'s. Admins can change everything.',
      'Use Edit details to correct their information, or Delete to remove them completely.',
    ],
    example: `On 17 December IT collects Mona's laptop. You open her page, find "Laptop, screens & hardware received", press Take action and choose Done. The status turns to Done. Further down, the task about returning a company car doesn't apply to her because she never had one, so you press Take action and choose Waive.`,
  },
  {
    id: 'tasks', title: 'Finding and finishing tasks', seconds: 45,
    summary: 'One list of everything that still needs doing, for all leavers.',
    steps: [
      'Open Tasks. The most urgent ones are at the top.',
      'Narrow the list by team, by status, or type a name or a few words into the search box.',
      'Press Take action next to a task and choose Done from the list that opens. You\'ll see a short message confirming it.',
    ],
    example: `You work in IT and want to know who still owes a laptop. Open Tasks, set Team to IT and Status to Overdue, then type "laptop" in the search box. The list shows only those tasks. When one laptop comes back this morning, you press Take action and choose Done.`,
  },
  {
    id: 'reports', title: 'Reports and exports', seconds: 45,
    summary: 'Find out which teams meet their deadlines, and take the numbers into Excel.',
    steps: [
      'The cards at the top show how many tasks were finished on time, how many were late, how many are still open past their deadline, and the overall score.',
      'The charts show how much gets finished each month and how each team is doing.',
      'Step performance lists the steps that run late most often, which is a good place to start when you want to improve things.',
      'Press Export tasks CSV or Export leavers CSV to download everything as a file you can open in Excel.',
    ],
    example: `The "Deadlines by team" chart shows IT at 50% and HR at 36%. You open Step performance and see that HR's clearance form is the step that runs late most often. You decide to remind HR a week earlier. Then you press Export tasks CSV and send the file to your manager.`,
  },
  {
    id: 'settings-fields', title: 'Adding your own field', seconds: 55,
    summary: 'Need to keep track of something extra? Add a field, no technical help needed.',
    steps: [
      'Open Settings, go to the Fields tab, and press Add field.',
      'Give it a name, then choose what kind of information it holds, such as text, a date, or a choice from a list. Pick which part of the form it belongs in.',
      'Decide whether it\'s always required, or only for certain reasons for leaving.',
      'Press Save field. It shows up straight away in the leaver form, on the leaver\'s page, in reports and in exports. You can drag it into a better position with the arrows.',
      'If it\'s a date, you can also use it to start a deadline clock.',
    ],
    example: `HR wants to record the date of each exit interview. You add a field called "Exit interview date", choose the type Date and the section Dates, and tick "Show as a column in Leavers". From now on it appears in the Add leaver form, on each leaver's page, and as a column in the list.`,
  },
  {
    id: 'settings-sla', title: 'Setting a deadline rule (SLA)', seconds: 65,
    summary: 'Tell the portal who does a step, when their time starts, and how long they get.',
    steps: [
      'Open Settings, go to SLA rules, and press Add SLA rule.',
      'Write what needs to be done and choose which team is responsible.',
      'Say when the clock starts, for example on the last working day, and how many days the team gets. You can count working days only, or every day.',
      'Every leaver gets every rule. To leave a rule out, switch it off in the rules list (everyone) or on a leaver\'s own page (just them).',
      'Before you save, the preview shows the due date for a real person, so you can check it makes sense. Then press Save rule, and everyone\'s deadlines update at once.',
    ],
    example: `Security should collect the ID badge within 2 working days of the last working day. You add a rule called "Return ID badge", team Security, clock starts on Last working day, 2 working days after. For a leaver whose last day is Thursday 17 December 2026, the preview shows a due date of Monday 21 December, because Friday and Saturday are the weekend.`,
  },
  {
    id: 'settings-people', title: 'Giving people access', seconds: 60,
    summary: 'Create a login for a colleague and decide what they\'re allowed to change.',
    steps: [
      'Open Settings, choose People and access, and press Add profile. Only the Owner sees this.',
      'Type their name and work email, and choose a password of at least 8 characters. They can change it themselves later.',
      'Pick their role. The Roles and permissions tab is where the Owner makes roles and chooses, for each section, whether it can view, edit or take action.',
      'To stop someone from signing in, switch their Active toggle off. The portal always keeps at least one active Admin so you can\'t lock yourself out.',
      'To rename teams or reasons for leaving, open Settings and choose Reasons and teams.',
    ],
    example: `Hana joins the IT team. You add a profile with her work email and a temporary password. You give her a role that can take action only on IT tasks, so she can update those but not anyone else's. Months later, when Hana leaves the company, you switch her Active toggle off and she can no longer sign in.`,
  },
  {
    id: 'file-sources', title: 'Importing a list from a file', seconds: 60,
    summary: 'Got your leavers in a spreadsheet? Bring them in instead of typing each one.',
    steps: [
      'Open Settings and choose Import leavers.',
      'Press Choose file and pick your spreadsheet. CSV, Excel and JSON files all work, and nothing leaves your computer.',
      'The portal tries to match each column to the right field. Take a quick look and fix any that are wrong.',
      'The preview marks rows with problems, and those are skipped. When you\'re happy, press Import. People already in the portal are updated, not duplicated.',
    ],
    example: `HR keeps a spreadsheet called "Leavers Dec 2026.xlsx" on their desktop. It has the columns Employee name, Employee ID, Department, Reason for leaving and Last working day. You press Choose file and pick it. The portal matches the columns by itself. One row says "Retired?" in the reason column, so it's marked as a problem and skipped. You fix it in the spreadsheet later and import again. The other rows come in at once.`,
  },
]
