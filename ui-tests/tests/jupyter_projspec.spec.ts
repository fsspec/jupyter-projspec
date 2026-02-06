import { expect, test } from '@jupyterlab/galata';

test('should activate and register the projspec sidebar panel', async ({
  page
}) => {
  // The extension registers a panel with id "projspec-panel" in the right sidebar.
  // Verify the panel tab is present, which confirms the extension activated.
  const panelTab = page.locator('#tab-bar-projspec-panel');
  await expect(panelTab).toHaveCount(1);
});
