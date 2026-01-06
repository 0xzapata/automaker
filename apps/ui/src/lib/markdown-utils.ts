/**
 * Strips markdown formatting syntax from text while preserving plain text content.
 * This is useful for displaying clean preview text in UI components like kanban cards.
 *
 * @param text - The markdown-formatted text to strip
 * @returns Plain text without markdown formatting
 */
export function stripMarkdown(text: string): string {
  if (!text) return '';

  let result = text;

  // Remove code blocks (```code```) - must be done before inline code
  result = result.replace(/```[\s\S]*?```/g, '\n');

  // Remove inline code (`code`)
  result = result.replace(/`([^`]+)`/g, '$1');

  // Remove images (![alt](url))
  result = result.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');

  // Remove links but keep link text ([text](url))
  result = result.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // Remove HTML tags
  result = result.replace(/<[^>]+>/g, '');

  // Remove headers (### Header or Header\n===)
  result = result.replace(/^#{1,6}\s+(.+)$/gm, '$1');
  result = result.replace(/^(.+)\n[=-]{2,}$/gm, '$1');

  // Remove bold (**text** or __text__)
  result = result.replace(/(\*\*|__)(.*?)\1/g, '$2');

  // Remove italic (*text* or _text_) - be careful not to match mid-word underscores
  result = result.replace(/(\*|_)([^*_]+)\1/g, '$2');

  // Remove strikethrough (~~text~~)
  result = result.replace(/~~(.*?)~~/g, '$1');

  // Remove blockquotes (> text)
  result = result.replace(/^>\s+(.+)$/gm, '$1');

  // Remove task list markers (- [ ] or - [x]) - must be before unordered list markers
  result = result.replace(/^[\s]*[-*+]\s+\[[x\s]\]\s+/gim, '');

  // Remove unordered list markers (- or * or +)
  result = result.replace(/^[\s]*[-*+]\s+/gm, '');

  // Remove ordered list markers (1. or 1) )
  result = result.replace(/^[\s]*\d+[\.)]\s+/gm, '');

  // Remove horizontal rules (---, ***, ___)
  result = result.replace(/^[\s]*[-*_]{3,}[\s]*$/gm, '');

  // Clean up multiple consecutive newlines (but preserve double newlines for paragraph breaks)
  result = result.replace(/\n{3,}/g, '\n\n');

  // Clean up multiple consecutive spaces (but not newlines)
  result = result.replace(/[^\S\n]{2,}/g, ' ');

  // Clean up spaces at the beginning and end of lines
  result = result.replace(/^[ \t]+|[ \t]+$/gm, '');

  // Trim whitespace from start and end
  result = result.trim();

  return result;
}
