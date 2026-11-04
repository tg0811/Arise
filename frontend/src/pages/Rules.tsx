import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import {
  ATTR_SCALE, BOSS_MULTIPLIER, FREE_REMOVE_MINUTES, CURVE_BASE, CURVE_FACTOR, CURVE_POWER, DAY_CLEAR_RATIO, DIFFICULTIES, DIFFICULTY_XP,
  MAX_LEVEL, MOOD_TIERS, RANKS, STREAK_TIERS, WEEKLY_BOSS_SHARE, attributeLevel, creditsFor, rankForLevel,
  totalXpForLevel, weeklyBossXp, xpToNext,
  GOAL_LATE_SHARE, GOAL_SIZES, JOURNAL_AAR_XP, LOOT_GEM_STREAK_STEP, LOOT_ODDS, LOOT_STREAK_BONUS_CAP, LOOT_STREAK_BONUS_PER_DAY, lootStreakBonus,
  GATE_TITLE_WEEKS, RUN_MIN_KM, RUN_XP, WORKOUT_XP,
} from '@shared';
import type { AppState } from '../lib/api';
import { DIFFICULTY_STYLE, rankColor } from '../lib/theme';
import { Panel, SectionTitle } from '../components/ui';

// Every number here is read from shared/engine.ts — the same code the server
// scores with — so the rule sheet can never drift from the actual game.

const pct = (n: number) => `${Math.round(n * 100)}%`;
const SAMPLE_LEVELS = [1, 2, 5, 10, 16, 17, 25, 33, 34, 50, 51, 67, 68, 84, 85, 99, 100];
const SAMPLE_ATTR_LEVELS = [2, 5, 10, 25, 50, 100];

function Table({ head, rows, highlight }: { head: string[]; rows: ReactNode[][]; highlight?: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>{head.map((h) => <th key={h} className="label px-3 py-2 text-left">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={`border-t border-line ${i === highlight ? 'bg-accent/15' : ''}`}>
              {r.map((c, j) => <td key={j} className="px-3 py-2 text-ink2 first:font-bold first:text-ink">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const Rule = ({ children }: { children: ReactNode }) => (
  <li className="flex gap-2.5 text-sm leading-relaxed text-ink2">
    <span className="mt-2 h-1.5 w-1.5 shrink-0 rotate-45 bg-accent" />
    <span>{children}</span>
  </li>
);

export function Rules({ s }: { s: AppState }) {
  const level = s.progress.level;
  const levelRow = SAMPLE_LEVELS.indexOf(level);
  const rankRow = RANKS.findIndex((r) => r.rank === s.progress.rank);
  const clear = pct(DAY_CLEAR_RATIO);

  return (
    <div className="pt-2">
      <Link to="/settings" className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-ink2 hover:text-ink">
        <ArrowLeft size={16} /> Settings
      </Link>
      <h1 className="mt-3 font-display text-2xl font-black tracking-[0.15em]">THE RULES OF THE SYSTEM</h1>
      <p className="mt-1 text-sm text-ink2">How every point is earned and lost. These numbers are the ones the System actually uses.</p>

      <SectionTitle>1 · Tasks</SectionTitle>
      <Panel className="p-4">
        <ul className="space-y-2">
          <Rule><b className="text-ink">Habits</b> repeat on the weekdays you choose. Each day they're scheduled, you report <b className="text-good">Complete</b> or <b className="text-bad">Fail</b>.</Rule>
          <Rule><b className="text-ink">Quests</b> are one-off missions with a deadline date and time. Clear them before the countdown hits zero.</Rule>
          <Rule>Habits, quests and goals can belong to <b className="text-ink">one or more categories</b> ({s.categories.map((c) => c.name).join(', ')}), or none. Their XP also trains those categories' attributes.</Rule>
        </ul>
      </Panel>

      <SectionTitle>2 · Difficulty</SectionTitle>
      <Panel brackets={false} className="p-1">
        <Table
          head={['Tier', 'Complete', 'Fail', 'Credits']}
          rows={DIFFICULTIES.map((d) => [
            <span style={{ color: DIFFICULTY_STYLE[d].color }}>{DIFFICULTY_STYLE[d].label}</span>,
            <span className="text-good">+{DIFFICULTY_XP[d]} XP</span>,
            <span className="text-bad">−{DIFFICULTY_XP[d]} XP</span>,
            `+${creditsFor(DIFFICULTY_XP[d])}`,
          ])}
        />
      </Panel>
      <ul className="mt-3 space-y-2 px-1">
        <Rule>What you can gain, you can lose. A task's fail costs exactly its base XP.</Rule>
        <Rule><b className="text-ink">Stakes are set once.</b> A quest's difficulty and type and a goal's XP can't be changed after you create them, and a habit's difficulty can only be <b className="text-ink">raised, starting the next day</b>. Nothing can be lowered before a fail, or raised just for a day you know you'll win.</Rule>
        <Rule><b className="text-ink">No escape hatches.</b> Deadlines of quests and goals can only move earlier. Changing a habit's weekdays applies from tomorrow, and deleting a habit that's still due today counts as today's fail.</Rule>
        <Rule><b className="text-ink">Mistakes are free to fix in the first {FREE_REMOVE_MINUTES} minutes.</b> A new habit can be deleted, or its difficulty and days changed, without penalty in its first hour. A habit added at night can <b className="text-ink">start tomorrow</b>, so it's never due on a day it can't be done.</Rule>
        <Rule>Credits are earned on completion only (XP ÷ 5) and are never taken away. Spend them in the Store.</Rule>
      </ul>

      <SectionTitle>3 · Failing &amp; deadlines</SectionTitle>
      <Panel className="p-4">
        <ul className="space-y-2">
          <Rule>Any habit left unresolved <b className="text-ink">fails automatically at midnight</b> ({s.profile.timezone}). The System settles missed days even while the app is closed.</Rule>
          <Rule>A habit's "by HH:MM" time is a promise, not a lock. It turns red when you're late, but you can still report honestly until midnight.</Rule>
          <Rule>A quest that reaches its deadline <b className="text-ink">fails automatically</b>, and the penalty lands on the day it was due.</Rule>
          <Rule><b className="text-ink">Abandoning</b> a quest costs its full XP. <b className="text-ink">Removing</b> one is free only in the first {FREE_REMOVE_MINUTES} minutes after you create it (for typos); after that it can only be abandoned.</Rule>
          <Rule><b className="text-ink">Undo</b> works for today's results only (and for quests, only before their deadline). Past days are final.</Rule>
          <Rule>Unscheduled days (rest days) neither count nor fail.</Rule>
        </ul>
      </Panel>

      <SectionTitle>4 · Streaks</SectionTitle>
      <Panel className="p-4">
        <p className="mb-2 text-sm font-bold text-ink">Habit streak: consecutive scheduled days completed</p>
        <Table
          head={['Streak', 'XP on completion']}
          rows={[
            ['1+ days', '×1'],
            ...[...STREAK_TIERS].reverse().map((t) => [`${t.days}+ days`, <span className="font-bold text-accent2">×{t.multiplier}</span>]),
          ]}
        />
        <ul className="mt-3 space-y-2">
          <Rule>The multiplier boosts only what you <i>gain</i>. A fail always costs the base amount, and it resets that habit's streak to 0.</Rule>
          <Rule><b className="text-ink">🔥 Daily streak:</b> consecutive days where you completed at least <b className="text-ink">{clear}</b> of that day's tasks (habits and quests due that day).</Rule>
          <Rule>Days with no tasks at all are neutral: they don't break the streak.</Rule>
          <Rule>Clearing {clear} also unlocks the <b className="text-ink">Random Box</b> (see 7), and a longer streak makes it richer.</Rule>
        </ul>
      </Panel>

      <SectionTitle>5 · Bosses &amp; chains</SectionTitle>
      <Panel className="p-4">
        <ul className="space-y-2">
          <Rule><b className="text-ink">Boss quest:</b> ×{BOSS_MULTIPLIER} XP both ways. A Hard boss is +{DIFFICULTY_XP.hard * BOSS_MULTIPLIER} / −{DIFFICULTY_XP.hard * BOSS_MULTIPLIER}.</Rule>
          <Rule>
            <b className="text-ink">Weekly Mega Boss:</b> worth ±{pct(WEEKLY_BOSS_SHARE)} of the XP you need for your next level, locked in when created.
            One per week (resets Monday). Right now that would be ±{weeklyBossXp(s.progress.need)} XP.
          </Rule>
          <Rule><b className="text-ink">Quest chains:</b> each part unlocks when the previous one is cleared, with its own time limit. Failing any part cancels the rest of the chain.</Rule>
        </ul>
      </Panel>

      <SectionTitle>6 · Major goals</SectionTitle>
      <Panel className="p-4">
        <ul className="mb-3 space-y-2">
          <Rule>Long-horizon targets: <b className="text-ink">Siege</b> (exam), <b className="text-ink">Forge</b> (project), <b className="text-ink">Gauntlet</b> (event). You choose the stakes.</Rule>
          <Rule>Finish before the deadline for the full XP (plus credits). If the deadline passes, you <b className="text-bad">lose the same XP once</b>, and the goal stays on your board.</Rule>
          <Rule>A goal finished after its deadline still earns {pct(GOAL_LATE_SHARE)} of the reward. Late is better than never.</Rule>
          <Rule>A goal's stakes never change once set, and its deadline can only move earlier (and is locked once it passes).</Rule>
          <Rule>Removing a goal is free in its first {FREE_REMOVE_MINUTES} minutes. After that, removing it costs its stake, like abandoning, unless the deadline penalty was already paid. A paid penalty is never refunded.</Rule>
        </ul>
        <Table head={['Size', 'On time', 'Missed', 'Late finish']}
          rows={GOAL_SIZES.map((g) => [g.label, <span className="text-good">+{g.xp}</span>, <span className="text-bad">−{g.xp}</span>, `+${Math.round(g.xp * GOAL_LATE_SHARE)}`])} />
      </Panel>

      <SectionTitle>7 · Random Box</SectionTitle>
      <Panel className="p-4">
        <ul className="mb-3 space-y-2">
          <Rule>Unlocks once {clear} of today's tasks are complete. One opening per day; it doesn't carry over.</Rule>
          <Rule>Streak bonus: +{pct(LOOT_STREAK_BONUS_PER_DAY)} per streak day on credits and XP (max +{pct(LOOT_STREAK_BONUS_CAP)}), and +1 gem per {LOOT_GEM_STREAK_STEP} streak days. Yours right now: +{pct(lootStreakBonus(s.streak.current))}.</Rule>
          <Rule>Item drops pick a random store reward ticked "Can be won free from the Random Box". Untick your big rewards so only saving up gets them.</Rule>
        </ul>
        <Table head={['Drop', 'Chance', 'Amount']}
          rows={LOOT_ODDS.map((o) => [<span className="capitalize">{o.type}</span>, pct(o.chance), o.type === 'item' ? '1 reward' : `${o.min}–${o.max}`])} />
      </Panel>

      <SectionTitle>8 · Store, journal &amp; titles</SectionTitle>
      <Panel className="p-4">
        <ul className="space-y-2">
          <Rule>The store holds <b className="text-ink">real-world rewards</b> that you price yourself. Buying moves one into your inventory; <b className="text-ink">Use</b> means you go enjoy it.</Rule>
          <Rule>Credits come from completing tasks and goals. Gems are rare and only drop from the Random Box, so price your biggest treats in gems.</Rule>
          <Rule>Writing an <b className="text-ink">after-action review</b> for a conquered or past-due goal earns +{JOURNAL_AAR_XP} Mind XP (once per goal). Free notes earn nothing; they're just for you.</Rule>
          <Rule><b className="text-ink">Titles</b> are earned by milestones, never luck: streaks, tasks completed, bosses, chains, goals, reviews, Random Boxes, max level, and an Adept (Lv 10) and Master (Lv 25) title for every category. Once earned, a title is yours even if the streak behind it breaks. Equip one on the Character page. You have {s.titles.filter((t) => t.unlocked).length} of {s.titles.length}.</Rule>
        </ul>
      </Panel>

      <SectionTitle>9 · Levels</SectionTitle>
      <Panel className="p-4">
        <ul className="mb-3 space-y-2">
          <Rule>Max level is <b className="text-ink">{MAX_LEVEL}</b>. XP to the next level = {CURVE_BASE} + {CURVE_FACTOR} × level<sup>{CURVE_POWER}</sup>, rounded to 10. Each level costs more than the last.</Rule>
          <Rule><b className="text-bad">You can fall.</b> Losing XP below your level's threshold drops you a level, and possibly a rank. Total XP never goes below 0.</Rule>
        </ul>
        <Table
          head={['Level', 'XP to next', 'Total XP to reach', 'Rank']}
          highlight={levelRow >= 0 ? levelRow : undefined}
          rows={SAMPLE_LEVELS.map((l) => [l, l >= MAX_LEVEL ? '—' : xpToNext(l).toLocaleString(), totalXpForLevel(l).toLocaleString(), rankForLevel(l).rank])}
        />
        <p className="mt-2 text-xs text-muted">You are level {level} with {s.progress.totalXp.toLocaleString()} total XP.</p>
      </Panel>

      <SectionTitle>10 · Ranks</SectionTitle>
      <Panel brackets={false} className="p-1">
        <Table
          head={['Rank', 'Title', 'Levels']}
          highlight={rankRow}
          rows={RANKS.map((r, i) => [
            <span className="font-display text-xl font-bold" style={{ color: rankColor(r.rank) }}>{r.rank}</span>,
            <span className="font-display tracking-wider">{r.title}</span>,
            `${r.minLevel}–${RANKS[i + 1] ? RANKS[i + 1].minLevel - 1 : MAX_LEVEL}`,
          ])}
        />
      </Panel>
      <ul className="mt-3 space-y-2 px-1">
        <Rule>Your rank colour, on the badge, title, aura and rank-up, shifts warm to cool as you climb: E ember → D amber → C emerald → B cyan → A blue → S shadow-monarch violet.</Rule>
        <Rule>Your avatar's aura grows with rank: E dim · D halo · C ring · B orbiting mote · A spinning motes · S corona.</Rule>
      </ul>

      <SectionTitle>11 · Attributes</SectionTitle>
      <Panel className="p-4">
        <ul className="mb-3 space-y-2">
          <Rule><b className="text-ink">Two separate counters, fed by the same XP.</b> Your <b className="text-ink">level and rank</b> count every gain and loss once, whatever its category (uncategorised tasks too). Each <b className="text-ink">category</b> ({s.categories.map((c) => c.name).join(', ')}) is an attribute with its own XP total.</Rule>
          <Rule>An attribute holds the <b className="text-ink">net XP</b> of its tasks: completions raise it, fails lower it (never below 0). Uncategorised tasks only count toward your level.</Rule>
          <Rule>A task with <b className="text-ink">several categories</b> gives each of them the <b className="text-ink">full XP</b>, and a fail costs each the same. Your level still counts it once: Japa Meditation (Hard) in Mind, Body, Soul and Intellect is +50 to each attribute but +50 level XP.</Rule>
          <Rule>Some XP goes to an attribute by itself: dungeon workouts train <b className="text-ink">Body</b>, after-action reviews train <b className="text-ink">Mind</b>, and a focus session trains the category you pick for it.</Rule>
          <Rule>Attribute level L is reached at {ATTR_SCALE} × (L−1)² XP. Unlike your level, attributes have <b className="text-ink">no cap</b>, and their curve flattens, so they keep climbing steadily.</Rule>
          <Rule>Attributes don't change your level or rank. They show the <b className="text-ink">shape</b> of your growth: three years of only Body would put Body past level 100 while Soul stays at 1, with the same overall level as a balanced player. They also earn titles: <b className="text-ink">Adept</b> at attribute level 10 and <b className="text-ink">Master</b> at 25, for every category.</Rule>
        </ul>
        <Table
          head={['Attribute level', 'XP needed']}
          rows={SAMPLE_ATTR_LEVELS.map((l) => [l, (ATTR_SCALE * (l - 1) ** 2).toLocaleString()])}
        />
        <p className="mt-2 text-xs text-muted">
          Yours: {s.categories.map((c) => `${c.name} ${attributeLevel(c.xp).level}`).join(' · ')}
        </p>
      </Panel>

      <SectionTitle>12 · Mood</SectionTitle>
      <Panel className="p-4">
        <p className="mb-2 text-sm text-ink2">Your share of tasks completed over the last 7 days:</p>
        <Table
          head={['Mood', 'Completion']}
          highlight={MOOD_TIERS.findIndex((t) => t.mood === s.mood)}
          rows={MOOD_TIERS.map((t, i) => [
            <span className="capitalize">{t.mood}</span>,
            i === MOOD_TIERS.length - 1 ? `below ${pct(MOOD_TIERS[i - 1].min)}` : `${pct(t.min)}+`,
          ])}
        />
        <p className="mt-2 text-xs text-muted">With no history yet, you start Steady.</p>
      </Panel>

      <SectionTitle>13 · The Instant Dungeon (workouts &amp; runs)</SectionTitle>
      <Panel className="p-4">
        <ul className="space-y-2">
          <Rule>Plan your week in the Instant Dungeon: each weekday is a workout day (with exercises) or a rest day.</Rule>
          <Rule>Finishing a planned workout gives <b className="text-good">+{WORKOUT_XP} XP</b>, counting toward your level like any task, and it trains <b className="text-ink">Body</b> (plus credits). A planned workout not finished by midnight costs <b className="text-bad">−{WORKOUT_XP}</b>. Rest days are neutral.</Rule>
          <Rule>Workout days count toward the daily {clear} clear, just like a task. Extra sessions on rest days are logged (PRs, history) but give no XP.</Rule>
          <Rule><b className="text-ink">Weekly streak:</b> a week counts only if every planned workout in it was done. This week never breaks the streak until a workout is actually missed.</Rule>
          <Rule><b className="text-ink">Runs:</b> record the distance (km or miles) and time; the pace is worked out for you. The first run of the day of at least {RUN_MIN_KM} km gives <b className="text-good">+{RUN_XP} XP</b> to <b className="text-ink">Body</b> (plus credits). More runs that day are kept in your history without XP. Runs are logged for today only, and can be removed the same day if you made a typo. Missing a run costs nothing.</Rule>
          <Rule>Records: heaviest weight, most reps, estimated 1RM (weight × (1 + reps ÷ 30)), longest distance and time.</Rule>
          <Rule>Titles: Dungeon Initiate (first workout), Iron Disciple ({GATE_TITLE_WEEKS.iron}-week streak), Dungeon Breaker ({GATE_TITLE_WEEKS.breaker}-week streak), Centurion of Iron (100 workouts).</Rule>
        </ul>
      </Panel>

      <SectionTitle>14 · The covenant</SectionTitle>
      <Panel className="p-4">
        <ul className="space-y-2">
          <Rule>Report honestly. The System only knows what you tell it. The only one you can cheat is yourself.</Rule>
          <Rule>Make Hard mean hard. If missing it wouldn't hurt, it isn't Hard.</Rule>
        </ul>
      </Panel>
    </div>
  );
}
