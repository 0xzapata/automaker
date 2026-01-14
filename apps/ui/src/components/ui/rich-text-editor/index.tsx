import React, { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import { Bold, Italic, Code, List, ListOrdered, Quote, Heading1, Heading2, Link as LinkIcon, Eye, Pencil } from 'lucide-react';

export interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  height?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Enter text...',
  className = '',
  height = '400px',
  disabled = false,
  autoFocus = false,
}: RichTextEditorProps) {
  const [showSource, setShowSource] = React.useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primary underline cursor-pointer',
        },
      }),
    ],
    content: value,
    editable: !disabled,
    autofocus: autoFocus,
    onUpdate: ({ editor }) => {
      // Get HTML content and convert to markdown-like text
      const html = editor.getHTML();
      onChange(html);
    },
  });

  // Sync external value changes
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value);
    }
  }, [value, editor]);

  // Update disabled state
  useEffect(() => {
    if (editor) {
      editor.setEditable(!disabled);
    }
  }, [disabled, editor]);

  if (!editor) {
    return null;
  }

  const toggleLink = () => {
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('URL', previousUrl);

    if (url === null) {
      return;
    }

    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  return (
    <div className={`relative h-full w-full flex flex-col ${className}`}>
      <div
        className="relative flex-1 overflow-hidden bg-background"
      >
        {!showSource ? (
          <div className="h-full flex flex-col">
            {/* Toolbar */}
            <div className="border-b border-border bg-muted px-2 py-1.5 flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleBold().run()}
                disabled={!editor.can().chain().focus().toggleBold().run() || disabled}
                className={`p-1.5 rounded hover:bg-background transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  editor.isActive('bold') ? 'bg-background text-foreground' : 'text-muted-foreground'
                }`}
                title="Bold (Ctrl+B)"
              >
                <Bold className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => editor.chain().focus().toggleItalic().run()}
                disabled={!editor.can().chain().focus().toggleItalic().run() || disabled}
                className={`p-1.5 rounded hover:bg-background transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  editor.isActive('italic') ? 'bg-background text-foreground' : 'text-muted-foreground'
                }`}
                title="Italic (Ctrl+I)"
              >
                <Italic className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => editor.chain().focus().toggleCode().run()}
                disabled={!editor.can().chain().focus().toggleCode().run() || disabled}
                className={`p-1.5 rounded hover:bg-background transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  editor.isActive('code') ? 'bg-background text-foreground' : 'text-muted-foreground'
                }`}
                title="Code (Ctrl+E)"
              >
                <Code className="w-4 h-4" />
              </button>

              <div className="w-px h-6 bg-border my-auto mx-1" />

              <button
                type="button"
                onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                disabled={!editor.can().chain().focus().toggleHeading({ level: 1 }).run() || disabled}
                className={`p-1.5 rounded hover:bg-background transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  editor.isActive('heading', { level: 1 }) ? 'bg-background text-foreground' : 'text-muted-foreground'
                }`}
                title="Heading 1"
              >
                <Heading1 className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                disabled={!editor.can().chain().focus().toggleHeading({ level: 2 }).run() || disabled}
                className={`p-1.5 rounded hover:bg-background transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  editor.isActive('heading', { level: 2 }) ? 'bg-background text-foreground' : 'text-muted-foreground'
                }`}
                title="Heading 2"
              >
                <Heading2 className="w-4 h-4" />
              </button>

              <div className="w-px h-6 bg-border my-auto mx-1" />

              <button
                type="button"
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                disabled={!editor.can().chain().focus().toggleBulletList().run() || disabled}
                className={`p-1.5 rounded hover:bg-background transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  editor.isActive('bulletList') ? 'bg-background text-foreground' : 'text-muted-foreground'
                }`}
                title="Bullet List"
              >
                <List className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                disabled={!editor.can().chain().focus().toggleOrderedList().run() || disabled}
                className={`p-1.5 rounded hover:bg-background transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  editor.isActive('orderedList') ? 'bg-background text-foreground' : 'text-muted-foreground'
                }`}
                title="Numbered List"
              >
                <ListOrdered className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => editor.chain().focus().toggleBlockquote().run()}
                disabled={!editor.can().chain().focus().toggleBlockquote().run() || disabled}
                className={`p-1.5 rounded hover:bg-background transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  editor.isActive('blockquote') ? 'bg-background text-foreground' : 'text-muted-foreground'
                }`}
                title="Quote"
              >
                <Quote className="w-4 h-4" />
              </button>

              <div className="w-px h-6 bg-border my-auto mx-1" />

              <button
                type="button"
                onClick={toggleLink}
                disabled={disabled}
                className={`p-1.5 rounded hover:bg-background transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  editor.isActive('link') ? 'bg-background text-foreground' : 'text-muted-foreground'
                }`}
                title="Insert Link (Ctrl+K)"
              >
                <LinkIcon className="w-4 h-4" />
              </button>
            </div>

            {/* Editor content */}
            <EditorContent
              editor={editor}
              className="flex-1 overflow-y-auto p-4 prose prose-sm dark:prose-invert max-w-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-full"
            />
          </div>
        ) : (
          // Source view (HTML/markdown)
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className="w-full h-full p-4 font-mono text-sm resize-none bg-background border-none focus:outline-none focus:ring-0"
            spellCheck={false}
          />
        )}
      </div>

      {/* Source toggle button */}
      <div className="flex justify-end mt-2">
        <button
          type="button"
          onClick={() => setShowSource(!showSource)}
          disabled={disabled}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title={showSource ? 'Switch to editor' : 'View source'}
        >
          {showSource ? (
            <>
              <Pencil className="w-4 h-4" />
              <span>Edit</span>
            </>
          ) : (
            <>
              <Eye className="w-4 h-4" />
              <span>Source</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
