import React from 'react';

interface MarkdownInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function MarkdownInput({
  value,
  onChange,
  placeholder = 'Enter markdown text...',
  className = '',
}: MarkdownInputProps) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full h-full p-4 font-mono text-sm resize-none bg-background border-none focus:outline-none ${className}`}
      spellCheck={false}
    />
  );
}
