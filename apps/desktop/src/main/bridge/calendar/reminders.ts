import { osascript, runScript } from "./script";

// macOS Reminders through JXA; arguments arrive as JSON in COT_ARGS.
const PRELUDE = `
ObjC.import('stdlib');
const args = JSON.parse(ObjC.unwrap($.getenv('COT_ARGS')));
const R = Application('Reminders');
const shape = (r, list) => ({
  id: r.id(), title: r.name(), notes: r.body() || undefined,
  due: r.dueDate() ? r.dueDate().toISOString() : undefined,
  list: list.name(), done: r.completed()
});
`;

const LIST = `${PRELUDE}
const out = [];
for (const list of R.lists()) {
  if (args.list && list.name() !== args.list) continue;
  const found = args.includeDone ? list.reminders() : list.reminders.whose({completed: false})();
  for (const r of found) out.push(shape(r, list));
}
JSON.stringify(out);
`;

const ADD = `${PRELUDE}
const list = args.list ? R.lists.byName(args.list) : R.defaultList();
const props = {name: args.title, body: args.notes || ''};
if (args.due) props.dueDate = new Date(args.due);
const r = R.Reminder(props);
list.reminders.push(r);
JSON.stringify(shape(r, list));
`;

const COMPLETE = `${PRELUDE}
let done = false;
for (const list of R.lists()) {
  for (const r of list.reminders.whose({id: args.id})()) { r.completed = true; done = true; }
}
JSON.stringify({done});
`;

export const reminders = {
  list: (args: { list?: string; includeDone?: boolean }) =>
    runScript(osascript(LIST), args),
  add: (args: { title: string; notes?: string; due?: string; list?: string }) =>
    runScript(osascript(ADD), args),
  async complete(id: string) {
    const r = (await runScript(osascript(COMPLETE), { id })) as {
      done: boolean;
    };
    if (!r.done) throw new Error(`No reminder with id ${id}.`);
  }
};
