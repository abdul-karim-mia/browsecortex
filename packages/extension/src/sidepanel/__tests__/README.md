# Chat System Testing Guide

## Overview

This directory contains tests for the refactored chat system. Tests are organized by component type and use Vitest as the test runner.

## Test Structure

```
__tests__/
├── utils/
│   ├── displayLines.test.ts      # Message conversion & grouping
│   ├── markdown.test.ts          # XSS safety & rendering
│   └── tokens.test.ts            # Token estimation
├── hooks/
│   ├── useChat.test.ts           # Messaging logic, state management
│   └── useAutoScroll.test.ts     # Scroll behavior
└── components/
    ├── MessageBubble.test.tsx    # Message rendering
    └── ChatMessages.test.tsx     # Message list rendering
```

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests for a specific file
npm test -- displayLines.test.ts

# Run tests with coverage
npm test -- --coverage
```

## Test Categories

### 1. Utility Tests (Fast, Pure Functions)

**displayLines.test.ts** - Core message conversion pipeline
- ✅ User message conversion
- ✅ Reasoning (thinking) blocks
- ✅ Tool call/result pairing
- ✅ Error detection
- ✅ Pinned message handling
- ✅ Block grouping logic

**markdown.test.ts** - Content rendering safety
- ✅ XSS escaping
- ✅ Safe HTML preservation
- ✅ Code block rendering
- ✅ Link sanitization

**tokens.test.ts** - Token estimation
- ✅ Character → token conversion (~4 chars/token)
- ✅ Edge cases (empty, very long)

### 2. Hook Tests (State & Side Effects)

**useChat.test.ts** - Core chat state machine
- ✅ Submit message flow
- ✅ Server message handling (token, reasoning, tool_call, done)
- ✅ Error handling & retry
- ✅ Stop/abort
- ✅ Message history reload on done
- ✅ Permission prompts (ask_user)

**useAutoScroll.test.ts** - Scroll behavior
- ✅ Track scroll position
- ✅ Auto-scroll at bottom
- ✅ Manual scroll to bottom

### 3. Component Tests (Rendering & Interaction)

**MessageBubble.test.tsx** - Individual message rendering
- ✅ Markdown rendering (assistant)
- ✅ Plain text rendering (user)
- ✅ Copy action
- ✅ Pin/unpopover action
- ✅ Delete action
- ✅ Fork action
- ✅ Pinned indicator

**ChatMessages.test.tsx** - Message list
- ✅ Renders list of messages
- ✅ Groups thinking + tools
- ✅ Empty state
- ✅ Scroll to bottom button
- ✅ Retry button on error

## Writing Tests

### Utility Test Example

```typescript
import { describe, it, expect } from 'vitest';
import { messagesToLines } from '../displayLines';

describe('messagesToLines', () => {
  it('converts user messages', () => {
    const messages = [{ role: 'user', content: 'Hello', ... }];
    const lines = messagesToLines(messages);
    
    expect(lines).toHaveLength(1);
    expect(lines[0].role).toBe('user');
    expect(lines[0].content).toBe('Hello');
  });
});
```

### Hook Test Example

```typescript
import { renderHook, act } from '@testing-library/preact/hooks';
import { useChat } from '../../hooks/useChat';

describe('useChat', () => {
  it('submits message and updates lines', async () => {
    const { result } = renderHook(() => useChat('conv1'));
    
    act(() => {
      result.current.submit('Hello', []);
    });
    
    expect(result.current.running).toBe(true);
    expect(result.current.lines).toHaveLength(1);
  });
});
```

### Component Test Example

```typescript
import { render, screen } from '@testing-library/preact';
import { MessageBubble } from '../../components/message/MessageBubble';

describe('MessageBubble', () => {
  it('renders user message', () => {
    const line = { role: 'user', content: 'Hi' };
    render(<MessageBubble line={line} />);
    
    expect(screen.getByText('Hi')).toBeInTheDocument();
  });
});
```

## Test Coverage Targets

| Module | Current | Target | Priority |
|--------|---------|--------|----------|
| displayLines.ts | ✅ 100% | 100% | High |
| markdown.ts | ⏳ 0% | 95%+ | High |
| MessageBubble | ⏳ 0% | 90%+ | Medium |
| useChat hook | ⏳ 0% | 85%+ | High |
| ChatMessages | ⏳ 0% | 85%+ | Medium |

## Key Test Scenarios

### Message Conversion
- [ ] User messages with text
- [ ] Assistant messages with reasoning
- [ ] Tool calls with arguments
- [ ] Tool results with/without errors
- [ ] Pinned messages
- [ ] Empty messages

### Rendering Pipeline
- [ ] messagesToLines → groupLines → render
- [ ] Thinking blocks paired with tools
- [ ] Working blocks separated from messages
- [ ] Order preserved

### Chat State Machine
- [ ] Submit → running=true, thinking=true
- [ ] Token → update lines, runTokens++
- [ ] Reasoning → add thinking line
- [ ] Tool call → add tool row
- [ ] Tool result → update tool row
- [ ] Done → running=false, reload from Storage
- [ ] Error → errored=true, show error

### Safety
- [ ] XSS in message content escaped
- [ ] Code blocks rendered safely
- [ ] Links sanitized
- [ ] HTML entities preserved

## Mocking Strategy

### Storage Mock
```typescript
vi.mock('@/storage', () => ({
  Storage: {
    messages: {
      byConversation: vi.fn(),
      save: vi.fn(),
      remove: vi.fn(),
    },
    conversations: {
      get: vi.fn(),
      save: vi.fn(),
    },
  },
}));
```

### Port Mock
```typescript
vi.mock('../hooks/usePort', () => ({
  usePort: vi.fn(() => ({
    send: vi.fn(),
    connected: true,
  })),
}));
```

## Running Tests in CI

Tests run automatically on:
- Push to feature branches (pre-merge check)
- Pull request creation
- Main branch commits

Coverage reports:
- Generated after test run
- Uploaded to coverage dashboard
- Must be ≥80% for PR approval

## Debugging Tests

```bash
# Run single test file in debug mode
npm test -- --debug displayLines.test.ts

# Run with verbose output
npm test -- --reporter=verbose

# Generate coverage report
npm test -- --coverage --coverage.reporter=html
```

## Common Issues

### Tests hanging
- Check useChat mock properly aborts
- Ensure Storage mocks resolve
- Check for missing act() wraps

### Type errors in tests
- Import types separately: `import type { ChatLine } from '../../types/chat'`
- Use @testing-library types: `import { render } from '@testing-library/preact'`

### Flaky tests
- Don't rely on timing (setTimeout, etc.)
- Mock date/time if needed: `vi.useFakeTimers()`
- Ensure mocks are reset: `vi.clearAllMocks()`

## Next Steps

1. **Short term** (this week)
   - [x] displayLines tests
   - [ ] markdown tests
   - [ ] MessageBubble tests

2. **Medium term** (next 2 weeks)
   - [ ] useChat tests
   - [ ] ChatMessages tests
   - [ ] Integration tests

3. **Long term** (this quarter)
   - [ ] E2E tests
   - [ ] Performance tests
   - [ ] Accessibility tests

## Resources

- [Vitest Docs](https://vitest.dev)
- [Testing Library](https://testing-library.com/preact)
- [Best Practices](https://github.com/testing-library/testing-library-dom/blob/main/README.md#priorities)
