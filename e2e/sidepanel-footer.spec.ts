import { test, expect } from '@playwright/test';
import { withExtension } from './fixtures/harness';

test('side panel footer links to the GitHub Sponsors page in a new tab', async () => {
  await withExtension(async ({ openPages }) => {
    const { sidepanelPage } = await openPages();

    const support = sidepanelPage.getByRole('link', { name: 'Support Calens' });
    await expect(support).toHaveAttribute('href', 'https://github.com/sponsors/dvquy13');
    await expect(support).toHaveAttribute('target', '_blank');
    await expect(support).toHaveAttribute('rel', 'noopener noreferrer');
  });
});

test('opening the side panel sends one active-day ping with install ID and version', async () => {
  await withExtension(async ({ context, openPages }) => {
    const pings: string[] = [];
    context.on('request', (req) => {
      if (req.url() === 'https://wzacvfhfpqhdutqfcofz.supabase.co/rest/v1/rpc/record_active_day') {
        pings.push(req.postData() ?? '');
      }
    });

    await openPages();
    await expect.poll(() => pings.length).toBeGreaterThan(0);

    expect(pings).toHaveLength(1);
    const body = JSON.parse(pings[0]);
    expect(body.p_install_id).toEqual(expect.any(String));
    expect(body.p_version).toEqual(expect.any(String));
  });
});
