import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Run against the local dev server. Set PLAYWRIGHT_CHROMIUM_EXECUTABLE if needed.
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
    : {}),
});
try {
  const page = await browser.newPage();
  await page.addInitScript(() => {
    window.bellNotes = 0;
    const original = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function (...args) {
      window.bellNotes++;
      return original.apply(this, args);
    };
  });
  await page.goto(process.env.TIMER_TEST_URL || 'http://127.0.0.1:4173');
  await page.getByRole('button', { name: 'Custom', exact: true }).waitFor();
  await page.clock.install();
  const navigateAway = () => page.getByRole('button', { name: 'Transactions & Reprint', exact: true }).click();
  const navigateBack = () => page.getByRole('button', { name: 'Tables & POS', exact: true }).click();
  const notes = () => page.evaluate(() => window.bellNotes);
  const startCustom = async (seconds) => {
    await page.getByRole('button', { name: 'Custom', exact: true }).click();
    await page.getByRole('spinbutton', { name: 'Minutes', exact: true }).fill('0');
    await page.getByRole('spinbutton', { name: 'Seconds', exact: true }).fill(String(seconds));
    await page.getByRole('button', { name: 'Start Custom', exact: true }).click();
  };

  await startCustom(10);
  await navigateAway();
  await page.clock.runFor(3000);
  await navigateBack();
  assert.equal(await page.getByText('00:07', { exact: true }).count(), 1);
  await page.getByTitle('Pause timer', { exact: true }).click();
  await navigateAway();
  await page.clock.runFor(5000);
  await navigateBack();
  assert.equal(await page.getByText('00:07', { exact: true }).count(), 1);
  await page.getByTitle('Start timer', { exact: true }).click();
  await navigateAway();
  await page.clock.runFor(7200);
  await page.getByRole('alert').waitFor();
  assert.equal(await notes(), 6, 'Bell must play while timer controls are unmounted');
  await page.clock.runFor(2800);
  assert.equal(await notes(), 12, 'Bell must repeat on another page');
  await page.getByRole('button', { name: 'Stop Alarm', exact: true }).click();
  await page.clock.runFor(3000);
  assert.equal(await notes(), 12, 'Global stop must silence repeating bell');
  assert.equal(await page.getByRole('alert').count(), 0);
  await navigateBack();
  assert.equal(await page.getByText('00:10', { exact: true }).count(), 1);

  await page.getByRole('button', { name: 'Mute alarm', exact: true }).click();
  await startCustom(1);
  await navigateAway();
  await page.clock.runFor(1200);
  await page.getByRole('alert').waitFor();
  assert.equal(await notes(), 12, 'Mute must survive navigation');
  await page.getByRole('button', { name: 'Stop Alarm', exact: true }).click();
  console.log('PASS: countdown, pause/resume, repeating audio, global stop, and mute survive page navigation.');
} finally {
  await browser.close();
}
