const BLOCKED_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT']);

/** Browser-only sanitizer for the rich-text (contenteditable) output. Drops dangerous tags, on* handlers and unsafe URLs. */
export function sanitizeRichText(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      if (BLOCKED_TAGS.has(child.tagName)) { child.remove(); continue; }
      for (const attr of Array.from(child.attributes)) {
        const name = attr.name.toLowerCase();
        const val = attr.value.trim();
        if (name.startsWith('on') || ((name === 'href' || name === 'src') && !/^(https?:|mailto:|tel:|#|\/|\{\{)/i.test(val))) {
          child.removeAttribute(attr.name);
        }
      }
      walk(child);
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}
