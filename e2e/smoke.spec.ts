import { test, expect, type Page } from '@playwright/test';
import { E2E_PASSWORD } from './env';

// One walk through the whole app, in order, on a fresh database. Each step builds on the last
// (onboarded → habit → quest → credits → store…), so the file runs serially in one page.
test.describe.configure({ mode: 'serial' });

let page: Page;
const pageErrors: string[] = [];

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  // Newer Chrome returns a Promise from scrollTo; an effect returning it crashed the app once. Keep that covered.
  await page.addInitScript(() => {
    const original = window.scrollTo.bind(window);
    (window as any).scrollTo = (...a: any[]) => { (original as any)(...a); return Promise.resolve(); };
  });
  page.on('pageerror', (e) => pageErrors.push(e.message));
});

test.afterEach(() => {
  expect(pageErrors, 'no uncaught errors in the page').toEqual([]);
});

test.afterAll(async () => { await page.close(); });

const button = (name: string) => page.getByRole('button', { name, exact: true });
const sheet = () => page.locator('div.fixed.inset-0.z-50');
const sheetTitle = () => sheet().locator('h3.font-display');

test('login asks only for the password and rejects a wrong one', async () => {
  await page.goto('/');
  await expect(page.locator('input')).toHaveCount(1);
  await page.getByPlaceholder('Password').fill('wrong-password');
  await button('Enter').click();
  await expect(page.getByText('Wrong password')).toBeVisible();
  await page.getByPlaceholder('Password').fill(E2E_PASSWORD);
  await button('Enter').click();
  await expect(page.getByText('THE SYSTEM HAS DETECTED')).toBeVisible();
});

test('awakening needs a full name and a valid username', async () => {
  await page.getByText('THE SYSTEM HAS DETECTED').click();
  await page.getByPlaceholder('Full name').fill('Sung Jinwoo');
  await page.getByPlaceholder('Username').fill('bad name');
  await expect(button('Confirm')).toBeDisabled();
  await page.getByPlaceholder('Username').fill('shadow_monarch');
  await button('Confirm').click();
  await button('Skip for now').click();
  await button('Continue').click();
  await button('I accept').click();
  await expect(page.getByText('Daily Habits')).toBeVisible();
  await expect(page.locator('header h1')).toHaveText('shadow_monarch');
});

test('habit: create with several categories, see its days, open details, edit, complete and undo', async () => {
  await page.getByLabel('Add', { exact: true }).click();
  await page.getByPlaceholder('Sleep by 22:30').fill('Read 20 pages');
  // Several categories: tap to add, tap again to remove.
  for (const c of ['Mind', 'Soul', 'Intellect']) await sheet().getByRole('button', { name: c, exact: true }).click();
  await sheet().getByRole('button', { name: 'Intellect', exact: true }).click();
  await expect(sheet().getByRole('button', { name: 'Intellect', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(sheet().getByText('Trains 2 attributes')).toBeVisible();
  await button('Create habit').click();
  const card = page.locator('div.glass', { hasText: 'Read 20 pages' }).first();
  await expect(card.getByText('Every day')).toBeVisible();
  await expect(card.getByText('Mind', { exact: true })).toBeVisible();
  await expect(card.getByText('Soul', { exact: true })).toBeVisible();
  await expect(card.getByText('Intellect', { exact: true })).toHaveCount(0);

  await card.getByRole('button', { name: 'Read 20 pages' }).click();
  await expect(sheetTitle()).toHaveText('Habit');
  await expect(page.getByText('Repeats')).toBeVisible();
  await sheet().getByRole('button', { name: 'Edit' }).click();
  await expect(sheetTitle()).toHaveText('Edit habit');
  await sheet().locator('input.field').first().fill('Read 30 pages');
  await sheet().getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Read 30 pages')).toBeVisible();

  const edited = page.locator('div.glass', { hasText: 'Read 30 pages' }).first();
  await edited.getByRole('button', { name: 'Complete', exact: true }).click();
  await expect(edited.getByText(/^\+\d+ XP$/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close' })).toHaveCount(0); // Complete must not open the card
  await edited.getByRole('button', { name: 'Undo' }).click();
  await expect(edited.getByRole('button', { name: 'Complete', exact: true })).toBeVisible();
});

test('quest: the quest section Add opens on the Quest tab; clearing pays XP and credits', async () => {
  await page.getByText('No active quests').click();
  await expect(page.getByPlaceholder('Finish the API refactor')).toBeVisible();
  await page.getByPlaceholder('Finish the API refactor').fill('Pay the electricity bill');
  await button('Accept quest').click();
  const card = page.locator('div.glass', { hasText: 'Pay the electricity bill' }).first();
  await card.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(card.getByText('+25 XP')).toBeVisible();
});

test('private quest is masked until unlocked with the password', async () => {
  await page.getByLabel('Add', { exact: true }).click();
  await button('Quest One-off, with deadline').click();
  await page.getByPlaceholder('Finish the API refactor').fill('Secret errand');
  await page.getByText('Private quest', { exact: true }).click();
  await button('Accept quest').click();
  await expect(page.getByText('Secret errand')).toHaveCount(0);
  await page.getByRole('button', { name: '• • • • • • • •' }).first().click();
  await page.locator('input[type=password]').fill(E2E_PASSWORD);
  await button('Unlock').click();
  await expect(page.getByText('Secret errand')).toBeVisible();
  await button('Lock now').click();
  await expect(page.getByText('Secret errand')).toHaveCount(0);
});

test('goals: set a major goal', async () => {
  await page.goto('/goals');
  await page.getByRole('button', { name: 'New goal' }).first().click();
  await page.getByPlaceholder('Clear the semester finals').fill('Run a half marathon');
  await button('Set goal').click();
  await expect(page.getByText('Run a half marathon')).toBeVisible();
});

test('store: add a reward, buy it with quest credits, use it from the inventory', async () => {
  await page.goto('/store');
  await page.getByRole('button', { name: 'New reward' }).click();
  await page.getByPlaceholder('New headphones').fill('Test treat');
  await page.locator('input[type=number]').fill('1');
  await button('Add to store').click();
  const item = page.locator('div', { has: page.getByRole('heading', { name: 'Test treat' }) }).last();
  await item.getByRole('button', { name: 'Buy' }).click();
  await expect(page.getByText('Acquired: Test treat')).toBeVisible();
  await page.getByRole('button', { name: /Inventory/ }).click();
  await page.getByRole('button', { name: 'Use' }).first().click();
  await expect(page.getByText(/enjoy it, you earned it/)).toBeVisible();
});

test('instant dungeon: enter, switch tabs, return to Arise', async () => {
  await page.goto('/');
  await page.getByRole('link', { name: /Dungeon/ }).first().click();
  await expect(page.getByRole('heading', { name: 'INSTANT DUNGEON' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-dimension', 'gate');
  for (const tab of ['Plan', 'History', 'Exercises', 'Today']) {
    await page.getByRole('link', { name: tab, exact: true }).last().click();
  }
  await page.getByRole('button', { name: 'Arise' }).click();
  await expect(page.getByText('Daily Habits')).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-dimension', 'gate');
});

test('character: rank ladder tags the current rank; archive tab renders', async () => {
  await page.goto('/character');
  await expect(page.getByText('Sung Jinwoo')).toBeVisible();
  await expect(page.getByText('@shadow_monarch')).toBeVisible();
  await expect(page.getByText('YOU', { exact: true })).toBeVisible();
  await page.goto('/character?tab=archive');
  await expect(page.getByText(/History/).first()).toBeVisible();
});

test('settings: rename, open the rules, change password, log out and back in', async () => {
  await page.goto('/settings');
  await page.getByLabel(/Username/).fill('Monarch.01');
  await button('Save').click();
  await expect(page.locator('header h1')).toHaveText('Monarch.01');

  await page.getByText('Rules of the System').click();
  await expect(page).toHaveURL(/settings\/rules/);
  await page.goto('/settings');

  await button('Change password').click();
  await page.getByPlaceholder('Current password').fill(E2E_PASSWORD);
  await page.getByPlaceholder('New password', { exact: true }).fill('new-pass-456');
  await page.getByPlaceholder('Confirm new password').fill('new-pass-456');
  await page.locator('form').getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText(/Password changed/)).toBeVisible();

  await button('Log out').click();
  await page.getByPlaceholder('Password').fill(E2E_PASSWORD);
  await button('Enter').click();
  await expect(page.getByText('Wrong password')).toBeVisible(); // the old password is gone
  await page.getByPlaceholder('Password').fill('new-pass-456');
  await button('Enter').click();
  await expect(page.locator('header h1')).toHaveText('Monarch.01');
});
