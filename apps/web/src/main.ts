import './style.css';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, drawSelection, dropCursor, highlightActiveLine, keymap, placeholder } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { syntaxHighlighting } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { calc, recompute } from './calc';
import { livePreview, markdownHighlight } from './livePreview';
import { loadRates } from './rates';
import sample from './sample.md?raw';

const DOC_KEY = 'kalkuel:doc';
const NAME_KEY = 'kalkuel:name';
const PREVIEW_KEY = 'kalkuel:preview';
const RESULTS_KEY = 'kalkuel:results';
const THEME_KEY = 'kalkuel:theme';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const store = {
  get(key: string) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* storage unavailable */
    }
  },
};

// ---------------------------------------------------------------------------
// File state

// File System Access API types are not in lib.dom for all browsers.
type FileHandle = { name: string; getFile(): Promise<File>; createWritable(): Promise<{ write(d: string): Promise<void>; close(): Promise<void> }> };
let fileHandle: FileHandle | null = null;
let fileName = store.get(NAME_KEY) ?? 'Untitled.md';
let dirty = false;

function setFileName(name: string) {
  fileName = name;
  store.set(NAME_KEY, name);
  $('filename').textContent = name;
  document.title = `${name} – Kalkül`;
}
function setDirty(d: boolean) {
  dirty = d;
  $('dirty').hidden = !d;
}

// ---------------------------------------------------------------------------
// Editor

const previewCompartment = new Compartment();
let previewOn = store.get(PREVIEW_KEY) !== 'off';
let resultsOn = store.get(RESULTS_KEY) !== 'off';
let saveTimer: number | undefined;

const view = new EditorView({
  parent: $('editor'),
  state: EditorState.create({
    doc: store.get(DOC_KEY) ?? sample,
    extensions: [
      history(),
      drawSelection(),
      dropCursor(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      closeBrackets(),
      EditorView.lineWrapping,
      markdown({ base: markdownLanguage }),
      syntaxHighlighting(markdownHighlight),
      previewCompartment.of(livePreview(previewOn)),
      calc(),
      placeholder('Start typing … e.g. "rent = 1250 €"'),
      keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, ...searchKeymap, ...completionKeymap, indentWithTab]),
      EditorView.updateListener.of((u) => {
        if (!u.docChanged) return;
        setDirty(true);
        clearTimeout(saveTimer);
        saveTimer = window.setTimeout(() => store.set(DOC_KEY, u.state.doc.toString()), 300);
      }),
    ],
  }),
});

function setDoc(text: string, name: string) {
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, selection: { anchor: 0 } });
  store.set(DOC_KEY, text);
  setFileName(name);
  setDirty(false);
  view.focus();
}

// ---------------------------------------------------------------------------
// Commands

const w = window as unknown as {
  showOpenFilePicker?: (o: unknown) => Promise<FileHandle[]>;
  showSaveFilePicker?: (o: unknown) => Promise<FileHandle>;
};
const pickerTypes = [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown', '.txt'] } }];
const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

function newDoc() {
  if (dirty && !confirm('Discard unsaved changes?')) return;
  fileHandle = null;
  setDoc('', 'Untitled.md');
}

async function openDoc() {
  if (dirty && !confirm('Discard unsaved changes?')) return;
  try {
    if (w.showOpenFilePicker) {
      [fileHandle] = await w.showOpenFilePicker({ types: pickerTypes });
      const f = await fileHandle.getFile();
      setDoc(await f.text(), f.name);
    } else {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.md,.markdown,.txt,text/markdown,text/plain';
      input.onchange = async () => {
        const f = input.files?.[0];
        if (f) setDoc(await f.text(), f.name);
      };
      input.click();
    }
  } catch (e) {
    if (!isAbort(e)) alert(`Could not open file: ${e}`);
  }
}

async function saveDoc(saveAs = false) {
  const text = view.state.doc.toString();
  try {
    if (w.showSaveFilePicker) {
      if (!fileHandle || saveAs) fileHandle = await w.showSaveFilePicker({ suggestedName: fileName, types: pickerTypes });
      const writable = await fileHandle.createWritable();
      await writable.write(text);
      await writable.close();
      setFileName(fileHandle.name);
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(a.href);
    }
    setDirty(false);
  } catch (e) {
    if (!isAbort(e)) alert(`Could not save file: ${e}`);
  }
}

function applyResults() {
  document.body.classList.toggle('hide-results', !resultsOn);
  ($('tg-results') as HTMLInputElement).checked = resultsOn;
}

// Theme: auto (follows the system) → light → dark
type Theme = 'auto' | 'light' | 'dark';
const themes: Record<Theme, { icon: string; label: string; next: Theme }> = {
  auto: { icon: '◐', label: 'Auto', next: 'light' },
  light: { icon: '☀', label: 'Light', next: 'dark' },
  dark: { icon: '☾', label: 'Dark', next: 'auto' },
};
const savedTheme = store.get(THEME_KEY);
let theme: Theme = savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : 'auto';

function applyTheme() {
  const root = document.documentElement;
  if (theme === 'auto') delete root.dataset.theme;
  else root.dataset.theme = theme;
  const t = themes[theme];
  const btn = $('btn-theme');
  btn.textContent = `${t.icon} ${t.label}`;
  btn.title = `Theme: ${t.label} – click for ${themes[t.next].label}`;
}

$('btn-theme').addEventListener('click', () => {
  theme = themes[theme].next;
  store.set(THEME_KEY, theme);
  applyTheme();
});

$('btn-new').addEventListener('click', newDoc);
$('btn-open').addEventListener('click', () => void openDoc());
$('btn-save').addEventListener('click', () => void saveDoc());
$<HTMLInputElement>('tg-preview').checked = previewOn;
$<HTMLInputElement>('tg-preview').addEventListener('change', (e) => {
  previewOn = (e.target as HTMLInputElement).checked;
  store.set(PREVIEW_KEY, previewOn ? 'on' : 'off');
  view.dispatch({ effects: previewCompartment.reconfigure(livePreview(previewOn)) });
});
$<HTMLInputElement>('tg-results').addEventListener('change', (e) => {
  resultsOn = (e.target as HTMLInputElement).checked;
  store.set(RESULTS_KEY, resultsOn ? 'on' : 'off');
  applyResults();
});
$('btn-sample').addEventListener('click', () => {
  if (dirty && !confirm('Discard unsaved changes?')) return;
  fileHandle = null;
  setDoc(sample, 'Example.md');
});

window.addEventListener('keydown', (e) => {
  if (!(e.metaKey || e.ctrlKey)) return;
  const k = e.key.toLowerCase();
  if (k === 's') {
    e.preventDefault();
    void saveDoc(e.shiftKey);
  } else if (k === 'o') {
    e.preventDefault();
    void openDoc();
  }
});
window.addEventListener('beforeunload', (e) => {
  if (dirty && fileHandle) e.preventDefault();
});

setFileName(fileName);
applyResults();
applyTheme();
view.focus();

// Exchange rates
loadRates().then((s) => {
  view.dispatch({ effects: recompute.of(null) });
  $('status-rates').textContent =
    s.source === 'fallback' ? 'Exchange rates: approximate (offline)' : `Exchange rates: ECB, as of ${s.date}`;
});
