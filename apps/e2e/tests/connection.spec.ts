import { test, expect, waitForPeer } from '../fixtures';

test('both devices connect and see each other in Nearby Devices', async ({ deviceA, deviceB }) => {
  // Both fixtures have already waited for "Server connected".
  // Now wait until each page sees the other as a peer.
  await Promise.all([waitForPeer(deviceA), waitForPeer(deviceB)]);

  await expect(deviceA.getByText(/\d+ NODES? DETECTED/)).toBeVisible();
  await expect(deviceB.getByText(/\d+ NODES? DETECTED/)).toBeVisible();
});

test('Send button is visible on device card', async ({ deviceA, deviceB }) => {
  await waitForPeer(deviceA);

  // deviceA should see a Send button for deviceB
  await expect(deviceA.getByRole('button', { name: 'Send' }).first()).toBeVisible();
});

test('E2E badge appears on device card after key exchange', async ({ deviceA, deviceB }) => {
  await Promise.all([waitForPeer(deviceA), waitForPeer(deviceB)]);

  // ECDH key exchange is triggered automatically when a new peer is detected.
  // Poll until the badge appears on the specific peer's card (generous timeout).
  await Promise.all([
    expect(deviceA.locator('[data-testid="device-card"]:has-text("e2e-device-b")').getByText('E2E', { exact: true })).toBeVisible({ timeout: 10_000 }),
    expect(deviceB.locator('[data-testid="device-card"]:has-text("e2e-device-a")').getByText('E2E', { exact: true })).toBeVisible({ timeout: 10_000 }),
  ]);
});
