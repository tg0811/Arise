import { buildState, type Ctx } from './game.ts';
import { goalsState } from './goals.ts';
import { economyState } from './economy.ts';
import { journalState } from './journal.ts';

/** The whole app state the client renders from; every mutation returns it. */
export function fullState(ctx: Ctx) {
  const core = buildState(ctx);
  return {
    ...core,
    goals: goalsState(ctx),
    ...economyState(ctx, core.streak.today.cleared),
    journal: journalState(ctx),
  };
}
