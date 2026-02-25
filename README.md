# jupyter-projspec <img width="32" alt="logo" src="https://github.com/user-attachments/assets/c87219a0-63d1-4f69-ba29-f5b35f1835ee" />

[![Github Actions Status](https://github.com/fsspec/jupyter-projspec/workflows/Build/badge.svg)](https://github.com/fsspec/jupyter-projspec/actions/workflows/build.yml)
[![Binder](https://mybinder.org/badge_logo.svg)](https://mybinder.org/v2/gh/fsspec/jupyter-projspec/main?urlpath=lab)
[![jupyter-projspec](https://marketplace.orbrx.io/api/badge/jupyter-projspec?metric=downloads&leftColor=%23555&rightColor=%23F37620&style=flat)](https://marketplace.orbrx.io/extensions/jupyter-projspec)

A JupyterLab extension that brings [projspec](https://github.com/fsspec/projspec) project introspection directly into your development workflow. See at a glance what kind of project you're working in and explore its structure, metadata, and buildable artifacts.

<img width="2517" height="1293" alt="Screenshot 2026-01-09 at 3 59 41 PM" src="https://github.com/user-attachments/assets/cde02dcd-9aa6-4288-a4c7-72c0f82764b0" />

## Features

### 🏷️ Project Type Chips in File Browser

Colored badge chips appear below the breadcrumbs in the file browser, showing all detected project types for the current directory:

- **Instant recognition** — See `🐍 Python Library`, `🔮 Pixi`, `🔀 Git Repository`, etc. at a glance
- **Click to explore** — Clicking a chip opens the sidebar panel and scrolls to that spec's details
- **Unobtrusive** — Chips only appear when project specs are detected; completely hidden otherwise

### 📋 Project Spec Sidebar Panel

A dedicated right sidebar panel provides detailed project information:

- **Synced with file browser** — Automatically updates as you navigate directories
- **Expandable spec items** — Click to reveal contents and artifacts for each project type
- **Contents** — View metadata, dependencies, environment specs, and more
- **Artifacts** — See buildable outputs like wheels, conda packages, documentation

### 📁 jupyter-fs Integration

If [jupyter-fs](https://github.com/jpmorganchase/jupyter-fs) is installed, projspec chips appear in each jupyter-fs sidebar automatically. No extra configuration is needed — the extension detects jupyter-fs at runtime and injects chips below the toolbar in every tree-finder sidebar.

- **Automatic detection** — If jupyter-fs is not installed, this feature is silently disabled
- **Per-resource scanning** — Each sidebar scans its own fsspec URL via the `/scan-url` backend endpoint
- **Directory navigation** — Chips update as you browse subdirectories within a resource by observing the tree-finder breadcrumbs

### 🎨 Supported Project Types

jupyter-projspec recognizes many project types through projspec:

| Category            | Types                                                                              |
| ------------------- | ---------------------------------------------------------------------------------- |
| **Version Control** | Git Repository                                                                     |
| **Python**          | Python Library, Poetry, uv, Pixi, Conda Project, Conda Recipe, PyScript, Briefcase |
| **JavaScript**      | Node.js, Yarn, JupyterLab Extension                                                |
| **Rust**            | Rust Crate                                                                         |
| **Documentation**   | mdBook, Read the Docs                                                              |
| **Data & ML**       | Data Package, Hugging Face Repo                                                    |
| **IDEs**            | VS Code, JetBrains IDE, Zed, NVIDIA AI Workbench                                   |

## Requirements

- JupyterLab >= 4.0.0
- Python >= 3.10
- [projspec](https://github.com/fsspec/projspec)
- [jupyter-fs](https://github.com/jpmorganchase/jupyter-fs) (optional, for remote filesystem support)


## Install

```bash
pip install jupyter-projspec
```

## Usage

1. **Open JupyterLab** and navigate to any project directory using the file browser
2. **Look for chips** below the breadcrumbs — they appear when projspec detects project types
3. **Click a chip** or the sidebar icon to open the Project Spec panel
4. **Expand specs** to explore contents (metadata, dependencies) and artifacts (buildable outputs)

## Uninstall

```bash
pip uninstall jupyter-projspec
```

## Troubleshoot

If you see the frontend extension but it's not working, verify the server extension is enabled:

```bash
jupyter server extension list
```

If the server extension is installed and enabled but you don't see the frontend extension:

```bash
jupyter labextension list
```

## Contributing

### Development Install

You will need NodeJS to build the extension package.

```bash
# Clone the repo
git clone https://github.com/fsspec/jupyter-projspec.git
cd jupyter-projspec

# Set up a virtual environment
python -m venv .venv
source .venv/bin/activate

# Install in development mode
pip install --editable ".[dev,test]"

# Link your development version with JupyterLab
jupyter labextension develop . --overwrite
jupyter server extension enable jupyter_projspec

# Build the extension (do this after each TypeScript change)
jlpm build
```

### Development Workflow

**Watch mode** (recommended for active development):

```bash
# Terminal 1: Auto-rebuild on file changes
jlpm watch

# Terminal 2: Run JupyterLab
jupyter lab
```

With watch mode running, saved TypeScript changes rebuild automatically. Refresh your browser to see changes.

**After editing Python** (files in `jupyter_projspec/`):

- Restart the JupyterLab server (no rebuild needed)

### Development Uninstall

```bash
jupyter server extension disable jupyter_projspec
pip uninstall jupyter_projspec
```

Remove the symlink created by `jupyter labextension develop`:

```bash
jupyter labextension list  # Find labextensions folder location
# Remove the jupyter-projspec symlink from that folder
```

### Testing

**Server tests** (Python):

```bash
pip install -e ".[test]"
pytest -vv -r ap --cov jupyter_projspec
```

**Frontend tests** (TypeScript):

```bash
jlpm test
```

**Integration tests** (Playwright):

See [ui-tests/README.md](./ui-tests/README.md) for details.

## Architecture

```
jupyter-projspec/
├── src/                          # TypeScript frontend
│   ├── index.ts                  # Extension entry point (both plugins)
│   ├── api.ts                    # Backend API client functions
│   ├── components/               # React components
│   │   ├── ProjspecPanelComponent.tsx
│   │   ├── ProjectView.tsx
│   │   ├── SpecItem.tsx
│   │   ├── ContentsView.tsx
│   │   ├── ArtifactsView.tsx
│   │   └── ProjspecChips.tsx     # Shared chips component
│   └── widgets/
│       ├── ProjspecPanel.ts      # Sidebar panel widget
│       ├── ProjspecChipsWidget.ts # Chips in default file browser
│       └── JfsChipsWidget.ts     # Chips in jupyter-fs sidebars
├── jupyter_projspec/             # Python backend
│   ├── __init__.py               # Server extension setup
│   └── routes.py                 # API route handlers
├── style/                        # CSS styles
└── schema/                       # JupyterLab settings schema
```

### API Endpoints

| Endpoint                     | Method | Description                                                  |
| ---------------------------- | ------ | ------------------------------------------------------------ |
| `/jupyter-projspec/scan`     | GET    | Scan a local directory and return projspec data              |
| `/jupyter-projspec/scan-url` | POST   | Scan an fsspec URL (for jupyter-fs) and return projspec data |
| `/jupyter-projspec/make`     | POST   | Execute an artifact's build command via projspec             |

## Roadmap

Future enhancements being considered:

- [x] **MAKE buttons** — Execute artifact builds directly from the UI
- [x] **Build output display** — Show stdout/stderr from artifact builds
- [x] **jupyter-fs integration** — Projspec chips in jupyter-fs sidebars
- [ ] **File browser navigation** — Click built artifacts to reveal them
- [ ] **Real-time streaming** — Live output for long-running builds
- [ ] **Jupyter Notebook 7 support** — Currently requires JupyterLab (`ILabShell`); Notebook 7 uses `INotebookShell`

## AI Coding Assistant Support

This project includes an `AGENTS.md` file with coding standards for JupyterLab extension development. Compatible with AI assistants that support the [AGENTS.md standard](https://agents.md).

## License

BSD-3-Clause

## Acknowledgments

Built on [projspec](https://github.com/fsspec/projspec) by the fsspec team.
