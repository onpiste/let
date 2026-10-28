import type { Schedule } from "agents";

import type { ScheduledTask, TaskSchedule } from "@cot/shared";

import type { ReminderAgent } from "../common/reminders";

type PausedRow = { id: string; description: string; schedule: string };

/** A one-shot whose time has passed fires this long after it is resumed. */
const RESUME_GRACE_SECONDS = 60;

function toTaskSchedule(s: Schedule): TaskSchedule {
  switch (s.type) {
    case "cron":
      return { kind: "cron", cron: s.cron };
    case "interval":
      return { kind: "interval", seconds: s.intervalSeconds };
    case "scheduled":
    case "delayed":
      return { kind: "once", at: new Date(s.time * 1000).toISOString() };
  }
}

/**
 * Manages the assistant's scheduled tasks for the Tasks page and the chat
 * tools. The SDK can't pause a schedule, so pausing cancels it and parks its
 * definition in `paused_tasks`; resuming schedules it again (under a new id).
 */
export class Tasks {
  constructor(private readonly agent: ReminderAgent) {}

  private ensureTables() {
    this.agent.sql`CREATE TABLE IF NOT EXISTS paused_tasks (
      id TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      schedule TEXT NOT NULL
    )`;
  }

  private active() {
    return this.agent
      .getSchedules()
      .filter((s) => s.callback === "executeTask");
  }

  private paused() {
    this.ensureTables();
    return this.agent.sql<PausedRow>`
      SELECT id, description, schedule FROM paused_tasks`;
  }

  list(): ScheduledTask[] {
    const active = this.active()
      // oxlint-disable-next-line unicorn/no-array-sort -- a fresh copy from filter(); the Worker's lib has no toSorted
      .sort((a, b) => a.time - b.time)
      .map((s) => ({
        id: s.id,
        description: s.payload,
        schedule: toTaskSchedule(s),
        nextRun: new Date(s.time * 1000).toISOString(),
        paused: false
      }));
    const paused = this.paused().map((row) => ({
      id: row.id,
      description: row.description,
      schedule: JSON.parse(row.schedule) as TaskSchedule,
      nextRun: null,
      paused: true
    }));
    return [...active, ...paused];
  }

  private find(id: string) {
    const task = this.list().find((t) => t.id === id);
    if (!task) throw new Error(`No scheduled task with id ${id}.`);
    return task;
  }

  private async schedule(description: string, schedule: TaskSchedule) {
    switch (schedule.kind) {
      case "cron":
        await this.agent.schedule(schedule.cron, "executeTask", description);
        break;
      case "interval":
        await this.agent.scheduleEvery(
          schedule.seconds,
          "executeTask",
          description
        );
        break;
      case "once": {
        const at = new Date(schedule.at);
        const soonest = Date.now() + RESUME_GRACE_SECONDS * 1000;
        await this.agent.schedule(
          at.getTime() > soonest ? at : new Date(soonest),
          "executeTask",
          description,
          { idempotent: false }
        );
        break;
      }
    }
  }

  private async park(task: ScheduledTask) {
    this.ensureTables();
    this.agent.sql`INSERT OR REPLACE INTO paused_tasks
      (id, description, schedule)
      VALUES (${task.id}, ${task.description}, ${JSON.stringify(task.schedule)})`;
  }

  async pause(id: string) {
    const task = this.find(id);
    if (!task.paused) {
      await this.park(task);
      await this.agent.cancelSchedule(id);
    }
    return this.list();
  }

  async resume(id: string) {
    const task = this.find(id);
    if (task.paused) {
      await this.schedule(task.description, task.schedule);
      this.agent.sql`DELETE FROM paused_tasks WHERE id = ${id}`;
    }
    return this.list();
  }

  async remove(id: string) {
    const task = this.find(id);
    if (task.paused) this.agent.sql`DELETE FROM paused_tasks WHERE id = ${id}`;
    else await this.agent.cancelSchedule(id);
    return this.list();
  }

  /** Changes what a task says and/or when it runs; a paused task stays paused. */
  async update(
    id: string,
    change: { description?: string; schedule?: TaskSchedule }
  ) {
    const task = this.find(id);
    const description = change.description?.trim() || task.description;
    const schedule = change.schedule ?? task.schedule;
    if (task.paused) {
      this.agent.sql`UPDATE paused_tasks
        SET description = ${description}, schedule = ${JSON.stringify(schedule)}
        WHERE id = ${id}`;
    } else {
      await this.agent.cancelSchedule(id);
      await this.schedule(description, schedule);
    }
    return this.list();
  }
}
