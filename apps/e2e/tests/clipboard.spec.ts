import { test, expect, waitForPeer } from '../fixtures';

test('clipboard sent from deviceA arrives in deviceB clipboard', async ({ deviceA, deviceB }) => {
  await Promise.all([waitForPeer(deviceA), waitForPeer(deviceB)]);

  // Write a value to deviceA's clipboard, then trigger Send clipboard
  await deviceA.evaluate(() => navigator.clipboard.writeText('aether-clipboard-test-value'));

  // Click the Send clipboard quick action on deviceA
  await deviceA.getByRole('button', { name: /send clipboard/i }).click();

  // On desktop, Layout silently writes to clipboard without a banner.
  // Verify by reading deviceB's clipboard directly.
  await deviceB.waitForTimeout(1_000); // allow WS message to propagate
  const received = await deviceB.evaluate(() => navigator.clipboard.readText());
  expect(received).toBe('aether-clipboard-test-value');
});
