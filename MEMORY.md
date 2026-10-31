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
- **Major Goals (decided 2026-10-30):** types Siege (exam) / Forge (project) / Gauntlet (event). Stakes are size presets: Small 250 · Medium 500 · Large 1000 · Epic 2000 XP. **Reward = penalty** (gain = loss). A missed deadline charges once and the goal **stays**; finishing late earns **50%**. Stakes and deadline lock after the miss. Removing never refunds.
- **Daily payload (lootbox):** unlocks at ≥80% of today's tasks, one per day. Odds: 50% credits 25–75 · 25% XP 25–75 · 10% gems 1–2 · 15% a store reward flagged "lootable". Streak: +2%/day on credits/XP (cap +100%), +1 gem per 10 streak days.
- **Store = real-world rewards only** (no buffs; the owner skipped them). Priced in credits or gems. Seeded with 6 editable starters. Items are archived, never deleted. Inventory keeps one row per unit; "Use" = redeem.
- **Journal:** free notes (no XP) + After-Action Reviews (planned / happened / why / next) for conquered or past-due goals. The first AAR per goal gives **+25 Mind XP**.
- **Titles (decided 2026-10-31):** earned by deterministic milestones only (no loot). 15 fixed (First Blood, Centurion, Thousand Trials, Iron Will 7d, The Unbroken 30d, The Relentless 100d, Oath Keeper (30-day habit), Boss Slayer, Monarch Hunter (5 mega bosses), Chain Breaker, Conqueror, Warlord, The Reflective, Treasure Hunter, Shadow Monarch at Lv 100) plus **{Category} Adept (Lv 10) / Master (Lv 25)** for every category. Unlocks persist in `title_unlocks` even if the streak breaks. One can be equipped (shown on Character, and in the header on wider screens).
- **Navigation (2026-10-31):** phone tabs are Today · Goals · Store · Archive · Character. Settings sits behind the header gear (desktop sidebar keeps all six).
- **Focus timer (decided 2026-10-31):** 1.5 XP + 0.5 credits per *planned* minute (5–240) into the chosen category. Server-timed (survives closing the app). Can only be claimed after **50%** of the planned time; finishing early gives up to **+50%** (at exactly half time). Overtime earns the base. Abandoning costs and earns nothing. The screen stays awake while a session runs.
- **Reminders (decided 2026-10-31):** Web Push from the server's minute tick. Interval reminder "N of M tasks still undone" (default every 3h) counts only today's scheduled tasks, never fires in quiet hours (default 23:00–07:00) or when all are done, and starts its clock at subscribe. Deadline nudges (default 30 min before a habit's "by" time or a quest deadline) ignore quiet hours and fire once. Major goals get one 24h heads-up. Dead subscriptions are auto-removed. **"Send test notification" button in Settings is TEMPORARY** (owner request 2026-10-31): remove it once notifications are verified on the phone.
- **Data:** backup = all game tables + game settings as JSON (never password, sessions, VAPID keys or push devices). Restore validates first and tolerates older backups. Reset needs the typed phrase `I ACCEPT THE RESET`, wipes everything back to the Awakening, and keeps login and devices.
- **Feel:** synthesized Web Audio SFX (toggle per device). 8 generative canvas sims behind level-up (blue) / rank-up (rank colour). Rank-scaled ambient particles (god rays at S). One-time S-rank 6-frame cutscene (localStorage flag). Typewriter Awakening. Header "Saving" indicator. All motion respects prefers-reduced-motion.
- **Private habits (decided 2026-10-31):** a `private` flag per habit. The "master password" is the login password. While locked, the **server never sends** the name, description or category (title becomes `• • • • • • • •`; category hidden). The habit can still be completed or failed, and its XP still trains the category. Tapping the name or pencil asks for the password. Unlock lasts **5 minutes per login session** (`sessions.private_until`) or until "Lock now". Edit and delete are refused while locked. Masked everywhere it could leak: Archive streaks, history notes ("Completed: • • • •") and push nudges ("🔒 Private habit"). Backups contain everything. Quests can't be private (not requested).
- **The Instant Dungeon — workout dimension (decided 2026-11-01, phase 5; owner's final name after trying "The Gate" and "Iron Temple").** Named after Jinwoo's private System training dungeon. Code, routes and API still say `gate` internally (`/gate`, `/api/gate`, `gateState`, `data-dimension="gate"`); visible labels: tab **Dungeon**, header **INSTANT DUNGEON**. Portal: "ENTERING THE DUNGEON" / "[ You have entered the Instant Dungeon. ]"; on exit: "ARISE" / "[ Dungeon cleared. You leave stronger than you entered. ]". Titles (keys unchanged): Dungeon Initiate (`gatekeeper`), Dungeon Breaker (`dungeon_breaker`).
  Original design: its own section with a crimson "Red Gate" palette (`:root[data-dimension="gate"]` overrides the `--sl-*` vars) and its own layout: "‹ Arise" back button, streak, and tabs Today · Plan · History · Exercises. A vortex portal transition plays on enter and exit. **Entry = an ordinary bottom tab in Archive's slot, crimson icon only, no glow** (the owner rejected a glowing center button and a 6th tab). Archive moved into Character as a tab (Profile | Archive).
  Rules: Mon–Sun plan; a day with exercises that isn't Rest is a workout day. **Finish = +50 Body XP (+10 credits); a missed planned day = −50 at midnight** (settled with habits). Rest days are neutral. Days before the plan was first saved (`workout_schedule_since`) are never charged. Workout days count in the daily 80% clear and in reminders. Extra sessions on rest days are logged but give **no XP**. Finishing needs ≥1 ticked set; same-day undo. **Weekly streak is strict:** a week counts only if every planned day was done; the current week can't break the streak until a day is missed. Sets × reps × kg (cardio: min/km), pre-filled from last time. PRs: heaviest, e1RM (Epley), most reps, longest km/time. A rest timer runs after each tick. Titles: Gatekeeper, Iron Disciple (4 wk), Dungeon Breaker (12 wk), Centurion of Iron (100).
  Set edits save numbers only; only the ✓ changes done-ness (prevents a blur/tick race from unticking).
- **Mood** = completion rate over the last 7 days: Radiant ≥90% · Steady ≥60% · Worn ≥30% · Broken.
- **UI palette (revised 2026-10-31):** a fixed **Solo Leveling / LevelUp "System" blue** for all chrome: bg `#020617`, panels `#0f172a` glass with a faint inner blue glow, accent blue `#3b82f6`, accent2 cyan `#22d3ee`, corner brackets in blue. **The warm → cool shift applies only to rank elements** via `--sl-rank` (`text-rank` utilities; `RANK_COLORS` / `rankColor()` in `frontend/src/lib/theme.ts`): E ember `#d97757` → D amber → C emerald → B cyan → A blue → S shadow-monarch violet `#a78bfa`. Rank elements: header rank line, Character title and rank letter, avatar aura and LV badge, rank-up splash, rank ladder and Rules table (each rank in its own colour), one faint corner glow. **Fonts:** Outfit (body) + **Rajdhani** (display/HUD), which replaced Cinzel at the owner's choice.
- **Avatar:** the owner's profile picture, framed by a rank aura that evolves (E dim → D halo → C ring → B mote → A spinning motes → S corona). No star/class picker.
- **Screen time (The Veil):** a manual habit, now best under **Mind** (it's a discipline). Over the threshold = Fail.

## Architecture (decided 2026-10-30)
- **Monorepo, npm workspaces:** `shared/` (game engine: curve, ranks, tiers, all pure TS) · `backend/` · `frontend/`.
- **Backend:** Node 26 running TypeScript natively (no build step) · Hono · built-in `node:sqlite` · single-user password auth with a session cookie. The server is the source of truth, which also gives free sync across devices. Settlement runs on every request plus once a minute (idempotent).
- **Frontend:** React + Vite + TypeScript + Tailwind v4 + TanStack Query + framer-motion + lucide · `vite-plugin-pwa`.
- **Prod:** one Docker container (the backend also serves the built frontend) behind Caddy for auto-HTTPS on Hetzner.
- **Data model:** XP and currency are **ledgers** (`xp_events`, `currency_events`). Level, rank, attributes and wallet are all derived from them, the same idea as THE-SYSTEM's "derive from logs".

## Build phases
1. ✅ **Foundation + core loop:** auth, onboarding, categories, habits, quests (chains/boss/weekly), XP/levels/ranks/de-leveling, attributes, streaks, settlement, header, Today page, Character page, rank theming, PWA shell.
2. ✅ **Goals & economy:** Major Goals (G1/G2), My State (G3), wallet, lootbox at 80%, store, real-world rewards, inventory, journal/AAR (R1).
3. ✅ **History & insight:** Archive (overview/history/streaks), 28-day heatmap, KPI cards, weekly XP chart, System Mechanics page, titles (M7).
4. ✅ **Feel & reach:** Web Push interval reminders + quiet hours (**reminders count only tasks scheduled *today*; a habit's rest days never notify; send nothing when all are done**; proposed: a per-habit nudge before its "by HH:MM" deadline, e.g. 30 min before, on scheduled days only. Needs the HTTPS deploy to test on the phone), focus timer (F1), level-up generative art + sound, rank ascension splash, S-rank cutscene, ambient particles, Awakening cinematic polish, backup/restore/typed-phrase reset.
5. ✅ **The Instant Dungeon (workout dimension):** added 2026-11-01 at the owner's request.
6. **Deploy:** Docker + Caddy on Hetzner (`tghf-prod`, `/opt/tghf/solo-leveling`), auto Let's Encrypt on `89-167-82-104.sslip.io` until the owner buys a domain (e.g. `arise.<domain>.com`; switch = edit `DOMAIN` in `deploy/.env`, new origin so reinstall the PWA + re-enable push). Files: `Dockerfile`, `deploy/` (compose, Caddyfile, backup.sh), `deploy.sh` (rsync + rebuild). **The server DB is the live one from now on; local `data/` is a dev copy.** Never expose plain HTTP. The trading-bot service on the same box must never be touched.

## Implementation notes (non-obvious)
- Node runs `.ts` directly, so backend imports use `.ts` extensions and only erasable TS syntax (no enums or parameter properties). Shared code is imported by relative path (`../../shared/engine.ts`) because Node won't type-strip inside `node_modules`.
- Custom CSS classes (`.glass`, `.field`) live in `@layer components` so Tailwind utilities can override them.
- Form pickers use `role="group"`, not `<label>`; a label wrapping buttons makes taps on its caption toggle the first button.
- Habit deadline time is display-only ("late" after it). Honest self-report until midnight, then auto-fail.
- Removing a pending quest is penalty-free (escape hatch). Abandoning costs its XP.

- **Blank page after login (incident 2026-10-31), real cause:** `useEffect(() => window.scrollTo(0, 0), …)` in Layout returned scrollTo's result. **Newer Chrome returns a Promise from scrollTo**; React then calls it as the cleanup → `TypeError: destroy is not a function`. In dev, StrictMode runs cleanups immediately, so it crashed right after login; in prod it would crash on the first tab change. Firefox and older Chromium return `undefined`, which is why it only hit the owner's Chrome (desktop + phone). **Rule: effects always use a block body `() => { … }`, never an expression body.** An on-screen ErrorBoundary now shows crashes instead of a blank page.
- **No service worker in dev:** the earlier suspect (dev-mode SW serving a cached index.html) was a red herring, but removing `devOptions` stays: dev SWs + Vite are fragile. `frontend/public/dev-sw.js` self-destroys any old one (delete after 2026-12). Test push with the production build or on the HTTPS deploy.
- **Never run a second Vite dev server from `frontend/` while the owner's is running:** both share `node_modules/.vite`, and a different config rebuilds that cache under the owner's server. Verify with the production build on a separate port instead.

## Open questions
- [ ] Weight trend chart and BMI on Character? (Data is already logged daily.)
- [ ] Discuss: does the global streak also give a small XP bonus, or only scale the lootbox? (Currently lootbox only.)
- [ ] Skills (K1–K6) are deferred ("Not now"). Q9 (link quests to topics) depends on them, so it is deferred too.
- [ ] Maybes for later: mystery quests, weekday frequency (built into habits already), story arcs, 180-day journey / ascension map / final judgement, story/system log, dev testing panel.
- [ ] Domain / subdomain on the Hetzner box (fallback: sslip.io; see phase 5).

## PWA feasibility notes
- ✅ Web Push on Android (HTTPS + service worker + VAPID).
- ✅ Wake Lock + `visibilitychange` for focus modes.
- ✅ Server-side midnight settlement.
- ❌ Reading other apps' screen time. The Veil is manual instead (decided).

## Progress
- **2026-11-01**: **Phase 5 (The Gate) built and verified.** 41/41 backend tests (8 new). Browser run on the production build: plan built in the UI, workout logged with pre-fills, all ticks saved, +50 Body XP, day cleared, Gatekeeper unlocked; History, exercise chart, back to Arise (palette restored), Character → Archive tab. Migration 8 applies to the real DB. Deploy is now phase 6.
- **2026-10-31**: Private habits added (6 backend tests; browser-verified: nothing leaks while locked, a wrong password stays locked, unlock reveals, lock re-masks the Archive). Migration 7. Note: the habit/quest **description field already existed**; the owner hadn't noticed it.
- **2026-10-31**: Blank-page bug: the root cause was a phase 3 scroll effect returning a Promise in newer Chrome (see Implementation notes), not phase 4. The owner's on-screen error screen pinpointed it. Fix reproduced and verified (old code crashes, fixed code renders, with Promise-returning scrollTo).
- **2026-10-31**: **Phase 4 built and verified.** 27/27 backend tests (7 new: focus rules, reminder timing/quiet hours/nudges/dedup/dead subs, backup→reset→restore). Real web-push send verified against a local HTTPS fake push service: aes128gcm payload decrypts intact, VAPID header present. The SW push handler was verified by injecting a push via Chrome DevTools Protocol. Headless Chromium can't subscribe to a real push service (known limitation), so **phone push needs the HTTPS deploy to test**. Migration 6 applies to the real DB. Starter rewards are now seeded by `seedRewards()` (same result).
- **2026-10-31**: **Phase 3 built and verified.** Archive (Overview: KPI tiles + 28-day heatmap + weekly XP gained/lost chart + record; History: ledger by day with paging; Streaks: per-habit current/best/success + 28-day strip). Titles + equip + unlock toasts. Chart colours validated (gain `#3b82f6` / loss `#ef4444` on navy; heatmap is a monotonic blue ramp). Pages now scroll to top on navigation. 20/20 backend tests. Browser run on 20 seeded days had no errors. Migration 5 applies to the real DB.
- **2026-10-31**: Re-themed to System blue. Rank colour only on rank elements; Rajdhani headings. Verified at E/C/S in the browser, including a live rank-up into S.
- **2026-10-30**: **Phase 2 built and verified** (owner will test 2026-10-31). Major Goals, Mission (My State), Journal + AAR, daily payload, Store + Inventory, new nav tabs (Today · Goals · Store · Character · Settings), Rules page extended (sections 6–8). Backend 16/16 tests pass (7 new). A full browser walkthrough had no errors and the ledger math matched exactly. Migration 4 applies cleanly to the owner's real DB.
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
