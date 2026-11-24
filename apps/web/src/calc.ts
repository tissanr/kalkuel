import { StateEffect, StateField, type EditorState, type Extension, type Range } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, hoverTooltip, keymap, type DecorationSet } from '@codemirror/view';
import { autocompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import {
  AVG_WORDS, CONSTANTS, FUNCTIONS, KEYWORDS, PREV_WORDS, SUM_WORDS,
  currencyCodes, evaluateDocument, unitNames, type DocResult,
} from '@kalkuel/engine';

/** Dispatch to force a re-evaluation (e.g. after exchange rates were loaded). */
export const recompute = StateEffect.define<null>();

export const resultsField = StateField.define<DocResult>({
  create: (s) => evaluateDocument(s.doc.toString()),
  update: (value, tr) =>
    tr.docChanged || tr.effects.some((e) => e.is(recompute)) ? evaluateDocument(tr.state.doc.toString()) : value,
});

async function copy(text: string, el?: HTMLElement) {
  try {
    await navigator.clipboard.writeText(text);
    if (el) {
      el.classList.add('cm-calc-copied');
      setTimeout(() => el.classList.remove('cm-calc-copied'), 700);
    }
  } catch {
    /* clipboard not available */
  }
}

class ResultWidget extends WidgetType {
  constructor(
    readonly text: string,
    readonly error: boolean,
    readonly inline: boolean,
  ) {
    super();
  }
  eq(o: ResultWidget) {
    return o.text === this.text && o.error === this.error && o.inline === this.inline;
  }
  toDOM() {
    const el = document.createElement('span');
    el.className = this.inline ? 'cm-calc-inline' : 'cm-calc-result';
    if (this.error) {
      el.classList.add('cm-calc-error');
      el.textContent = this.inline ? '⚠' : `⚠ ${this.text}`;
      el.title = this.text;
    } else {
      el.textContent = this.text;
      el.title = 'Click to copy';
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        void copy(this.text, el);
      });
    }
    return el;
  }
  ignoreEvent() {
    return true;
  }
}

const marks: Record<string, Decoration> = {};
const mark = (type: string) => (marks[type] ??= Decoration.mark({ class: `cm-calc-${type}` }));

function buildDecorations(state: EditorState): DecorationSet {
  const res = state.field(resultsField);
  const ranges: Range<Decoration>[] = [];
  res.lines.forEach((lr, i) => {
    if (!lr || i >= state.doc.lines) return;
    const line = state.doc.line(i + 1);
    for (const s of lr.spans) if (s.to > s.from) ranges.push(mark(s.type).range(line.from + s.from, line.from + s.to));
    for (const inl of lr.inline) {
      const w = new ResultWidget(inl.text ?? inl.error ?? '', !inl.text, true);
      ranges.push(Decoration.widget({ widget: w, side: 1 }).range(line.from + inl.to));
    }
    if (lr.text || lr.error) {
      const w = new ResultWidget(lr.text ?? lr.error!, !lr.text, false);
      ranges.push(Decoration.widget({ widget: w, side: 2 }).range(line.to));
    }
  });
  return Decoration.set(ranges, true);
}

const decorations = EditorView.decorations.compute([resultsField], buildDecorations);

const variableTooltip = hoverTooltip((view, pos) => {
  const word = view.state.wordAt(pos);
  if (!word) return null;
  const name = view.state.sliceDoc(word.from, word.to);
  const info = view.state.field(resultsField).vars.get(name);
  if (!info) return null;
  return {
    pos: word.from,
    end: word.to,
    above: true,
    create() {
      const dom = document.createElement('div');
      dom.className = 'cm-calc-tooltip';
      dom.innerHTML = `<b></b> = <span></span><small></small>`;
      dom.querySelector('b')!.textContent = name;
      dom.querySelector('span')!.textContent = info.text;
      dom.querySelector('small')!.textContent = `  · defined on line ${info.line + 1}`;
      return { dom };
    },
  };
});

const staticOptions: Completion[] = [
  ...Object.keys(FUNCTIONS).map((f) => ({ label: f, type: 'function', apply: `${f}(` })),
  ...[...PREV_WORDS, ...SUM_WORDS, ...AVG_WORDS].map((w) => ({ label: w, type: 'keyword' })),
  ...[...KEYWORDS].map((w) => ({ label: w, type: 'keyword', boost: -1 })),
  ...Object.keys(CONSTANTS).map((c) => ({ label: c, type: 'constant' })),
];

function completions(ctx: CompletionContext): CompletionResult | null {
  const word = ctx.matchBefore(/[\p{L}_°][\p{L}\p{N}_²³]*/u);
  if (!word) return null;
  if (!ctx.explicit && word.to - word.from < 2) return null;
  const line = ctx.state.doc.lineAt(ctx.pos);
  const res = ctx.state.field(resultsField);
  const isCalc = !!res.lines[line.number - 1] || /[\d=]/.test(line.text);
  if (!isCalc && !ctx.explicit) return null;
  const vars: Completion[] = [...res.vars].map(([name, v]) => ({ label: name, type: 'variable', detail: v.text, boost: 2 }));
  const currencies = new Set(currencyCodes());
  const units: Completion[] = unitNames().map((u) => ({ label: u, type: currencies.has(u) ? 'text' : 'type', boost: -2 }));
  return { from: word.from, options: [...vars, ...staticOptions, ...units], validFor: /^[\p{L}\p{N}_²³]*$/u };
}

/** Copies the result of the line under the cursor. */
function copyLineResult(view: EditorView): boolean {
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  const lr = view.state.field(resultsField).lines[line.number - 1];
  const text = lr?.text ?? lr?.inline.find((i) => i.text)?.text;
  if (text) void copy(text);
  return true;
}

export function calc(): Extension {
  return [
    resultsField,
    decorations,
    variableTooltip,
    autocompletion({ override: [completions], activateOnTyping: true }),
    keymap.of([{ key: 'Mod-Shift-c', run: copyLineResult }]),
  ];
}
