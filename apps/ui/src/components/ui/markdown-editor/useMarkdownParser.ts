import { useState, useCallback, useEffect, useRef } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js';

// Configure marked with syntax highlighting
marked.setOptions({
  highlight: (code, lang) => {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(code, { language: lang }).value;
      } catch (err) {
        console.error('Highlight.js error:', err);
      }
    }
    return hljs.highlightAuto(code).value;
  },
  breaks: true,
  gfm: true,
});

// Configure DOMPurify to allow code highlighting classes
const purifyConfig = {
  ALLOWED_TAGS: [
    'p', 'br', 'strong', 'em', 'u', 's', 'code', 'pre',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li',
    'blockquote',
    'a',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'span', 'div',
    'img',
    'input',
  ],
  ALLOWED_ATTR: [
    'href', 'title', 'target', 'rel',
    'class',
    'src', 'alt', 'width', 'height',
    'type', 'checked', 'disabled',
  ],
  ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
};

export interface UseMarkdownParserOptions {
  debounceMs?: number;
  initialValue?: string;
}

export function useMarkdownParser(options: UseMarkdownParserOptions = {}) {
  const { debounceMs = 200, initialValue = '' } = options;

  const [rawMarkdown, setRawMarkdown] = useState(initialValue);
  const [renderedHtml, setRenderedHtml] = useState('');
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const parseAndSanitize = useCallback((markdown: string) => {
    try {
      // Parse markdown to HTML
      const html = marked.parse(markdown) as string;

      // Sanitize HTML to prevent XSS
      const sanitized = DOMPurify.sanitize(html, purifyConfig);

      return sanitized;
    } catch (err) {
      console.error('Markdown parsing error:', err);
      // Fallback to escaped plaintext
      return DOMPurify.sanitize(markdown.replace(/</g, '&lt;').replace(/>/g, '&gt;'));
    }
  }, []);

  // Update rendered HTML when raw markdown changes (with debouncing)
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      const html = parseAndSanitize(rawMarkdown);
      setRenderedHtml(html);
    }, debounceMs);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [rawMarkdown, debounceMs, parseAndSanitize]);

  const updateMarkdown = useCallback((value: string) => {
    setRawMarkdown(value);
  }, []);

  return {
    rawMarkdown,
    renderedHtml,
    updateMarkdown,
    parseAndSanitize,
  };
}
