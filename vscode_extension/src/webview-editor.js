import { EditorView, basicSetup } from 'codemirror';
import { json } from '@codemirror/lang-json';
import { EditorState } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';

const vsTheme = EditorView.theme({
  '&': { height: '100%' },
  '.cm-scroller': {
    fontFamily: 'var(--vscode-editor-font-family, "Cascadia Code", "Fira Code", monospace)',
    fontSize: '12px',
    lineHeight: '1.5',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--vscode-editorGutter-background, var(--vscode-editor-background))',
    borderRight: '1px solid var(--vscode-panel-border)',
    color: 'var(--vscode-editorLineNumber-foreground)',
  },
});

window.createCMEditor = function (element, initialValue, onChange) {
  const isDark = !document.body.classList.contains('vscode-light');
  const extensions = [
    basicSetup,
    json(),
    vsTheme,
    EditorView.updateListener.of(function (update) {
      if (update.docChanged && onChange) onChange(update.state.doc.toString());
    }),
  ];
  if (isDark) extensions.push(oneDark);

  const view = new EditorView({
    state: EditorState.create({ doc: initialValue || '', extensions }),
    parent: element,
  });

  return {
    getValue() { return view.state.doc.toString(); },
    setValue(value) {
      const cur = view.state.doc.toString();
      if (cur === (value || '')) return;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value || '' } });
    },
    layout() {},
  };
};
