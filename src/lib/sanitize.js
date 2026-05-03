import DOMPurify from "dompurify";

// Centralised sanitization configs.  The hook in main.jsx adds
// rel="noopener noreferrer" to any <a target="_blank">, so individual
// configs only need to declare allowed tags / attributes / URIs.

// Restrictive: legacy markdown migration. No images, tables, forms.
const RICH_TEXT_NO_IMAGES = {
  ALLOWED_TAGS: [
    "h1", "h2", "h3", "p", "br", "strong", "em", "ul", "ol", "li",
    "a", "code", "pre", "blockquote", "hr",
  ],
  ALLOWED_ATTR: ["href", "target", "rel"],
};

// Default rich text: paragraphs, lists, links, inline images (data: only).
const RICH_TEXT_DEFAULT = {
  ALLOWED_TAGS: [
    "h1", "h2", "h3", "p", "br", "strong", "em", "ul", "ol", "li",
    "a", "code", "pre", "blockquote", "hr", "img",
  ],
  ALLOWED_ATTR: ["href", "target", "rel", "src", "alt"],
  ALLOWED_URI_REGEXP: /^data:image\/(png|jpeg|jpg|gif|webp);base64,.*$/,
  ADD_URI_SAFE_ATTR: ["src"],
};

// Tiptap-style document editor: adds tables, task lists, classes,
// and named image refs (Tiptap uses data-image-id).
const RICH_TEXT_FULL = {
  ALLOWED_TAGS: [
    "h1", "h2", "h3", "h4", "h5", "h6",
    "p", "br", "strong", "em", "u", "s", "code", "pre",
    "blockquote", "ol", "ul", "li", "a", "img", "hr",
    "table", "thead", "tbody", "tr", "th", "td",
    "mark", "span", "div", "input",
  ],
  ALLOWED_ATTR: [
    "href", "src", "alt", "title", "target", "rel",
    "class", "data-image-id", "type", "checked", "disabled",
  ],
  ALLOW_DATA_ATTR: true,
};

export function sanitizeRichText(html, variant = "default") {
  const config =
    variant === "noImages" ? RICH_TEXT_NO_IMAGES :
    variant === "full" ? RICH_TEXT_FULL :
    RICH_TEXT_DEFAULT;
  return DOMPurify.sanitize(String(html || ""), config);
}

// Re-export DOMPurify so call sites can still drop down to bespoke
// configs without re-importing the dependency directly.
export { default as DOMPurify } from "dompurify";
