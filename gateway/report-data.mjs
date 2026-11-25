// src/lib/dates.ts
const D = (s) => /* @__PURE__ */ new Date(s + "T12:00:00Z");
const iso = (d) => d.toISOString().slice(0, 10);
function addDays(s, n) {
	const d = D(s);
	d.setUTCDate(d.getUTCDate() + n);
	return iso(d);
}
const diff = (a, b) => Math.round((D(a).getTime() - D(b).getTime()) / 864e5);
function addMonths(s, n) {
	const d = D(s);
	const day = d.getUTCDate();
	d.setUTCDate(1);
	d.setUTCMonth(d.getUTCMonth() + n);
	const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
	d.setUTCDate(Math.min(day, last));
	return iso(d);
}
function localToday() {
	const n = /* @__PURE__ */ new Date();
	return n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0") + "-" + String(n.getDate()).padStart(2, "0");
}
function calendar(settings) {
	const hol = new Set((settings.holidays || []).map((h) => h.date));
	const isOff = (s) => {
		const dow = D(s).getUTCDay();
		return (settings.weekend === "SS" ? dow === 6 || dow === 0 : dow === 5 || dow === 6) || hol.has(s);
	};
	const addWD = (s, n, dir) => {
		let cur = s;
		let left = n;
		while (left > 0) {
			cur = addDays(cur, dir);
			if (!isOff(cur)) left--;
		}
		return cur;
	};
	const wdDiff = (a, b) => {
		if (a === b) return 0;
		const dir = a > b ? 1 : -1;
		let cur = b, n = 0;
		while (cur !== a) {
			cur = addDays(cur, dir);
			if (!isOff(cur)) n++;
		}
		return dir * n;
	};
	const toWorking = (s, dir) => {
		let cur = s;
		for (let i = 0; i < 400 && isOff(cur); i++) cur = addDays(cur, dir);
		return cur;
	};
	return {
		isOff,
		addWD,
		wdDiff,
		toWorking
	};
}
// src/lib/engine.ts
const today = (s) => s.settings.reportDate || localToday();
const fieldByKey = (s, k) => s.fields.find((f) => f.key === k);
const reasonById = (s, id) => s.reasons.find((r) => r.id === id);
/** An archived leaver is kept but hidden: out of the lists, tasks, dashboard and reports. */
const ARCHIVED = "__archived";
const isArchived = (l) => !!l.values[ARCHIVED];
function value(s, l, key, depth = 0) {
	const v = l.values[key];
	if (v !== void 0 && v !== null && v !== "") return v;
	const f = fieldByKey(s, key);
	if (f && f.fallback && depth < 5) return value(s, l, f.fallback, depth + 1);
	return "";
}
/** The rules a leaver has: the version frozen when they were created. Old records without one read the current rules. */
const stepsOf = (s, l) => s.slaVersions?.[l.values["__sla"]] ?? s.steps;
const stepOf = (s, l, id) => stepsOf(s, l).find((x) => x.id === id);
/** A leaver has the rules as they were when created. A rule is left out for one leaver by switching it off for them. */
function applies(_s, l, st) {
	return st.active && l.tasks[st.id]?.s !== "off";
}
function hasSla(st) {
	return !!st.start && st.start.type !== "none" && st.days !== null && st.days !== void 0 && st.days !== "";
}
/** True when `from`'s clock starts from `to`'s completion, directly or through other rules. */
function clockLoops(steps, from, to, seen = /* @__PURE__ */ new Set()) {
	if (from === to) return true;
	if (seen.has(from)) return false;
	seen.add(from);
	const x = steps.find((y) => y.id === from);
	return !!x && x.start.type === "step" && clockLoops(steps, x.start.step, to, seen);
}
function startOf(s, l, st) {
	if (!hasSla(st)) return { kind: "none" };
	if (st.start.type === "field") {
		const v = value(s, l, st.start.field);
		return v ? {
			kind: "ok",
			date: v
		} : { kind: "waiting" };
	}
	if (st.start.type === "step") {
		if (clockLoops(stepsOf(s, l), st.start.step, st.id)) return { kind: "none" };
		const from = stepOf(s, l, st.start.step);
		if (!from || !applies(s, l, from)) return { kind: "none" };
		const rec = l.tasks[from.id];
		if (rec && rec.s === "waived") return { kind: "none" };
		return rec && rec.s === "done" ? {
			kind: "ok",
			date: rec.d
		} : { kind: "waiting" };
	}
	return { kind: "none" };
}
function dueOf(s, l, st, cal = calendar(s.settings)) {
	const start = startOf(s, l, st);
	if (start.kind !== "ok") return {
		due: null,
		waiting: start.kind === "waiting",
		noSla: start.kind === "none"
	};
	const dir = st.when === "Before" ? -1 : 1;
	const n = Number(st.days) || 0;
	const raw = st.unit === "WD" ? cal.addWD(start.date, n, dir) : addDays(start.date, dir * n);
	return {
		due: cal.toWorking(raw, dir),
		waiting: false,
		noSla: false
	};
}
function slaText(s, st) {
	if (!hasSla(st)) return "No SLA (tracked only)";
	let from = "?";
	if (st.start.type === "field") from = fieldByKey(s, st.start.field)?.label || st.start.field;
	if (st.start.type === "step") from = "completion of " + st.start.step;
	const n = Number(st.days) || 0;
	if (n === 0) return "On " + from;
	return n + (st.unit === "WD" ? " working" : " calendar") + (n === 1 ? " day " : " days ") + st.when.toLowerCase() + " " + from;
}
function evalTask(s, l, st, cal = calendar(s.settings)) {
	const o = {
		step: st,
		leaver: l,
		applies: applies(s, l, st),
		due: null,
		status: "N/A",
		sla: "",
		done: "",
		delay: null
	};
	if (!o.applies) return o;
	const dd = dueOf(s, l, st, cal);
	o.due = dd.due;
	const rec = l.tasks[st.id];
	const t = today(s);
	if (rec && rec.s === "done") {
		o.status = "Done";
		o.done = rec.d;
		if (o.due) {
			o.delay = cal.wdDiff(rec.d, o.due);
			o.sla = o.delay > 0 ? "Late" : "On Time";
		} else o.sla = "No SLA";
		return o;
	}
	if (rec && rec.s === "waived") {
		o.status = "Waived";
		o.sla = "Waived";
		return o;
	}
	const late = o.due ? cal.wdDiff(t, o.due) : 0;
	const past = !!o.due && late > 0;
	if (past) o.delay = late;
	if (rec && rec.s === "blocked") {
		o.status = "Blocked";
		o.sla = past ? "Breached" : "Open";
		return o;
	}
	if (dd.waiting) {
		o.status = "Waiting";
		o.sla = "Open";
		return o;
	}
	if (!o.due) {
		o.status = "Open";
		o.sla = "No SLA";
		return o;
	}
	if (past) {
		o.status = "Overdue";
		o.sla = "Breached";
		return o;
	}
	o.sla = "Open";
	o.status = cal.wdDiff(o.due, t) <= Number(s.settings.dueSoon) ? "Due Soon" : "Pending";
	return o;
}
function leaverRows(s, l) {
	const cal = calendar(s.settings);
	return stepsOf(s, l).map((st) => evalTask(s, l, st, cal)).filter((r) => r.applies);
}
function summary(s, l) {
	const rows = leaverRows(s, l);
	const c = (f) => rows.filter(f).length;
	const waived = c((r) => r.status === "Waived");
	const done = c((r) => r.status === "Done");
	const overdue = c((r) => r.status === "Overdue");
	const blocked = c((r) => r.status === "Blocked");
	const dueSoon = c((r) => r.status === "Due Soon");
	const late = c((r) => r.sla === "Late");
	const base = rows.length - waived;
	let status;
	if (!reasonById(s, l.values.reason)) status = "Set Reason";
	else if (base > 0 && done === base) status = "Completed";
	else if (overdue) status = "Overdue";
	else if (blocked) status = "Blocked";
	else if (done === 0) status = dueSoon ? "Due Soon" : "Not Started";
	else status = dueSoon ? "Due Soon" : "In Progress";
	return {
		rows,
		total: rows.length,
		base,
		waived,
		done,
		overdue,
		blocked,
		dueSoon,
		late,
		pct: base ? Math.round(done / base * 100) : 0,
		open: base - done,
		status
	};
}
function complianceOf(rows) {
	const on = rows.filter((r) => r.sla === "On Time").length;
	const late = rows.filter((r) => r.sla === "Late").length;
	const br = rows.filter((r) => r.sla === "Breached").length;
	const tot = on + late + br;
	return {
		on,
		late,
		br,
		pct: tot ? Math.round(on / tot * 100) : null
	};
}
function noticeCheck(s, l) {
	const r = reasonById(s, l.values.reason);
	if (!r || !r.notice) return {
		text: "n/a",
		tone: "none"
	};
	const n = s.settings.notice;
	const hire = value(s, l, n.hireField), req = value(s, l, n.requestField), end = value(s, l, n.endField);
	if (!hire || !req || !end) return {
		text: "Missing data",
		tone: "warn"
	};
	const months = diff(end, hire) / 365.25 <= Number(n.years) ? Number(n.short) : Number(n.long);
	const need = addMonths(req, months);
	return diff(end, need) >= 0 ? {
		text: "OK",
		tone: "good"
	} : {
		text: "Short Notice",
		tone: "crit",
		need,
		months
	};
}
// src/lib/reportData.ts
const avgLate = (rows) => {
	const l = rows.filter((r) => r.delay !== null && r.delay > 0 && r.status === "Done").map((r) => r.delay);
	return l.length ? Math.round(l.reduce((a, b) => a + b, 0) / l.length * 10) / 10 : 0;
};
/** `state` holds every leaver, archived ones included (they carry values.__archived). */
function buildReport(state, today) {
	const s = state;
	const lwd = (l) => value(s, l, "lwd");
	const reasonName = (id) => s.reasons.find((r) => r.id === id)?.name ?? id ?? "";
	const sums = s.leavers.map((l) => ({
		l,
		m: summary(s, l)
	}));
	const rows = sums.flatMap(({ m }) => m.rows).filter((r) => r.status !== "N/A");
	const comp = complianceOf(rows);
	const cases = [[
		"Employee ID",
		"Name",
		"Email",
		"Department",
		"Location",
		"Reason",
		"Last working day",
		"Status",
		"Progress %",
		"Tasks done",
		"Tasks applicable",
		"Overdue",
		"Late",
		"Notice check",
		"Archived",
		"Archived on"
	]];
	sums.forEach(({ l, m }) => cases.push([
		l.values.empId ?? "",
		l.values.name ?? "",
		l.values.email ?? "",
		l.values.dept ?? "",
		l.values.site ?? "",
		reasonName(l.values.reason),
		lwd(l),
		m.status,
		m.pct,
		m.done,
		m.base,
		m.overdue,
		m.late,
		noticeCheck(s, l).text,
		isArchived(l) ? "Yes" : "No",
		(l.values["__archived"] ?? "").slice(0, 10)
	]));
	const tasks = [[
		"Employee ID",
		"Name",
		"Last working day",
		"SLA",
		"Task",
		"Team",
		"Rule",
		"Due",
		"Completed on",
		"Status",
		"SLA result",
		"Days late (+) / early (-)",
		"Note",
		"Archived"
	]];
	sums.forEach(({ l, m }) => m.rows.filter((r) => r.status !== "N/A").forEach((r) => {
		const rec = l.tasks[r.step.id];
		tasks.push([
			l.values.empId ?? "",
			l.values.name ?? "",
			lwd(l),
			r.step.id,
			r.step.name,
			r.step.group,
			slaText(s, r.step),
			r.due ?? "",
			r.done ?? "",
			r.status,
			r.sla,
			r.delay ?? "",
			rec && "note" in rec && rec.note ? rec.note : "",
			isArchived(l) ? "Yes" : "No"
		]);
	}));
	const teams = [[
		"Team",
		"Tasks",
		"Done",
		"On time",
		"Late",
		"Breached",
		"Avg days late",
		"Open",
		"Compliance %"
	]];
	s.groups.forEach((g) => {
		const gr = rows.filter((r) => r.step.group === g), c = complianceOf(gr);
		teams.push([
			g,
			gr.length,
			gr.filter((r) => r.status === "Done").length,
			c.on,
			c.late,
			c.br,
			avgLate(gr),
			gr.filter((r) => r.status !== "Done" && r.status !== "Waived").length,
			c.pct ?? ""
		]);
	});
	const done = sums.filter(({ m }) => m.status === "Completed" || m.base > 0 && m.pct === 100).length;
	return {
		updated: today,
		tables: {
			summary: [
				["Metric", "Value"],
				["Updated", today],
				["All cases", sums.length],
				["Active cases", sums.length - done],
				["Completed cases", done],
				["Archived cases", sums.filter(({ l }) => isArchived(l)).length],
				["Overdue cases", sums.filter(({ l, m }) => !isArchived(l) && m.status === "Overdue").length],
				["Tasks on time", comp.on],
				["Tasks done late", comp.late],
				["Tasks breached", comp.br],
				["Compliance %", comp.pct ?? ""]
			],
			cases,
			tasks,
			teams
		}
	};
}
export { buildReport };
