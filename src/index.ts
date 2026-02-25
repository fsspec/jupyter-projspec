import {
  ILabShell,
  ILayoutRestorer,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { IDefaultFileBrowser } from '@jupyterlab/filebrowser';
import { PanelLayout, Widget } from '@lumino/widgets';

import { fetchJfsResources } from './api';
import { projspecIcon } from './icon';
import { IProjspecPanelProvider } from './tokens';
import { ProjspecPanel } from './widgets/ProjspecPanel';
import { ProjspecChipsWidget } from './widgets/ProjspecChipsWidget';
import {
  JfsChipsWidget,
  JFS_CHIPS_CONTAINER_CLASS,
  readBreadcrumbPath
} from './widgets/JfsChipsWidget';

const PLUGIN_ID = 'jupyter-projspec:plugin';
const PANEL_ID = 'projspec-panel';
const CHIPS_CONTAINER_ID = 'jp-projspec-chips-container';

/**
 * Main plugin: projspec panel in the right sidebar + chips in the file browser.
 *
 * Provides `IProjspecPanelProvider` so the jupyter-fs plugin can depend on it
 * with a guaranteed activation order.
 */
const plugin: JupyterFrontEndPlugin<IProjspecPanelProvider> = {
  id: PLUGIN_ID,
  description: 'A Jupyter interface for projspec',
  autoStart: true,
  provides: IProjspecPanelProvider,
  requires: [IDefaultFileBrowser, ILabShell],
  optional: [ILayoutRestorer],
  activate: (
    app: JupyterFrontEnd,
    fileBrowser: IDefaultFileBrowser,
    labShell: ILabShell,
    restorer: ILayoutRestorer | null
  ): IProjspecPanelProvider => {
    const panel = new ProjspecPanel();
    panel.id = PANEL_ID;
    panel.title.icon = projspecIcon;

    const sidebarIdToUrl = new Map<string, string>();

    function getActiveLeftWidgetId(): string | null {
      for (const widget of labShell.widgets('left')) {
        if (widget.isVisible) {
          return widget.id;
        }
      }
      return null;
    }

    fileBrowser.model.pathChanged.connect(() => {
      const currentId = getActiveLeftWidgetId();
      if (currentId === null || currentId === fileBrowser.id) {
        panel.updateSource({
          type: 'local',
          path: fileBrowser.model.path
        });
      }
    });

    app.shell.add(panel, 'right', { rank: 1000 });

    if (restorer) {
      restorer.add(panel, PANEL_ID);
    }

    const chipsWidget = new ProjspecChipsWidget(fileBrowser, specName => {
      panel.expandSpec(specName);
      app.shell.activateById(PANEL_ID);
    });

    chipsWidget.disposed.connect(() => {
      document.getElementById(CHIPS_CONTAINER_ID)?.remove();
    });

    // --- Sidebar-aware source switching --------------------------------
    //
    // Tracks which left sidebar tab is active and points the panel at the
    // matching source (local file browser or a jupyter-fs resource).
    //
    // `force` bypasses the dedup guard — needed when the jfs plugin
    // populates sidebarIdToUrl *after* layoutModified already saw the tab
    // but couldn't resolve its URL.

    let lastLeftWidgetId: string | null = null;

    const doSyncPanelToActiveTab = (force = false) => {
      const currentId = getActiveLeftWidgetId();

      if (!force && currentId === lastLeftWidgetId) {
        return;
      }
      lastLeftWidgetId = currentId;

      if (!currentId) {
        panel.updateSource({ type: 'local', path: fileBrowser.model.path });
        return;
      }

      if (currentId === fileBrowser.id) {
        panel.updateSource({ type: 'local', path: fileBrowser.model.path });
        return;
      }

      const url = sidebarIdToUrl.get(currentId);
      if (url) {
        const sidebarEl = document.getElementById(currentId);
        const subpath = sidebarEl ? readBreadcrumbPath(sidebarEl) : '';
        panel.updateSource({ type: 'jfs', url, subpath });
      }
      // For unrecognised sidebars (TOC, git, extensions, etc.) we
      // intentionally keep the panel showing the last file browser's
      // specs — there is nothing to scan for those tabs.
    };

    labShell.layoutModified.connect(() => doSyncPanelToActiveTab());

    // --- Post-restore initialisation -----------------------------------

    void app.restored.then(() => {
      doSyncPanelToActiveTab(true);

      if (chipsWidget.isAttached) {
        return;
      }

      const breadcrumbs = fileBrowser.node.querySelector('.jp-BreadCrumbs');

      if (breadcrumbs && breadcrumbs.parentNode) {
        let container = document.getElementById(CHIPS_CONTAINER_ID);
        if (!container) {
          container = document.createElement('div');
          container.id = CHIPS_CONTAINER_ID;
          breadcrumbs.parentNode.insertBefore(
            container,
            breadcrumbs.nextSibling
          );
        }
        Widget.attach(chipsWidget, container);
      } else {
        const layout = fileBrowser.layout as PanelLayout;
        layout.insertWidget(1, chipsWidget);
      }
    });

    return {
      panel,
      sidebarIdToUrl,
      syncPanelToActiveTab: doSyncPanelToActiveTab
    };
  }
};

/**
 * Jupyter-fs integration plugin.
 *
 * Detects jupyter-fs sidebars via DOM (`.jp-tree-finder-sidebar`), maps each
 * sidebar's widget ID to its resource URL, and injects projspec chips.
 * Clicking a chip updates the shared panel to show that resource's specs.
 *
 * Depends on `IProjspecPanelProvider` to guarantee activation order and
 * eliminate module-level mutable state.
 */
const jupyterFsPlugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyter-projspec:jupyter-fs',
  description: 'Projspec chips for jupyter-fs sidebars',
  autoStart: true,
  requires: [IProjspecPanelProvider],
  activate: (
    app: JupyterFrontEnd,
    provider: IProjspecPanelProvider
  ) => {
    const { panel, sidebarIdToUrl, syncPanelToActiveTab } = provider;
    const injected = new Set<string>();

    function injectChips(
      sidebar: Element,
      idToUrl: Map<string, string>
    ): void {
      const sidebarId = sidebar.id;
      if (!sidebarId || injected.has(sidebarId)) {
        return;
      }

      const resourceUrl = idToUrl.get(sidebarId);
      if (!resourceUrl) {
        return;
      }

      const toolbar = sidebar.querySelector('.jp-tree-finder-toolbar');
      if (!toolbar) {
        return;
      }

      injected.add(sidebarId);
      sidebarIdToUrl.set(sidebarId, resourceUrl);

      const container = document.createElement('div');
      container.classList.add(JFS_CHIPS_CONTAINER_CLASS);
      toolbar.insertAdjacentElement('afterend', container);

      const chipsWidget = new JfsChipsWidget(
        resourceUrl,
        sidebar,
        (specName: string, subpath: string) => {
          panel.updateSource({
            type: 'jfs',
            url: resourceUrl,
            subpath
          });
          panel.expandSpec(specName);
          app.shell.activateById(PANEL_ID);
        },
        (subpath: string) => {
          const current = panel.scanSource;
          if (current?.type === 'jfs' && current.url === resourceUrl) {
            panel.updateSource({
              type: 'jfs',
              url: resourceUrl,
              subpath
            });
          }
        }
      );

      Widget.attach(chipsWidget, container);
    }

    void app.restored.then(async () => {
      const idToUrl = await fetchJfsResources();
      if (!idToUrl || idToUrl.size === 0) {
        return;
      }

      document
        .querySelectorAll('.jp-tree-finder-sidebar')
        .forEach(el => injectChips(el, idToUrl));

      syncPanelToActiveTab(true);

      const target = document.getElementById('jp-left-stack');
      if (!target) {
        return;
      }

      const observer = new MutationObserver(() => {
        const prevSize = sidebarIdToUrl.size;
        document
          .querySelectorAll('.jp-tree-finder-sidebar')
          .forEach(el => injectChips(el, idToUrl));
        if (sidebarIdToUrl.size > prevSize) {
          syncPanelToActiveTab(true);
        }
        if (sidebarIdToUrl.size >= idToUrl.size) {
          observer.disconnect();
          clearTimeout(observerTimeout);
        }
      });
      observer.observe(target, { childList: true, subtree: true });

      const observerTimeout = setTimeout(() => {
        observer.disconnect();
        if (sidebarIdToUrl.size < idToUrl.size) {
          const unmatched = [...idToUrl.keys()].filter(
            id => !sidebarIdToUrl.has(id)
          );
          console.warn(
            `jupyter-projspec: ${unmatched.length} jupyter-fs sidebar(s) not found in DOM. ` +
              `Expected IDs: ${unmatched.join(', ')}. ` +
              'The sidebar ID formula may have changed in jupyter-fs.'
          );
        }
      }, 30_000);
    });
  }
};

export default [plugin, jupyterFsPlugin];
