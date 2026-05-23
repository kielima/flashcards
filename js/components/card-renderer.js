import { marked } from 'marked';
import katex from 'katex';

marked.setOptions({ breaks: true, gfm: true });

export function renderCard(text) {
  if (!text) return '';

  const placeholders = {};
  let i = 0;

  // Extract $$...$$ (display math) before markdown parsing
  let processed = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, math) => {
    const key = `\x00BLOCK${i++}\x00`;
    try {
      placeholders[key] = katex.renderToString(math.trim(), { displayMode: true, throwOnError: false });
    } catch {
      placeholders[key] = `<code>$$${math}$$</code>`;
    }
    return key;
  });

  // Extract $...$ (inline math)
  processed = processed.replace(/\$([^$\n]+?)\$/g, (_, math) => {
    const key = `\x00INLINE${i++}\x00`;
    try {
      placeholders[key] = katex.renderToString(math.trim(), { displayMode: false, throwOnError: false });
    } catch {
      placeholders[key] = `<code>$${math}$</code>`;
    }
    return key;
  });

  // Parse markdown
  let html = marked.parse(processed);

  // Restore math
  for (const [key, value] of Object.entries(placeholders)) {
    html = html.replaceAll(key, value);
  }

  return html;
}

export function renderInto(element, text) {
  element.innerHTML = renderCard(text);
  element.classList.add('rendered');
}
