/** Organized exports for sidepanel components and utilities */

// Components
export { ChatTab } from './tabs/ChatTab';
export { ChatMessages } from './components/chat/ChatMessages';
export { ChatInput } from './components/chat/ChatInput';
export { RunStatusBar } from './components/chat/RunStatusBar';
export { AskUserWidget } from './components/chat/AskUserWidget';
export { MessageBubble } from './components/message/MessageBubble';
export { MessageActions } from './components/message/MessageActions';
export { WorkingBlock } from './components/working/WorkingBlock';
export { ToolCallRow } from './components/working/ToolCallGroup';
export { ConversationDrawer } from './components/conversation/ConversationDrawer';
export { ModelPickerPopup } from './components/modals/ModelPickerPopup';
export { ModePickerPopup } from './components/modals/ModePickerPopup';

// Hooks
export { useChat } from './hooks/useChat';
export { useAttachments } from './hooks/useAttachments';
export { useTokenTracking } from './hooks/useTokenTracking';
export { useAutoScroll } from './hooks/useAutoScroll';
export { usePort } from './hooks/usePort';

// Utilities
export { messagesToLines, groupLines } from './utils/displayLines';
export { renderMarkdown } from './utils/markdown';
export { highlightCode } from './utils/highlighter';

// Types
export type { ChatLine, ChatState, Attachment } from './types/chat';
export type { ClientMessage, ServerMessage, ToolCall } from './types/protocol';

// Context
export { ChatContext, useChatContext } from './context/ChatContext';
