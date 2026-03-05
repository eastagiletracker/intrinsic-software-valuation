/**
 * Browser-native HTML sanitizer using DOMParser.
 * Whitelists safe tags and attributes, strips everything else.
 * Falls back to tag-stripping during SSR where DOMParser is unavailable.
 */

const ALLOWED_TAGS = new Set([
  'p', 'br', 'a', 'b', 'i', 'em', 'strong', 'u', 's', 'del',
  'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'span', 'div', 'blockquote', 'code', 'pre',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'hr', 'dl', 'dt', 'dd', 'sup', 'sub', 'img',
]);

const TAG_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'title']),
  img: new Set(['src', 'alt', 'title', 'width', 'height']),
};

const SAFE_URL_PATTERN = /^(?:https?:|mailto:|#)/i;

function sanitizeNode(node: Node): void {
  // Bottom-up: sanitize children first (snapshot to avoid live-list issues)
  for (const child of Array.from(node.childNodes)) {
    sanitizeNode(child);
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const el = node as Element;
  const tag = el.tagName.toLowerCase();

  if (!ALLOWED_TAGS.has(tag)) {
    const parent = el.parentNode;
    while (el.firstChild) parent?.insertBefore(el.firstChild, el);
    parent?.removeChild(el);
    return;
  }

  // Remove disallowed attributes
  const allowed = TAG_ATTRS[tag];
  for (const attr of Array.from(el.attributes)) {
    if (!allowed?.has(attr.name)) {
      el.removeAttribute(attr.name);
    }
  }

  // Validate URL-bearing attributes
  if (tag === 'a') {
    const href = el.getAttribute('href') ?? '';
    if (!SAFE_URL_PATTERN.test(href.trim())) {
      el.removeAttribute('href');
    }
    el.setAttribute('rel', 'nofollow noopener noreferrer');
    el.setAttribute('target', '_blank');
  }
  if (tag === 'img') {
    const src = el.getAttribute('src') ?? '';
    if (!SAFE_URL_PATTERN.test(src.trim())) {
      el.removeAttribute('src');
    }
  }
}

export function sanitizeHtml(html: string): string {
  if (!html) return '';

  // SSR fallback: strip all tags
  if (typeof DOMParser === 'undefined') {
    return html.replace(/<[^>]*>/g, ' ').replace(/\s{2,}/g, ' ').trim();
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  sanitizeNode(doc.body);
  return doc.body.innerHTML;
}
