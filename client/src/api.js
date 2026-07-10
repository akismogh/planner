// Data layer with two interchangeable backends, selected at BUILD time:
//
//   • Local version (default, `npm start`): talks to the Express server via
//     the Vite proxy. Data is written to /data.json on your PC. Unchanged.
//
//   • Public / GitHub Pages version (built with --mode github): there is NO
//     server. Data is stored in the browser's localStorage — it never leaves
//     the user's computer. Selected when VITE_STORAGE === 'browser'.
//
// The switch is the env var VITE_STORAGE, set in client/.env.github.

const USE_BROWSER_STORAGE = import.meta.env.VITE_STORAGE === 'browser';
const LS_KEY = 'retirementPlanner.data';

// True when running as the serverless public build. UI components use this
// to show export/import buttons and a privacy banner.
export function isBrowserStorage() {
  return USE_BROWSER_STORAGE;
}

export async function loadData() {
  if (USE_BROWSER_STORAGE) {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null; // corrupted/empty — treat as first run
    }
  }
  // ── Local server path (unchanged) ──
  const res = await fetch('/api/data');
  if (!res.ok) throw new Error('Failed to load saved data');
  return res.json();
}

export async function saveData(payload) {
  if (USE_BROWSER_STORAGE) {
    localStorage.setItem(LS_KEY, JSON.stringify(payload));
    return { ok: true };
  }
  // ── Local server path (unchanged) ──
  const res = await fetch('/api/data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to save data');
  return res.json();
}

// ── Backup helpers (used by the public build) ─────────────────────────────
// Export the current data to a JSON file the user downloads to their PC.
export function exportDataToFile(data) {
  const json = JSON.stringify(data, null, 2);
  const filename = `retirement-data-${new Date().toISOString().slice(0, 10)}.json`;

  // Android WebView shell: hand the bytes straight to the native layer.
  // Blob/`a.download` downloads don't reliably fire inside a WebView, so the
  // app exposes a `RetirementAndroid.saveFile` bridge that writes to Downloads.
  if (typeof window !== 'undefined' &&
      window.RetirementAndroid &&
      typeof window.RetirementAndroid.saveFile === 'function') {
    window.RetirementAndroid.saveFile(filename, json);
    return;
  }

  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Read a user-selected JSON file and return the parsed object (Promise).
export function importDataFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(reader.result));
      } catch (err) {
        reject(new Error('Invalid JSON file'));
      }
    };
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsText(file);
  });
}
