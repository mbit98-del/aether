import { test as base, expect, type Browser, type Page } from '@playwright/test';
import path from 'node:path';

export { expect };

export const FIXTURE_FILE = path.join(__dirname, 'fixtures', 'hello.txt');

type DeviceFixtures = {
  deviceA: Page;
  deviceB: Page;
};

async function openDevice(browser: Browser, name: string) {
  const ctx = await browser.newContext({
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await ctx.newPage();
  // Set a distinct name before load so the server receives it in the "hello" message.
  // This lets tests find the right device card even when other devices are connected.
  await page.addInitScript((deviceName: string) => {
    localStorage.setItem('aether-device-name', deviceName);
  }, name);
  page.on('console', (msg) => console.log(`[${name}:${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => console.log(`[${name}] PAGE ERROR: ${err.message}`));
  await page.goto('/');
  await page.waitForSelector('text=Server connected', { timeout: 15_000 });
  return { page, ctx };
}

export const test = base.extend<DeviceFixtures>({
  deviceA: async ({ browser }, use) => {
    const { page, ctx } = await openDevice(browser, 'e2e-device-a');
    await use(page);
    await ctx.close();
  },
  deviceB: async ({ browser }, use) => {
    const { page, ctx } = await openDevice(browser, 'e2e-device-b');
    await use(page);
    await ctx.close();
  },
});

/** Wait until the given page sees at least one peer in Nearby Devices. */
export async function waitForPeer(page: Page, timeout = 15_000) {
  // Matches "1 NODE DETECTED" or "N NODES DETECTED"
  await page.waitForSelector('text=/\\d+ NODES? DETECTED/', { timeout });
}

/** Wait until the E2E badge appears — ECDH key exchange complete. */
export async function waitForEncryption(page: Page, timeout = 10_000) {
  await page.waitForSelector('text=E2E', { timeout });
}

/**
 * Click the Send button on the named device's card and set files on the hidden
 * file input. Re-queries the locator fresh on every call so React re-renders
 * between transfers don't leave us with a stale DOM reference. Uses toPass()
 * so a brief re-render gap is retried automatically.
 */
export async function sendFileFromCard(
  senderPage: Page,
  deviceName: string,
  files: string | string[],
) {
  // Re-query fresh every time — do not cache the locator across calls
  await expect(async () => {
    await senderPage
      .locator(`[data-testid="device-card"]:has-text("${deviceName}")`)
      .getByRole('button', { name: 'Send' })
      .click({ timeout: 5_000 });
  }).toPass({ timeout: 15_000 });

  await senderPage.locator('[data-testid="file-input"]').setInputFiles(files);
}
