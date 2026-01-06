/**
 * Test file for markdown-utils.ts
 * Run with: npx tsx apps/ui/src/lib/markdown-utils.test.ts
 */

import { stripMarkdown } from './markdown-utils';

interface TestCase {
  name: string;
  input: string;
  expected: string;
}

const testCases: TestCase[] = [
  {
    name: 'Empty string',
    input: '',
    expected: '',
  },
  {
    name: 'Plain text (no markdown)',
    input: 'This is plain text',
    expected: 'This is plain text',
  },
  {
    name: 'Bold text (**)',
    input: 'This is **bold** text',
    expected: 'This is bold text',
  },
  {
    name: 'Bold text (__)',
    input: 'This is __bold__ text',
    expected: 'This is bold text',
  },
  {
    name: 'Italic text (*)',
    input: 'This is *italic* text',
    expected: 'This is italic text',
  },
  {
    name: 'Italic text (_)',
    input: 'This is _italic_ text',
    expected: 'This is italic text',
  },
  {
    name: 'Strikethrough',
    input: 'This is ~~strikethrough~~ text',
    expected: 'This is strikethrough text',
  },
  {
    name: 'Inline code',
    input: 'Use `console.log()` to debug',
    expected: 'Use console.log() to debug',
  },
  {
    name: 'Code block',
    input: 'Here is code:\n```javascript\nconst x = 1;\n```\nEnd',
    expected: 'Here is code:\n\nEnd',
  },
  {
    name: 'Headers (# style)',
    input: '# Title\n## Subtitle\n### Section',
    expected: 'Title\nSubtitle\nSection',
  },
  {
    name: 'Links',
    input: 'Check out [this link](https://example.com)',
    expected: 'Check out this link',
  },
  {
    name: 'Images',
    input: 'Here is an image: ![alt text](image.png)',
    expected: 'Here is an image: alt text',
  },
  {
    name: 'Unordered lists',
    input: '- Item 1\n- Item 2\n* Item 3',
    expected: 'Item 1\nItem 2\nItem 3',
  },
  {
    name: 'Ordered lists',
    input: '1. First\n2. Second\n3. Third',
    expected: 'First\nSecond\nThird',
  },
  {
    name: 'Blockquotes',
    input: '> This is a quote\n> Another line',
    expected: 'This is a quote\nAnother line',
  },
  {
    name: 'Task lists',
    input: '- [ ] Todo item\n- [x] Done item',
    expected: 'Todo item\nDone item',
  },
  {
    name: 'Horizontal rules',
    input: 'Before\n---\nAfter',
    expected: 'Before\nAfter', // Horizontal rules are just removed, single newline preserved
  },
  {
    name: 'HTML tags',
    input: 'This is <strong>HTML</strong> text',
    expected: 'This is HTML text',
  },
  {
    name: 'Mixed markdown',
    input:
      '## Feature: **Authentication**\n\n- Implement `login()` function\n- Add [JWT](https://jwt.io) support\n- Create ~~session~~ token management',
    expected:
      'Feature: Authentication\nImplement login() function\nAdd JWT support\nCreate session token management', // Empty lines between header and list are collapsed
  },
  {
    name: 'Nested formatting',
    input: '**This is _nested_ formatting**',
    expected: 'This is nested formatting',
  },
  {
    name: 'Multiple consecutive spaces',
    input: 'Too    many     spaces',
    expected: 'Too many spaces',
  },
  {
    name: 'Multiple newlines',
    input: 'Line 1\n\n\n\nLine 2',
    expected: 'Line 1\n\nLine 2',
  },
  {
    name: 'Real-world example',
    input:
      '### User Story\n\nAs a **developer**, I want to add _markdown support_ so that:\n\n- Users can format text\n- Documentation is more readable\n- Code snippets look nice: `npm install`\n\n> Note: This will require updates to the UI',
    expected:
      'User Story\n\nAs a developer, I want to add markdown support so that:\nUsers can format text\nDocumentation is more readable\nCode snippets look nice: npm install\n\nNote: This will require updates to the UI', // Paragraph breaks preserved, but list collapses with preceding text
  },
];

function runTests() {
  console.log('Running markdown-utils tests...\n');

  let passed = 0;
  let failed = 0;

  testCases.forEach((testCase, index) => {
    const result = stripMarkdown(testCase.input);
    const success = result === testCase.expected;

    if (success) {
      passed++;
      console.log(`✅ Test ${index + 1}: ${testCase.name}`);
    } else {
      failed++;
      console.log(`❌ Test ${index + 1}: ${testCase.name}`);
      console.log(`   Input:    "${testCase.input}"`);
      console.log(`   Expected: "${testCase.expected}"`);
      console.log(`   Got:      "${result}"`);
    }
  });

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Tests passed: ${passed}/${testCases.length}`);
  console.log(`Tests failed: ${failed}/${testCases.length}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  if (failed > 0) {
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests();
}

export { runTests, testCases };
