import { expect, test } from '@jupyterlab/galata';

test('should activate and register the projspec sidebar panel', async ({
  page
}) => {
  // The extension registers a panel with id "projspec-panel" in the right sidebar.
  // Verify the panel tab is present, which confirms the extension activated.
  // In JupyterLab 4 (Lumino 2), sidebar tabs use data-id attributes, not HTML id.
  const panelTab = page.locator(
    '.lm-TabBar.jp-SideBar .lm-TabBar-tab[data-id="projspec-panel"]'
  );
  await expect(panelTab).toHaveCount(1);
});
