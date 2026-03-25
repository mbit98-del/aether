import { test, expect, waitForPeer, sendFileFromCard, FIXTURE_FILE } from '../fixtures';

test('Allow & Trust skips approval on subsequent transfers', async ({ deviceA, deviceB }) => {
  await Promise.all([
    deviceA.waitForSelector('text=e2e-device-b', { timeout: 15_000 }),
    waitForPeer(deviceB),
  ]);

  // --- First transfer: use "Allow & Trust" ---
  await sendFileFromCard(deviceA, 'e2e-device-b', FIXTURE_FILE);

  await expect(deviceB.getByText('Trust this device?')).toBeVisible({ timeout: 10_000 });
  await deviceB.getByRole('button', { name: /allow.*trust/i }).click();

  // Preview modal appears — dismiss it
  await expect(deviceB.getByRole('button', { name: 'Dismiss' })).toBeVisible({ timeout: 10_000 });
  await deviceB.getByRole('button', { name: 'Dismiss' }).click();

  // Wait for the first TransferModal to open (confirms transfer is in progress / done),
  // then wait for it to fully close (auto-closes 1.2s after transfer ends).
  // Checking "not visible" alone is a race: if the modal hasn't rendered yet it passes
  // immediately while the overlay still blocks device card clicks.
  await expect(deviceA.locator('[data-testid="transfer-modal"]')).toBeAttached({ timeout: 10_000 });
  await expect(deviceA.locator('[data-testid="transfer-modal"]')).not.toBeAttached({ timeout: 5_000 });

  // --- Second transfer: no approval modal should appear ---
  await sendFileFromCard(deviceA, 'e2e-device-b', FIXTURE_FILE);

  // FilePreviewModal appears directly — no "Trust this device?" heading
  await expect(deviceB.getByRole('button', { name: 'Dismiss' })).toBeVisible({ timeout: 10_000 });
  await expect(deviceB.getByText('Trust this device?')).not.toBeVisible();
});
