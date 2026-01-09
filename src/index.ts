import {
  ILayoutRestorer,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { IDefaultFileBrowser } from '@jupyterlab/filebrowser';
import { PanelLayout } from '@lumino/widgets';

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
    const chipsWidget = new ProjspecChipsWidget(fileBrowser, (specName) => {
      // Expand the clicked spec in the panel
      panel.expandSpec(specName);
      // Open/focus the sidebar panel
      app.shell.activateById(PANEL_ID);
    });

    // Defer DOM injection until after the app is fully restored
    // This ensures the breadcrumbs element exists in the DOM
    void app.restored.then(() => {
      // Find the breadcrumbs element inside the file browser
      const breadcrumbs = fileBrowser.node.querySelector('.jp-BreadCrumbs');

      if (breadcrumbs && breadcrumbs.parentNode) {
        // Inject the chips widget after the breadcrumbs
        const chipsNode = chipsWidget.node;
        breadcrumbs.parentNode.insertBefore(
          chipsNode,
          breadcrumbs.nextSibling
        );
        // Ensure the widget is properly attached to Lumino
        chipsWidget.processMessage({ type: 'after-attach' } as any);
      } else {
        // Fallback: insert at position 1 in the layout
        const layout = fileBrowser.layout as PanelLayout;
        layout.insertWidget(1, chipsWidget);
      }
    });
  }
};

export default plugin;
