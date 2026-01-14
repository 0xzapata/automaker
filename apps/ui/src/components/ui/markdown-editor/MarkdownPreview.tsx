import React from 'react';

interface MarkdownPreviewProps {
  html: string;
  className?: string;
}

export function MarkdownPreview({ html, className = '' }: MarkdownPreviewProps) {
  return (
    <div
      className={`w-full h-full p-4 overflow-auto prose prose-sm dark:prose-invert max-w-none ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
