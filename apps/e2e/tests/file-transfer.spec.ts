import { test, expect, waitForPeer, sendFileFromCard, FIXTURE_FILE } from '../fixtures';

test('deviceA sends file → deviceB approves → file downloads', async ({ deviceA, deviceB }) => {
  // Wait for both sides to be ready, and specifically for e2e-device-b to appear in deviceA's list
  await Promise.all([
    deviceA.waitForSelector('text=e2e-device-b', { timeout: 15_000 }),
    waitForPeer(deviceB),
  ]);

  await sendFileFromCard(deviceA, 'e2e-device-b', FIXTURE_FILE);

  // Untrusted sender → ApprovalModal on deviceB
  await expect(deviceB.getByText('Trust this device?')).toBeVisible({ timeout: 10_000 });
  await deviceB.getByRole('button', { name: /allow once/i }).click();

  // FilePreviewModal appears on deviceB
  await expect(deviceB.getByRole('button', { name: 'Save to Downloads' })).toBeVisible({ timeout: 10_000 });

  // File also appears in the RECEIVED section (set before preview modal, behind it in z-order)
  await expect(deviceB.getByText('RECEIVED')).toBeVisible();
  await expect(deviceB.getByText('hello.txt').first()).toBeVisible();

  const [download] = await Promise.all([
    deviceB.waitForEvent('download'),
    deviceB.getByRole('button', { name: 'Save to Downloads' }).click(),
  ]);

  expect(download.suggestedFilename()).toBe('hello.txt');
});

test('receiver rejects transfer → no file preview appears', async ({ deviceA, deviceB }) => {
  await Promise.all([
    deviceA.waitForSelector('text=e2e-device-b', { timeout: 15_000 }),
    waitForPeer(deviceB),
  ]);

  await sendFileFromCard(deviceA, 'e2e-device-b', FIXTURE_FILE);

  await expect(deviceB.getByText('Trust this device?')).toBeVisible({ timeout: 10_000 });
  await deviceB.getByRole('button', { name: /reject/i }).click();

  // Approval modal dismissed, no file preview
  await expect(deviceB.getByText('Trust this device?')).not.toBeVisible();
  await expect(deviceB.getByRole('button', { name: 'Save to Downloads' })).not.toBeVisible({ timeout: 3_000 });
});

test('transfer progress appears on sender side', async ({ deviceA, deviceB }) => {
  await Promise.all([
    deviceA.waitForSelector('text=e2e-device-b', { timeout: 15_000 }),
    waitForPeer(deviceB),
  ]);

  await sendFileFromCard(deviceA, 'e2e-device-b', FIXTURE_FILE);

  // "Active Stream" appears in the right panel when a transfer is in progress
  await expect(deviceA.getByText('Active Stream')).toBeVisible({ timeout: 5_000 });
});
