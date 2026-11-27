import { syntaxTree, HighlightStyle } from '@codemirror/language';
import type { Range } from '@codemirror/state';
import { Decoration, ViewPlugin, WidgetType, type DecorationSet, type EditorView, type ViewUpdate } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';

export const markdownHighlight = HighlightStyle.define([
  { tag: t.heading, fontWeight: '700', color: 'var(--heading)' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through', color: 'var(--muted)' },
  { tag: t.monospace, fontFamily: 'var(--mono)', fontSize: '0.92em' },
  { tag: t.link, color: 'var(--accent)' },
  { tag: t.url, color: 'var(--muted)' },
  { tag: t.processingInstruction, color: 'var(--muted)' },
  { tag: t.quote, color: 'var(--muted)' },
  { tag: t.contentSeparator, color: 'var(--muted)' },
]);

class BulletWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const s = document.createElement('span');
    s.className = 'cm-md-bullet';
    s.textContent = '•';
    return s;
  }
}

const hide = Decoration.replace({});
const bullet = Decoration.replace({ widget: new BulletWidget() });
const lineClass: Record<string, Decoration> = {};
const lineDeco = (cls: string) => (lineClass[cls] ??= Decoration.line({ class: cls }));

/**
 * Line-based styling (headings, quotes, code blocks) is always on.
 * With `hideMarkup`, Markdown syntax is hidden except on lines with the cursor (like Obsidian).
 */
function build(view: EditorView, hideMarkup: boolean): DecorationSet {
  const { state } = view;
  const active = new Set<number>();
  if (view.hasFocus) {
    for (const r of state.selection.ranges) {
      for (let l = state.doc.lineAt(r.from).number; l <= state.doc.lineAt(r.to).number; l++) active.add(l);
    }
  }
  const decos: Range<Decoration>[] = [];
  const styledLines = new Set<number>();
  const styleLines = (from: number, to: number, cls: string) => {
    for (let l = state.doc.lineAt(from).number; l <= state.doc.lineAt(to).number; l++) {
      if (styledLines.has(l)) continue;
      styledLines.add(l);
      decos.push(lineDeco(cls).range(state.doc.line(l).from));
    }
  };

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        const name = node.name;
        const heading = /^(ATXHeading|SetextHeading)(\d)$/.exec(name);
        if (heading) {
          styleLines(node.from, node.to, `cm-md-h${heading[2]}`);
          return;
        }
        if (name === 'FencedCode') {
          const first = state.doc.lineAt(node.from).number;
          const last = state.doc.lineAt(node.to).number;
          for (let l = first; l <= last; l++) {
            if (styledLines.has(l)) continue;
            styledLines.add(l);
            let cls = 'cm-md-codeblock';
            if (l === first) cls += ' cm-md-codeblock-first';
            if (l === last) cls += ' cm-md-codeblock-last';
            decos.push(lineDeco(cls).range(state.doc.line(l).from));
          }
          return false;
        }
        if (name === 'Blockquote') styleLines(node.from, node.to, 'cm-md-quote');
        if (!hideMarkup) return;
        const onActive = active.has(state.doc.lineAt(node.from).number);
        if (onActive) return;
        switch (name) {
          case 'HeaderMark': {
            const parent = node.node.parent?.name ?? '';
            if (!parent.startsWith('ATXHeading')) break;
            let end = node.to;
            if (state.doc.sliceString(end, end + 1) === ' ') end++;
            decos.push(hide.range(node.from, end));
            break;
          }
          case 'QuoteMark': {
            let end = node.to;
            if (state.doc.sliceString(end, end + 1) === ' ') end++;
            decos.push(hide.range(node.from, end));
            break;
          }
          case 'EmphasisMark':
          case 'StrikethroughMark':
            decos.push(hide.range(node.from, node.to));
            break;
          case 'CodeMark':
            if (node.node.parent?.name === 'InlineCode') decos.push(hide.range(node.from, node.to));
            break;
          case 'ListMark':
            if (node.node.parent?.parent?.name === 'BulletList') decos.push(bullet.range(node.from, node.to));
            break;
        }
      },
    });
  }
  return Decoration.set(decos, true);
}

export function livePreview(hideMarkup: boolean) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = build(view, hideMarkup);
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.selectionSet || u.viewportChanged || u.focusChanged) this.decorations = build(u.view, hideMarkup);
      }
    },
    { decorations: (v) => v.decorations },
  );
}
