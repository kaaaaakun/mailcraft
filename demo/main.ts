import { createEditor, createSampleDesign } from '../src';

const KEY = 'mailcraft-demo-design';
let saved = null;
try { saved = JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { /* ignore */ }

const editor = createEditor(document.getElementById('editor')!, {
  design: saved ?? createSampleDesign(),
  onChange: (d) => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* ignore */ } },
});

const dlg = document.getElementById('dlg') as HTMLDialogElement;
const out = document.getElementById('out') as HTMLTextAreaElement;
const show = (text: string) => { out.value = text; dlg.showModal(); };
document.getElementById('btn-html')!.onclick = () => show(editor.exportHtml({ title: 'Mailcraft email' }));
document.getElementById('btn-json')!.onclick = () => show(JSON.stringify(editor.getDesign(), null, 2));
document.getElementById('btn-copy')!.onclick = async (e) => {
  await navigator.clipboard.writeText(editor.exportHtml());
  (e.target as HTMLButtonElement).textContent = 'Copied ✅';
  setTimeout(() => ((e.target as HTMLButtonElement).textContent = 'Copy HTML'), 1500);
};
