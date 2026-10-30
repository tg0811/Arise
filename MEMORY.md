# SoloLeveling — Project Memory

The living record for this project: decisions, open questions and progress. Update it as we go.
Newest entries go at the top of each section. Dates are absolute.

## Vision
A personal, self-hosted **PWA** that turns daily life into a Solo Leveling–style RPG. It merges two existing apps:
- **LevelUp** (`../Levelup-app`): React + Vite + Tailwind. **Its UI is the preferred base.**
- **THE-SYSTEM** (`../THE-SYSTEM/the-system`): React Native/Expo. **Its difficulty-tiered recurring tasks and rank titles are adopted.**

Built *for the owner*, fully customizable. Installed from the browser with "Add to Home screen" on Android.

## Hard rules (from the owner)
- Git repo = `SoloLeveling/` only, pushed to `git@github.com:tg0811/Arise.git`. Never commit anything from outside this folder.
- **No AI in the app.** No generation, no chat, nothing "AI slop". Every feature is manual and deterministic.
- PWA only, no APK. Hosted on the owner's **Hetzner** server.
- The owner must be able to **fall**: de-leveling and de-ranking are required.
- Everything lives in `Arise/SoloLeveling/`. Feature picks: `docs/feature-picks.md` (source of truth for scope).

## Game design (decided)
- **Difficulty tiers, gain = loss:** Easy ±10 · Normal ±25 · Hard ±50 · Legendary ±100 XP. Completion also gives credits (= XP/5).
- **Level cap 100**, with a steep curve: XP to next level = `round10(100 + 8·L^1.5)` (Lv1→2 ≈ 110, Lv50 ≈ 2,930, Lv99 ≈ 7,980; ~326k total).
  Total XP is a ledger with a running floor of 0. Level and rank are *derived* from it, so falling XP drops levels and ranks naturally.
- **Ranks (equal bands) with THE-SYSTEM titles:** E Awakened 1–16 · D Tested 17–33 · C Disciplined 34–50 · B Forged 51–67 · A Sovereign 68–84 · S Transcendent 85–100.
- **Categories (= attributes):** Mind, Body, Soul (renamed from Spirit), Intellect. User-editable, more can be added. *(Social Media and Finance were dropped on 2026-10-30: "felt off". Migration 3 deletes them, or archives them if they were used.)*
  Each category's attribute XP = net XP of its tasks (completions add, fails subtract, floor 0). Attribute level = `floor(sqrt(xp/25)) + 1`.
- **Streaks: "two layers, one rule":**
  - Per-habit streak multiplies only that habit's XP gain: 7d ×1.25 · 14d ×1.5 · 30d ×2 · 90d ×3. Fails always lose the base amount.
  - Global 🔥 streak = consecutive days with ≥80% of that day's tasks completed. Days with no tasks are neutral. The same 80% rule unlocks the **daily lootbox**, and the streak scales the lootbox.
- **Two kinds of task:**
  - **Habits** (THE-SYSTEM disciplines): recurring, optional weekdays, optional deadline time (displayed only). Self-report Complete or Fail. Anything unresolved auto-fails at midnight in the server's settlement.
  - **Quests** (LevelUp): one-off, with a deadline date+time and live countdown; auto-fail when the deadline passes. Options: **chains** (multi-part; next part unlocks on completion, a fail cancels the rest), **boss** (×3 both ways), **weekly mega boss** (max 1 per week; ±25% of the XP needed for the next level, frozen at creation).
- **Major Goals:** a missed deadline applies the penalty once, and the goal **stays** (marked past due) until the owner removes it.
- **Mood** = completion rate over the last 7 days: Radiant ≥90% · Steady ≥60% · Worn ≥30% · Broken.
- **Palette goes warm → cool with rank:** E looks like THE-SYSTEM (warm charcoal, coral) and S looks like LevelUp (deep navy, blue/violet glass). Panels: LevelUp glass plus THE-SYSTEM corner brackets. Fonts: Outfit (body), Cinzel (display).
- **Avatar:** the owner's profile picture, framed by a rank aura that evolves (E dim → D halo → C ring → B mote → A spinning motes → S corona). No star/class picker.
- **Screen time (The Veil):** a manual habit, now best under **Mind** (it's a discipline). Over the threshold = Fail.

## Architecture (decided 2026-10-30)
- **Monorepo, npm workspaces:** `shared/` (game engine: curve, ranks, tiers, all pure TS) · `backend/` · `frontend/`.
- **Backend:** Node 26 running TypeScript natively (no build step) · Hono · built-in `node:sqlite` · single-user password auth with a session cookie. The server is the source of truth, which also gives free sync across devices. Settlement runs on every request plus once a minute (idempotent).
- **Frontend:** React + Vite + TypeScript + Tailwind v4 + TanStack Query + framer-motion + lucide · `vite-plugin-pwa`.
- **Prod:** one Docker container (the backend also serves the built frontend) behind Caddy for auto-HTTPS on Hetzner.
- **Data model:** XP and currency are **ledgers** (`xp_events`, `currency_events`). Level, rank, attributes and wallet are all derived from them, the same idea as THE-SYSTEM's "derive from logs".

## Build phases
1. **Foundation + core loop:** auth, onboarding, categories, habits, quests (chains/boss/weekly), XP/levels/ranks/de-leveling, attributes, streaks, settlement, header, Today page, Character page, rank theming, PWA shell.
2. **Goals & economy:** Major Goals (G1/G2), My State (G3), wallet, lootbox at 80%, store, real-world rewards, inventory, journal/AAR (R1).
3. **History & insight:** Archive (overview/history/streaks), 28-day heatmap, KPI cards, weekly XP chart, System Mechanics page, titles (M7).
4. **Feel & reach:** Web Push interval reminders + quiet hours (**reminders count only tasks scheduled *today*; a habit's rest days never notify; send nothing when all are done**; proposed: a per-habit nudge before its "by HH:MM" deadline, e.g. 30 min before, on scheduled days only. Needs the HTTPS deploy to test on the phone), focus timer (F1), level-up generative art + sound, rank ascension splash, S-rank cutscene, ambient particles, Awakening cinematic polish, backup/restore/typed-phrase reset.
5. **Deploy:** Docker + Caddy on Hetzner.

## Implementation notes (non-obvious)
- Node runs `.ts` directly, so backend imports use `.ts` extensions and only erasable TS syntax (no enums or parameter properties). Shared code is imported by relative path (`../../shared/engine.ts`) because Node won't type-strip inside `node_modules`.
- Custom CSS classes (`.glass`, `.field`) live in `@layer components` so Tailwind utilities can override them.
- Form pickers use `role="group"`, not `<label>`; a label wrapping buttons makes taps on its caption toggle the first button.
- Habit deadline time is display-only ("late" after it). Honest self-report until midnight, then auto-fail.
- Removing a pending quest is penalty-free (escape hatch). Abandoning costs its XP.

## Open questions
- [ ] Weight trend chart and BMI on Character? (Data is already logged daily.)
- [ ] Discuss: does the global streak also give a small XP bonus, or only scale the lootbox? (Currently lootbox only.)
- [ ] Lootbox contents and store item ideas (phase 2).
- [ ] Skills (K1–K6) are deferred ("Not now"). Q9 (link quests to topics) depends on them, so it is deferred too.
- [ ] Maybes for later: mystery quests, weekday frequency (built into habits already), story arcs, 180-day journey / ascension map / final judgement, story/system log, dev testing panel.
- [ ] Domain / subdomain on the Hetzner box.

## PWA feasibility notes
- ✅ Web Push on Android (HTTPS + service worker + VAPID).
- ✅ Wake Lock + `visibilitychange` for focus modes.
- ✅ Server-side midnight settlement.
- ❌ Reading other apps' screen time. The Veil is manual instead (decided).

## Progress
- **2026-10-30**: Added **Rules of the System** page (Settings → `/settings/rules`; covers feature A6 early). Every number is read from `shared/engine.ts` (new constants: `CURVE_*`, `ATTR_SCALE`, `MOOD_TIERS`, `weeklyBossXp`), so the sheet cannot drift from the scoring. **When a rule changes, change the engine constant; the page updates itself.** Sections not yet built are marked "coming".
- **2026-10-30**: Removed Social Media and Finance categories (migration 3).
- **2026-10-30**: Pushed to **github.com/tg0811/Arise** (private, branch `main`). Only `SoloLeveling/` is versioned: the repo root *is* this folder. The reference apps in `Arise/` stay out.
- **2026-10-30**: **Phase 1 built and verified.** Backend has 9 passing tests (auth, gain = loss, floor at 0, de-leveling, 7-day multiplier, midnight auto-fail, weekday schedules, chains, boss/weekly boss, weight log). The real PWA build was walked end to end in headless Chromium at phone and desktop sizes with no console errors.
  Built: password setup/login, Awakening onboarding (name → photo → height/weight → covenant), Today (clear-progress bar with the 80% line, habits with Complete/Fail/Undo, quests with countdown/chain/boss/abandon/remove), create/edit sheet, Character (avatar aura, rank, level, mood, attributes, rank ladder), Settings (profile, photo, height, categories CRUD, logout), level-up/fallen splash, rank theming, PWA manifest + icons.
- **2026-10-30**: Owner request: **height 167 cm and weight (75 kg, editable with a pen icon) shown wherever the avatar is** (header, Character, Settings). Weight is stored as a daily log (`weight_logs`, latest = current) so it can be charted later.
- **2026-10-30**: Phase 1 started.
- **2026-10-30**: Owner submitted `docs/feature-picks.md` (63 must / 18 maybe / 42 skip). Decided ranks, streaks, categories, skills = not now.
- **2026-10-30**: Added a general-notes section to `docs/features.html`.
- **2026-10-30**: Analyzed both repos and wrote `docs/features.html` (123 features).
