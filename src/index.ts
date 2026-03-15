import {
  ILayoutRestorer,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { ICommandPalette, Notification, showDialog, Dialog } from '@jupyterlab/apputils';
import { IDefaultFileBrowser } from '@jupyterlab/filebrowser';
import { PanelLayout, Widget } from '@lumino/widgets';
import React from 'react';

import { createProject } from './api';
import {
  CreateProjectDialogBody,
  ICreateDialogSelection
} from './components/CreateProjectDialog';
import { projspecIcon } from './icon';
import { requestAPI } from './request';
import { getSpecDisplayName } from './specInfo';
import { IScanResponse } from './types';
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
 * Command ID for creating a new project type.
 */
const CREATE_COMMAND_ID = 'jupyter-projspec:create-project';

/**
 * CSS ID for the chips container element, used for idempotency.
 */
const CHIPS_CONTAINER_ID = 'jp-projspec-chips-container';

/**
 * Fetch the list of existing spec names for a given path.
 */
async function getExistingSpecs(path: string): Promise<string[]> {
  try {
    const response = await requestAPI<IScanResponse>(
      `scan?path=${encodeURIComponent(path)}`,
      { method: 'GET' }
    );
    if (response?.project?.specs) {
      return Object.keys(response.project.specs);
    }
  } catch {
    // Fall back to empty if scan fails
  }
  return [];
}

/**
 * Initialization data for the jupyter-projspec extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: PLUGIN_ID,
  description: 'A Jupyter interface for projspec',
  autoStart: true,
  requires: [IDefaultFileBrowser],
  optional: [ILayoutRestorer, ICommandPalette],
  activate: (
    app: JupyterFrontEnd,
    fileBrowser: IDefaultFileBrowser,
    restorer: ILayoutRestorer | null,
    palette: ICommandPalette | null
  ) => {
    // Create the projspec panel widget for the right sidebar
    const panel = new ProjspecPanel();
    panel.id = PANEL_ID;
    panel.title.icon = projspecIcon;

    // Create chips widget for the file browser
    // Clicking a chip opens/focuses the sidebar panel and expands the spec
    const chipsWidget = new ProjspecChipsWidget(fileBrowser, specName => {
      panel.expandSpec(specName);
      app.shell.activateById(PANEL_ID);
    });

    // Register the create-project command
    app.commands.addCommand(CREATE_COMMAND_ID, {
      label: 'Initialize Project Type',
      caption: 'Initialize a new project type in the current directory',
      icon: projspecIcon,
      execute: async () => {
        const path = fileBrowser.model.path;
        const existingSpecs = await getExistingSpecs(path);

        const selectionRef: React.MutableRefObject<ICreateDialogSelection> = {
          current: { selectedType: null }
        };

        const body = React.createElement(CreateProjectDialogBody, {
          existingSpecs,
          selectionRef
        });

        const result = await showDialog({
          title: 'Create Project',
          body,
          buttons: [
            Dialog.cancelButton(),
            Dialog.okButton({ label: 'Create' })
          ]
        });

        if (!result.button.accept) {
          return;
        }

        const selectedType = selectionRef.current.selectedType;
        if (!selectedType) {
          return;
        }

        try {
          const response = await createProject({ path, type_name: selectedType });

          // Refresh both the sidebar panel and the chips widget
          panel.refreshScan();
          chipsWidget.refreshScan();

          const displayName = getSpecDisplayName(selectedType);
          const fileCount = response.created_files.length;
          Notification.success(
            `Created ${displayName} (${fileCount} file${fileCount !== 1 ? 's' : ''})`,
            { autoClose: 5000 }
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          await showDialog({
            title: 'Create Failed',
            body: msg,
            buttons: [Dialog.okButton()]
          });
          return;
        }
      }
    });

    // Wire the "+" button in the sidebar to the create command
    panel.onCreateProject = () => {
      void app.commands.execute(CREATE_COMMAND_ID);
    };

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

    // Add to command palette
    if (palette) {
      palette.addItem({
        command: CREATE_COMMAND_ID,
        category: 'Project Spec'
      });
    }

    // Add context menu entry for directories in the file browser
    app.contextMenu.addItem({
      command: CREATE_COMMAND_ID,
      selector: '.jp-DirListing-item[data-isdir="true"]',
      rank: 10
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
        // and .jp-BreadCrumbs is no longer present. This is expected in some
        // JupyterLab versions/configurations, so no warning is logged.
        const layout = fileBrowser.layout as PanelLayout;
        layout.insertWidget(1, chipsWidget);
      }
    });
  }
};

export default plugin;
