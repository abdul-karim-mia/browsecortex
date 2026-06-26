# Sidepanel - Chat UI Layer

## Overview

The sidepanel is the main chat interface for BrowseCortex. It's now organized into focused, reusable components and hooks following a clean architecture pattern.

## Architecture

```
sidepanel/
├── components/              # React components organized by feature
│   ├── chat/               # Main chat interface
│   │   ├── ChatTab.tsx           # Main container
│   │   ├── ChatMessages.tsx      # Message list with auto-scroll
│   │   ├── ChatInput.tsx         # Input area with controls
│   │   ├── RunStatusBar.tsx      # Status indicators (time, tokens)
│   │   └── AskUserWidget.tsx     # Permission prompt modal
│   ├── message/            # Individual message components
│   │   ├── MessageBubble.tsx     # Single message renderer
│   │   └── MessageActions.tsx    # Hover action buttons
│   ├── working/            # Tool execution display
│   │   ├── WorkingBlock.tsx      # Grouped thinking + tools
│   │   └── ToolCallGroup.tsx     # Individual tool call + result
│   ├── modals/             # Modal popups
│   │   ├── ModelPickerPopup.tsx  # Model selection
│   │   └── ModePickerPopup.tsx   # Agent mode selection
│   └── conversation/       # Conversation management
│       └── ConversationDrawer.tsx # Sidebar drawer with list
├── hooks/                  # Custom React hooks
│   ├── useChat.ts          # Chat state + messaging logic (★ main hook)
│   ├── useAttachments.ts   # File attachment management
│   ├── useTokenTracking.ts # Context window + token calculation
│   ├── useAutoScroll.ts    # Auto-scroll behavior
│   └── usePort.ts          # Background service worker communication
├── utils/                  # Pure utility functions
│   ├── displayLines.ts     # Message → ChatLine conversion
│   ├── markdown.ts         # XSS-safe markdown rendering
│   └── highlighter.ts      # Syntax highlighting
├── types/                  # TypeScript type definitions
│   ├── chat.ts             # Chat UI types (ChatLine, Block, etc.)
│   └── protocol.ts         # Port communication types
├── context/                # React context for global state
│   └── ChatContext.ts      # Chat session context (eliminates prop drilling)
├── styles/                 # Component-specific CSS
├── index.ts                # Organized exports
├── App.tsx                 # Main app orchestrator
├── main.tsx                # Entry point
└── README.md               # This file
```

## Key Concepts

### Hooks (★ New Architecture)

**useChat** - The main hook consolidating chat state and messaging:
```typescript
const {
  lines,           // ChatLine[] - rendered messages
  running,         // boolean - request in flight
  thinking,        // boolean - reasoning/tool execution
  ask,             // AskUserPayload | null - permission modal
  errored,         // boolean - last request failed
  connected,       // boolean - port connected
  submit,          // (content, attachments) => void
  retry,           // () => void
  stop,            // () => void
  clearChat,       // () => Promise<void>
  deleteMessage,   // (id) => Promise<void>
  togglePin,       // (id, pinned) => Promise<void>
  forkFrom,        // (id) => Promise<string|null>
  runStart,        // number - epoch ms
  runTokens,       // number - output tokens this run
} = useChat(conversationId);
```

**useAttachments** - File handling:
```typescript
const {
  attachments,           // Attachment[]
  addFiles,              // (files) => Promise<void>
  removeAttachment,      // (index) => void
} = useAttachments();
```

**useTokenTracking** - Context window + token calc:
```typescript
const {
  usedTokens,            // number
  contextWindow,         // number | null
  ctxPercent,            // number
  convTokens,            // number - cumulative
} = useTokenTracking(lines, conversationId);
```

**useAutoScroll** - Scroll management:
```typescript
const {
  atBottom,              // boolean
  onScroll,              // (e) => void
  scrollToBottom,        // () => void
} = useAutoScroll(scrollRef);
```

### Components

**ChatMessages** - Message rendering pipeline
- Receives: `lines`, `running`, callbacks (`onPin`, `onDelete`, `onFork`)
- Uses: `messagesToLines()` → `groupLines()` → render blocks
- Handles: auto-scroll, retry button, empty state, scroll-to-bottom

**ChatInput** - Input area
- Handles: textarea auto-grow, drag-drop files, model/mode pickers
- Submits: `submit(content, attachments)` via parent callback

**MessageBubble** - Individual message
- Renders: markdown (assistant) or plain text (user)
- Shows: hover actions via `MessageActions` component

**WorkingBlock** - Grouped thinking + tool calls
- Collapsible container for reasoning + tool execution interleaved
- Shows: elapsed time, error count, summary

### Message Data Flow

```
1. User Input
   ChatInput → onSubmit → useChat.submit()

2. Streaming
   useChat → usePort.send(ClientMessage)
   ↓
   Background: runAgentLoop() streams SSE deltas
   ↓
   usePort receives ServerMessage (token, reasoning, tool_call, done)

3. State Update
   useChat.onServerMessage() dispatches by type
   setLines((prev) => [...prev, newLine])

4. Rendering
   lines → messagesToLines() → groupLines() → Block[]
   ↓
   <ChatMessages> renders Block[] via map

5. Persistence
   On 'done': Background saves to IndexedDB
   Next load: Storage.messages → messagesToLines → render
```

### Type Organization

**types/chat.ts** - UI-focused types
- `ChatLine` - Rendered message representation
- `Block` - "working" (grouped) or "message"
- `ChatState` - Full chat state snapshot
- `Attachment` - File attachment with data

**types/protocol.ts** - Port communication
- `ClientMessage` - UI → background (send, abort, ask_user_response)
- `ServerMessage` - background → UI (token, reasoning, tool_call, done)

## Migration from Old Structure

### Old imports (❌ deprecated):
```typescript
import { ChatTab } from './tabs/ChatTab';
import { displayLines } from './displayLines';
import { MessageBubble } from './MessageBubble';
```

### New imports (✅ recommended):
```typescript
import { ChatTab, displayLines, MessageBubble } from './index';
// or for specificity:
import { ChatTab } from './tabs/ChatTab.new';
import { displayLines } from './utils/displayLines';
import { MessageBubble } from './components/message/MessageBubble';
```

## Upgrading the Old ChatTab

The old `ChatTab.tsx` (900+ lines) is being replaced with `ChatTab.new.tsx` (~200 lines):

**Before:**
```typescript
export function ChatTab({ conversationId }) {
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [running, setRunning] = useState(false);
  const [thinking, setThinking] = useState(false);
  // ... 20 more useState calls
  
  const onServerMessage = (msg: ServerMessage) => {
    if (msg.type === 'token') { ... }
    else if (msg.type === 'reasoning') { ... }
    // ... 15 more branches
  };
  
  // ... 500 more lines
}
```

**After:**
```typescript
export function ChatTab({ conversationId }) {
  const { lines, running, thinking, submit, retry, stop, ... } = useChat(conversationId);
  const { attachments, addFiles, removeAttachment } = useAttachments();
  const { usedTokens, contextWindow, ctxPercent } = useTokenTracking(lines, conversationId);
  
  return (
    <div class="flex h-full flex-col">
      <ChatMessages lines={lines} running={running} />
      <ChatInput input={input} onSubmit={() => submit(input, attachments)} />
    </div>
  );
}
```

## Testing Structure

```
__tests__/
├── utils/
│   ├── displayLines.test.ts    # messagesToLines, groupLines
│   └── markdown.test.ts        # XSS safety
├── hooks/
│   ├── useChat.test.ts         # messaging, streaming
│   └── useAutoScroll.test.ts
└── components/
    └── MessageBubble.test.tsx   # copy, pin, delete actions
```

## Next Steps

1. ✅ **Folder structure created** - All directories in place
2. ✅ **Types split** - types/chat.ts, types/protocol.ts
3. ✅ **Hooks extracted** - useChat, useAttachments, useTokenTracking, useAutoScroll
4. ✅ **Components moved** - Organized by feature (chat, message, working, modals)
5. ✅ **MessageActions extracted** - Separate from MessageBubble
6. ⏳ **Complete migration**:
   - [ ] Backup old ChatTab.tsx → ChatTab.old.tsx
   - [ ] Rename ChatTab.new.tsx → ChatTab.tsx
   - [ ] Update all imports throughout the codebase
   - [ ] Test chat functionality end-to-end
   - [ ] Remove old files (displayLines, markdown, etc. from root)
   - [ ] Update App.tsx imports
7. ⏳ **Add ChatContext** - Eliminate prop drilling for onPin/onDelete/onFork
8. ⏳ **Add tests** - Core utilities first, then components
9. ⏳ **Performance** - Virtualize message list for 500+ messages

## Quick Start

### Using the new structure:
```typescript
// In any component:
import { useChat, useAttachments, useTokenTracking } from '../index';

// In a parent layout:
import { ChatMessages, ChatInput, RunStatusBar } from '../index';

// For utilities:
import { messagesToLines, renderMarkdown } from '../index';
```

### Adding a new component:
1. Create file in appropriate subdirectory: `components/{feature}/ComponentName.tsx`
2. Export from `components/{feature}/index.ts` (create if needed)
3. Re-export from main `index.ts`

## Architecture Principles

- ✅ **Components are small & focused** - ChatMessages renders, ChatInput handles input
- ✅ **Hooks encapsulate logic** - useChat contains all messaging, displayLines handles conversion
- ✅ **Types guide contracts** - ChatLine, Block, ClientMessage/ServerMessage
- ✅ **Storage is source of truth** - IndexedDB holds messages, React state is UI-only
- ✅ **Pure utils, complex hooks** - displayLines is pure, useChat manages side effects
- ✅ **Prop drilling eliminated** - Use ChatContext or pass callbacks
- ✅ **Testable pieces** - Small components + pure utils make testing easy

## Common Tasks

### Add a new hover action to messages:
1. Edit `components/message/MessageActions.tsx`
2. Add button with icon
3. Pass callback from `MessageBubble` → `ChatTab` → `useChat`

### Change how messages are grouped:
1. Edit `utils/displayLines.ts` → `groupLines()` function
2. Update `Block` type in `types/chat.ts` if needed
3. Update rendering in `ChatMessages.tsx`

### Add new message type (e.g., system):
1. Add `'system'` to `ChatLineRole` in `types/chat.ts`
2. Handle in `messagesToLines()` in `utils/displayLines.ts`
3. Add rendering case in `WorkingBlock.tsx` or `MessageBubble.tsx`

## References

- `/private/tmp/.../chat-system-improvements.md` - Full improvement plan
- CLAUDE.md - Project instructions
- `src/background/protocol.ts` - Port message types
- `src/types/index.ts` - Domain model (Message, Conversation, etc.)
