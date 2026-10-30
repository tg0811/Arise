import { buildState, type Ctx } from './game.ts';
import { goalsState } from './goals.ts';
import { economyState } from './economy.ts';
import { journalState } from './journal.ts';
import { evaluateTitles } from './titles.ts';
import { focusState } from './focus.ts';
import { getPrefs, subscriptionCount } from './reminders.ts';

/** The whole app state the client renders from; every mutation returns it. */
export function fullState(ctx: Ctx) {
  const core = buildState(ctx);
  const titles = evaluateTitles(ctx);
  const { equipped_title } = ctx.db.prepare('SELECT equipped_title FROM profile WHERE id = 1').get() as { equipped_title: string | null };
  const equipped = titles.find((t) => t.key === equipped_title && t.unlocked) ?? null;
  return {
    ...core,
    goals: goalsState(ctx),
    ...economyState(ctx, core.streak.today.cleared),
    journal: journalState(ctx),
    titles,
    equippedTitle: equipped ? { key: equipped.key, name: equipped.name } : null,
    focus: focusState(ctx),
    reminders: { ...getPrefs(ctx.db), devices: subscriptionCount(ctx.db) },
  };
}
