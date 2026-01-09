/**
 * Shared display information for spec types.
 *
 * This module provides consistent display names, icons, and colors
 * for projspec types across the UI (chips and sidebar).
 */

/**
 * Display information for a spec type.
 */
export interface ISpecDisplayInfo {
  /** Human-readable display name */
  displayName: string;
  /** Emoji icon */
  icon: string;
  /** Background color (hex) */
  color: string;
}

/**
 * Complete spec display information mapping.
 *
 * Maps projspec snake_case identifiers to display info.
 * When adding new specs to projspec, add corresponding entries here.
 *
 * To find all spec types in projspec, run:
 *   grep -r "class.*ProjectSpec" /path/to/projspec/src/projspec/proj/
 */
const SPEC_INFO: Record<string, ISpecDisplayInfo> = {
  // Version control
  git_repo: { displayName: 'Git Repository', icon: '🔀', color: '#c7c9e0' },

  // Python ecosystem
  python_library: { displayName: 'Python Library', icon: '🐍', color: '#b8dcc2' },
  python_code: { displayName: 'Python Code', icon: '🐍', color: '#c5e8cd' },
  poetry: { displayName: 'Poetry', icon: '📜', color: '#d4c8e8' },
  uv: { displayName: 'uv', icon: '⚡', color: '#f0d4c4' },
  uv_script: { displayName: 'uv Script', icon: '⚡', color: '#f5dfd0' },
  pixi: { displayName: 'Pixi', icon: '🔮', color: '#c4dfe3' },
  conda_project: { displayName: 'Conda Project', icon: '🐍', color: '#b8e0d4' },
  conda_recipe: { displayName: 'Conda Recipe', icon: '📦', color: '#c8ebe2' },
  py_script: { displayName: 'PyScript', icon: '🌐', color: '#f0e4b8' },
  briefcase: { displayName: 'Briefcase', icon: '💼', color: '#d8d4d0' },

  // JavaScript/Node ecosystem
  node: { displayName: 'Node.js', icon: '📦', color: '#d4e8b8' },
  yarn: { displayName: 'Yarn', icon: '🧶', color: '#c4ddf0' },
  j_lab_extension: { displayName: 'JupyterLab Extension', icon: '🪐', color: '#f0d4c4' },

  // Rust
  rust: { displayName: 'Rust Crate', icon: '🦀', color: '#e8ccc0' },

  // Documentation
  md_book: { displayName: 'mdBook', icon: '📖', color: '#d8c8e8' },
  r_t_d: { displayName: 'Read the Docs', icon: '📚', color: '#c4d8e8' },

  // Data & ML
  data_package: { displayName: 'Data Package', icon: '📊', color: '#f0c8d8' },
  hugging_face_repo: { displayName: 'Hugging Face', icon: '🤗', color: '#f0e4b8' },

  // IDEs & Editors
  vs_code: { displayName: 'VS Code', icon: '💻', color: '#c4d4f0' },
  jetbrains_ide: { displayName: 'JetBrains IDE', icon: '🧠', color: '#e8c8d8' },
  zed: { displayName: 'Zed', icon: '⚡', color: '#d8e8c4' },
  nvidia_ai_workbench: { displayName: 'NVIDIA AI Workbench', icon: '🖥️', color: '#c8e0b8' },

  // Other
  backstage_catalog: { displayName: 'Backstage Catalog', icon: '🎭', color: '#c4dfe3' }
};

/**
 * Default display info for unknown spec types.
 */
const DEFAULT_INFO: ISpecDisplayInfo = {
  displayName: '',
  icon: '📋',
  color: '#d4d8e0'
};

/**
 * Get the display information for a spec type.
 * Returns default info if the spec is not in the mapping.
 */
export function getSpecInfo(specName: string): ISpecDisplayInfo {
  const info = SPEC_INFO[specName];
  if (info) {
    return info;
  }

  // Return default with auto-generated display name
  return {
    ...DEFAULT_INFO,
    displayName: formatSpecName(specName)
  };
}

/**
 * Get the display name for a spec type.
 */
export function getSpecDisplayName(specName: string): string {
  return getSpecInfo(specName).displayName;
}

/**
 * Get the icon for a spec type.
 */
export function getSpecIcon(specName: string): string {
  return getSpecInfo(specName).icon;
}

/**
 * Get the background color for a spec type.
 */
export function getSpecColor(specName: string): string {
  return getSpecInfo(specName).color;
}

/**
 * Format spec name for display.
 * Converts snake_case to Title Case.
 */
function formatSpecName(specName: string): string {
  return specName
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Get appropriate text color based on background luminance.
 * Light backgrounds get dark text, dark backgrounds get light text.
 */
export function getTextColorForBackground(bgColor: string): string {
  // For CSS variables, use dark text as default
  if (bgColor.startsWith('var(')) {
    return 'var(--jp-ui-font-color1)';
  }

  // Parse hex color and calculate relative luminance
  const hex = bgColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // Using relative luminance formula
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  return luminance > 0.5 ? '#1a1a1a' : '#ffffff';
}

