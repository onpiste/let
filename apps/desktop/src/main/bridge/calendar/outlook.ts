import { powershell, runScript } from "./script";
import type { CalendarBackend, CalendarEvent, NewEvent } from "./types";

// Outlook's COM interface. Arguments arrive as JSON in $env:COT_ARGS.
const PRELUDE = `
$ErrorActionPreference = 'Stop'
$a = $env:COT_ARGS | ConvertFrom-Json
$ol = New-Object -ComObject Outlook.Application
$ns = $ol.GetNamespace('MAPI')
function Shape($i) {
  [pscustomobject]@{
    id = $i.EntryID; title = $i.Subject
    start = $i.StartUTC.ToString('o'); end = $i.EndUTC.ToString('o')
    location = $i.Location; notes = $i.Body; allDay = [bool]$i.AllDayEvent
  }
}
`;

const LIST = `${PRELUDE}
$items = $ns.GetDefaultFolder(9).Items
$items.IncludeRecurrences = $true
$items.Sort('[Start]')
$from = ([datetime]$a.from).ToLocalTime().ToString('g')
$to = ([datetime]$a.to).ToLocalTime().ToString('g')
$found = $items.Restrict("[Start] < '$to' AND [End] > '$from'")
@($found | ForEach-Object { Shape $_ }) | ConvertTo-Json -Compress -AsArray
`;

const CREATE = `${PRELUDE}
$i = $ol.CreateItem(1)
$i.Subject = $a.title
$i.Start = ([datetime]$a.start).ToLocalTime()
$i.End = ([datetime]$a.end).ToLocalTime()
if ($a.location) { $i.Location = $a.location }
if ($a.notes) { $i.Body = $a.notes }
$i.AllDayEvent = [bool]$a.allDay
$i.Save()
Shape $i | ConvertTo-Json -Compress
`;

const REMOVE = `${PRELUDE}
$ns.GetItemFromID($a.id).Delete()
'{}'
`;

export const outlookCalendar: CalendarBackend = {
  name: "Outlook",
  async list(from, to) {
    return (await runScript(powershell(LIST), {
      from: from.toISOString(),
      to: to.toISOString()
    })) as CalendarEvent[];
  },
  async create(event: NewEvent) {
    return (await runScript(powershell(CREATE), event)) as CalendarEvent;
  },
  async remove(id) {
    await runScript(powershell(REMOVE), { id });
  }
};
