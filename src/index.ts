import {
  ILayoutRestorer,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { IDefaultFileBrowser } from '@jupyterlab/filebrowser';
import { PanelLayout, Widget } from '@lumino/widgets';

import { projspecIcon } from './icon';
import { ProjspecPanel } from './widgets/ProjspecPanel';
import { ProjspecChipsWidget } from './widgets/ProjspecChipsWidget';

/**
 * The plugin ID for jupyter-projspec.
 */
const PLUGIN_ID = 'jupyter-projspec:plugin';

/**
 * The ID for the projspec panel widget.
 */
const PANEL_ID = 'projspec-panel';

/**
 * CSS ID for the chips container element, used for idempotency.
 */
const CHIPS_CONTAINER_ID = 'jp-projspec-chips-container';

/**
 * Initialization data for the jupyter-projspec extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: PLUGIN_ID,
  description: 'A Jupyter interface for projspec',
  autoStart: true,
  requires: [IDefaultFileBrowser],
  optional: [ILayoutRestorer],
  activate: (
    app: JupyterFrontEnd,
    fileBrowser: IDefaultFileBrowser,
    restorer: ILayoutRestorer | null
  ) => {
    // Create the projspec panel widget for the right sidebar
    const panel = new ProjspecPanel();
    panel.id = PANEL_ID;
    panel.title.icon = projspecIcon;

    // Function to update the panel with the current path
    const updatePath = () => {
      const path = fileBrowser.model.path;
      panel.updatePath(path);
    };

    // Set initial path
    updatePath();

    // Subscribe to path changes in the file browser
    fileBrowser.model.pathChanged.connect(updatePath);

    // Add the panel to the right sidebar
    app.shell.add(panel, 'right', { rank: 1000 });

    // Restore the widget state if a restorer is available
    if (restorer) {
      restorer.add(panel, PANEL_ID);
    }

    // Create chips widget for the file browser
    // Clicking a chip opens/focuses the sidebar panel and expands the spec
    const chipsWidget = new ProjspecChipsWidget(fileBrowser, specName => {
      // Expand the clicked spec in the panel
      panel.expandSpec(specName);
      // Open/focus the sidebar panel
      app.shell.activateById(PANEL_ID);
    });

    // Clean up the container div when the chips widget is disposed
    chipsWidget.disposed.connect(() => {
      const existing = document.getElementById(CHIPS_CONTAINER_ID);
      if (existing) {
        existing.remove();
      }
    });

    // Defer DOM injection until after the app is fully restored
    // This ensures the breadcrumbs element exists in the DOM
    // Note: depends on JupyterLab internal class .jp-BreadCrumbs
    void app.restored.then(() => {
      // Idempotency: skip if already attached (e.g., hot-reload)
      if (chipsWidget.isAttached) {
        return;
      }

      // Find the breadcrumbs element inside the file browser
      const breadcrumbs = fileBrowser.node.querySelector('.jp-BreadCrumbs');

      if (breadcrumbs && breadcrumbs.parentNode) {
        // Reuse existing container or create a new one
        let container = document.getElementById(CHIPS_CONTAINER_ID);
        if (!container) {
          container = document.createElement('div');
          container.id = CHIPS_CONTAINER_ID;
          breadcrumbs.parentNode.insertBefore(
            container,
            breadcrumbs.nextSibling
          );
        }
        // Use Lumino's Widget.attach for proper lifecycle management
        Widget.attach(chipsWidget, container);
      } else {
        // Fallback: insert at position 1 in the layout.
        // This path is reached if JupyterLab's internal DOM structure changes
        // and .jp-BreadCrumbs is no longer present.
        console.warn(
          'jupyter-projspec: Could not find .jp-BreadCrumbs element; ' +
            'falling back to layout insertion'
        );
        const layout = fileBrowser.layout as PanelLayout;
        layout.insertWidget(1, chipsWidget);
      }
    });
  }
};

export default plugin;
