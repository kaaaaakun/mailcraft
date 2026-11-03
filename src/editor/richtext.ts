/**
 * Editor-side normalisation of the rich-text HTML that contenteditable produces. Runs on top of `sanitizeRichText`
 * (which handles safety); this only removes noise so the stored design stays tidy.
 */
export function cleanRichHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  for (const el of Array.from(doc.body.querySelectorAll('*'))) {
    if (el.hasAttribute('style') && !(el.getAttribute('style') ?? '').trim()) el.removeAttribute('style');
    if (el.tagName === 'A') el.removeAttribute('tabindex'); // editor-only (links are not tabbable inside the canvas)
    // Stray empty paragraphs left behind by list commands. A deliberate blank line is `<p><br></p>` and has a child.
    if (el.tagName === 'P' && el.childNodes.length === 0) el.remove();
  }
  return doc.body.innerHTML;
}

/**
 * Pasted markup adopts the block's own look: comments and style / class / id attributes are dropped, and paragraphs get
 * `margin:0` like the paragraphs of a default text block.
 */
export function normalizePasted(root: DocumentFragment): void {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  const comments: Node[] = [];
  while (walker.nextNode()) comments.push(walker.currentNode);
  comments.forEach((c) => c.parentNode?.removeChild(c));
  root.querySelectorAll<HTMLElement>('*').forEach((el) => {
    el.removeAttribute('style');
    el.removeAttribute('class');
    el.removeAttribute('id');
    if (el.tagName === 'P') el.setAttribute('style', 'margin:0');
  });
}

/** Character offset of the caret/selection end inside `el`, or null when the selection is elsewhere. */
export function caretOffset(el: HTMLElement): number | null {
  const sel = el.ownerDocument.defaultView?.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const r = sel.getRangeAt(0);
  if (!el.contains(r.endContainer)) return null;
  const pre = r.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(r.endContainer, r.endOffset);
  return pre.toString().length;
}

/** Put the caret at a character offset (clamped to the text length). */
export function setCaretOffset(el: HTMLElement, offset: number): void {
  const doc = el.ownerDocument;
  const sel = doc.defaultView?.getSelection();
  if (!sel) return;
  const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let left = offset;
  let node = walker.nextNode();
  let last: Node | null = null;
  const range = doc.createRange();
  while (node) {
    const len = node.textContent?.length ?? 0;
    last = node;
    if (left <= len) { range.setStart(node, left); range.collapse(true); sel.removeAllRanges(); sel.addRange(range); return; }
    left -= len;
    node = walker.nextNode();
  }
  if (last) range.setStart(last, last.textContent?.length ?? 0);
  else range.setStart(el, 0);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}
