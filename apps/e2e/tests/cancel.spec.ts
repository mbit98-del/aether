import { test, expect, waitForPeer, sendFileFromCard, FIXTURE_FILE } from '../fixtures';

test('sender cancels transfer → no file preview on receiver', async ({ deviceA, deviceB }) => {
  await Promise.all([
    deviceA.waitForSelector('text=e2e-device-b', { timeout: 15_000 }),
    waitForPeer(deviceB),
  ]);

  await sendFileFromCard(deviceA, 'e2e-device-b', FIXTURE_FILE);

  // Click the TransferModal action button — "Cancel Transfer" or "Close", both call onCancel
  // which sends a file-cancel message to the receiver.
  await expect(deviceA.locator('[data-testid="transfer-modal"]')).toBeAttached({ timeout: 5_000 });
  await deviceA.locator('[data-testid="transfer-modal"] button').click();

  // DeviceB is untrusted: file-end was buffered, never assembled. file-cancel clears
  // the approval queue, so no preview can appear.
  await expect(deviceB.getByRole('button', { name: 'Save to Downloads' })).not.toBeVisible({ timeout: 5_000 });
});
