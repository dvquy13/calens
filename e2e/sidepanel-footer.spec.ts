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
