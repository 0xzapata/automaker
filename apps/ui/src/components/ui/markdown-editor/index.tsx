import React, { useEffect, useState, useRef, KeyboardEvent } from 'react';
import { Eye, Code } from 'lucide-react';
import { useMarkdownParser } from './useMarkdownParser';

export interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  height?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder = 'Enter markdown text...',
  className = '',
  height = '400px',
  disabled = false,
  autoFocus = false,
}: MarkdownEditorProps) {
  // Manual toggle between edit and preview mode
  const [showPreview, setShowPreview] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const { rawMarkdown, renderedHtml, updateMarkdown } = useMarkdownParser({
    initialValue: value,
    debounceMs: 50, // Much snappier - 50ms instead of 200ms
  });

  // Track the last value we sent to parent to avoid sync loops
  const lastSentValueRef = useRef(value);

  // Sync external value changes with internal state (only for external changes)
  useEffect(() => {
    // Only update if value changed externally (not from our own onChange call)
    if (value !== rawMarkdown && value !== lastSentValueRef.current) {
      updateMarkdown(value);
      lastSentValueRef.current = value;
    }
  }, [value, rawMarkdown, updateMarkdown]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    updateMarkdown(newValue);
    lastSentValueRef.current = newValue;
    onChange(newValue);
  };

  const togglePreview = () => {
    setShowPreview(!showPreview);
  };

  const handlePreviewClick = () => {
    setShowPreview(false);
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  };

  // Handle keyboard shortcuts
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Allow Ctrl+B for bold, Ctrl+I for italic, etc.
    if (e.ctrlKey || e.metaKey) {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selectedText = rawMarkdown.substring(start, end);
      let newText = rawMarkdown;
      let newCursorPos = end;

      switch (e.key.toLowerCase()) {
        case 'b': // Bold
          e.preventDefault();
          newText = rawMarkdown.substring(0, start) + `**${selectedText}**` + rawMarkdown.substring(end);
          newCursorPos = selectedText ? end + 4 : start + 2;
          break;
        case 'i': // Italic
          e.preventDefault();
          newText = rawMarkdown.substring(0, start) + `*${selectedText}*` + rawMarkdown.substring(end);
          newCursorPos = selectedText ? end + 2 : start + 1;
          break;
        case 'k': // Link
          e.preventDefault();
          newText = rawMarkdown.substring(0, start) + `[${selectedText}](url)` + rawMarkdown.substring(end);
          newCursorPos = selectedText ? end + 7 : start + 1;
          break;
        default:
          return;
      }

      updateMarkdown(newText);
      lastSentValueRef.current = newText;
      onChange(newText);
      setTimeout(() => {
        textarea.selectionStart = newCursorPos;
        textarea.selectionEnd = newCursorPos;
      }, 0);
    }
  };

  return (
    <div className="relative">
      <div
        className={`relative border rounded-lg overflow-hidden bg-background ${className}`}
        style={{ height }}
      >
        {!showPreview ? (
          // Edit mode - show textarea (default)
          <textarea
            ref={textareaRef}
            value={rawMarkdown}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            autoFocus={autoFocus}
            className="absolute inset-0 w-full h-full p-4 font-mono text-sm resize-none bg-background border-none focus:outline-none focus:ring-0"
            spellCheck={false}
          />
        ) : (
          // Preview mode - show rendered markdown with scrolling
          <div
            ref={previewRef}
            className="absolute inset-0 w-full h-full p-4 overflow-y-auto prose prose-sm dark:prose-invert max-w-none"
          >
            {rawMarkdown ? (
              <div dangerouslySetInnerHTML={{ __html: renderedHtml }} />
            ) : (
              <div className="text-muted-foreground">{placeholder}</div>
            )}
          </div>
        )}
      </div>

      {/* Toggle button - positioned below the editor */}
      <div className="flex justify-end mt-2">
        <button
          type="button"
          onClick={togglePreview}
          disabled={disabled}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title={showPreview ? 'Switch to editor' : 'Switch to preview'}
        >
          {showPreview ? (
            <>
              <Code className="w-4 h-4" />
              <span>Edit</span>
            </>
          ) : (
            <>
              <Eye className="w-4 h-4" />
              <span>Preview</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
