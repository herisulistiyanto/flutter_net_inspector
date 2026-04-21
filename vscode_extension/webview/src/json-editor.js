/**
 * CodeMirror 6 JSON editor for the VS Code webview.
 *
 * Exposes a global `CMEditor` API so the inline <script> in index.html
 * can create / manage editor instances without importing ES-module code.
 */

import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, highlightActiveLine, rectangularSelection } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { json, jsonParseLinter } from '@codemirror/lang-json';
import { syntaxHighlighting, HighlightStyle, bracketMatching, foldGutter, foldKeymap, indentOnInput } from '@codemirror/language';
import { linter, lintGutter } from '@codemirror/lint';
import { closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { tags } from '@lezer/highlight';

// ---------------------------------------------------------------------------
// Theme – reads from the CSS custom properties set by the VS Code webview
// ---------------------------------------------------------------------------

const vsCodeTheme = EditorView.theme({
  '&': {
    backgroundColor: 'var(--input-bg)',
    color: 'var(--input-fg)',
    fontSize: '12px',
    fontFamily: "var(--vscode-editor-font-family, 'Cascadia Code', 'Fira Code', monospace)",
    border: '1px solid var(--input-border)',
    borderRadius: '4px',
  },
  '&.cm-focused': {
    outline: 'none',
    borderColor: 'var(--accent)',
  },
  '.cm-content': {
    padding: '6px 0',
    caretColor: 'var(--input-fg)',
    fontFamily: 'inherit',
    minHeight: '120px',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--input-fg)',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--bg-secondary)',
    color: 'var(--fg-muted)',
    border: 'none',
    borderRight: '1px solid var(--border)',
    minWidth: '32px',
  },
  '.cm-gutter.cm-lineNumbers .cm-gutterElement': {
    padding: '0 4px 0 8px',
    fontSize: '11px',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'color-mix(in srgb, var(--list-hover) 60%, transparent)',
  },
  '.cm-activeLine': {
    backgroundColor: 'color-mix(in srgb, var(--list-hover) 30%, transparent)',
  },
  '.cm-selectionBackground, ::selection': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 30%, transparent) !important',
  },
  '.cm-matchingBracket': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 25%, transparent)',
    outline: '1px solid color-mix(in srgb, var(--accent) 50%, transparent)',
  },
  '.cm-foldPlaceholder': {
    backgroundColor: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    color: 'var(--fg-muted)',
    padding: '0 4px',
    borderRadius: '3px',
  },
  '.cm-tooltip': {
    backgroundColor: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    color: 'var(--fg)',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
  },
  '.cm-tooltip-autocomplete ul li[aria-selected]': {
    backgroundColor: 'var(--list-active)',
    color: 'var(--list-active-fg)',
  },
  '.cm-scroller': {
    overflow: 'auto',
  },
  '.cm-panels.cm-panels-bottom': {
    borderTop: '1px solid var(--border)',
  },
  '.cm-searchMatch': {
    backgroundColor: 'color-mix(in srgb, var(--warn) 30%, transparent)',
    outline: '1px solid color-mix(in srgb, var(--warn) 50%, transparent)',
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 40%, transparent)',
  },
  // Lint styles
  '.cm-lintRange-error': {
    backgroundImage: 'none',
    textDecoration: 'underline wavy var(--error)',
    textDecorationSkipInk: 'none',
  },
  '.cm-lintRange-warning': {
    backgroundImage: 'none',
    textDecoration: 'underline wavy var(--warn)',
    textDecorationSkipInk: 'none',
  },
  '.cm-lint-marker-error': {
    content: '"●"',
    color: 'var(--error)',
  },
  '.cm-lint-marker-warning': {
    content: '"●"',
    color: 'var(--warn)',
  },
  '.cm-diagnostic': {
    padding: '4px 8px',
  },
  '.cm-diagnostic-error': {
    borderLeft: '3px solid var(--error)',
  },
  '.cm-diagnostic-warning': {
    borderLeft: '3px solid var(--warn)',
  },
}, { dark: true }); // Default to dark — VS Code themes are usually dark

// ---------------------------------------------------------------------------
// Syntax highlighting colours – match the JSON colour variables in index.html
// ---------------------------------------------------------------------------

const vsCodeHighlighting = syntaxHighlighting(HighlightStyle.define([
  { tag: tags.propertyName,   color: 'var(--json-key)' },
  { tag: tags.string,         color: 'var(--json-string)' },
  { tag: tags.number,         color: 'var(--json-number)' },
  { tag: tags.bool,           color: 'var(--json-bool)' },
  { tag: tags.null,           color: 'var(--json-null)' },
  { tag: tags.punctuation,    color: 'var(--fg-muted)' },
  { tag: tags.brace,          color: 'var(--fg-muted)' },
  { tag: tags.squareBracket,  color: 'var(--fg-muted)' },
]));

// ---------------------------------------------------------------------------
// Editor creation
// ---------------------------------------------------------------------------

function createJsonEditor(container, options = {}) {
  const {
    doc = '',
    minHeight = '140px',
    readOnly = false,
    onChange = null,
    onValidate = null,
  } = options;

  const readOnlyComp = new Compartment();

  const extensions = [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    foldGutter(),
    drawSelection(),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    autocompletion(),
    rectangularSelection(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    json(),
    linter(jsonParseLinter()),
    lintGutter(),
    vsCodeTheme,
    vsCodeHighlighting,
    readOnlyComp.of(EditorState.readOnly.of(readOnly)),
    keymap.of([
      indentWithTab,
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...completionKeymap,
    ]),
    EditorView.theme({
      '.cm-content': {
        minHeight: minHeight,
      },
      '.cm-scroller': {
        minHeight: minHeight,
      },
    }),
  ];

  // onChange callback
  if (typeof onChange === 'function') {
    extensions.push(EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChange(update.state.doc.toString());
      }
    }));
  }

  // onValidate callback – fires on every change with a boolean
  if (typeof onValidate === 'function') {
    extensions.push(EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const text = update.state.doc.toString().trim();
        if (!text) {
          onValidate(true, '');
          return;
        }
        try {
          JSON.parse(text);
          onValidate(true, '');
        } catch (e) {
          onValidate(false, e.message);
        }
      }
    }));
  }

  const state = EditorState.create({ doc, extensions });
  const view = new EditorView({ state, parent: container });

  return {
    /** Get the full editor content. */
    getValue() {
      return view.state.doc.toString();
    },

    /** Replace the full editor content. */
    setValue(text) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text || '' },
      });
    },

    /** Pretty-format JSON (no-op if invalid). */
    format() {
      const text = view.state.doc.toString().trim();
      if (!text) return;
      try {
        const formatted = JSON.stringify(JSON.parse(text), null, 2);
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: formatted },
        });
      } catch (_) {
        // not valid JSON — leave as-is
      }
    },

    /** Set read-only state. */
    setReadOnly(ro) {
      view.dispatch({
        effects: readOnlyComp.reconfigure(EditorState.readOnly.of(ro)),
      });
    },

    /** Focus the editor. */
    focus() {
      view.focus();
    },

    /** Destroy the editor view. */
    destroy() {
      view.destroy();
    },

    /** Raw EditorView for advanced usage. */
    view,
  };
}

// ---------------------------------------------------------------------------
// Expose globally
// ---------------------------------------------------------------------------

window.CMEditor = { create: createJsonEditor };
