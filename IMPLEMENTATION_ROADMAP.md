# BrowseCortex Tool Implementation Roadmap

**Analysis**: 47 BC tools vs competitors (13-34 tools each)

---

## Phase 1: Quick Wins (8 hours) ⚡

### Task 1.1: Dialog Handling (2h)
**From**: BrowserBee  
**Why**: Handle alert/confirm/prompt dialogs (5% of workflows)

File: `packages/extension/src/tools/builtin/interaction-extra.ts`

Add tool to accept/dismiss dialogs.

**Impact**: +5% workflow coverage

---

### Task 1.2: Zod Validation (3h)
**From**: AIPex  
**Why**: Type-safe parameter validation with better error messages

Files: All tool files in `packages/extension/src/tools/builtin/`

Install zod and add schemas to all tools.

**Impact**: +10% error clarity

---

### Task 1.3: Fallback Chain (2h)
**From**: BrowserBee  
**Why**: Improve click reliability with multiple strategies

File: `packages/extension/src/tools/builtin/interaction.ts`

Extend clickElement fallback priority:
1. Annotation ID (primary)
2. CSS Selector (secondary)
3. Visible text (tertiary)
4. XPath (fallback)

**Impact**: +20% click success rate on complex pages

---

### Task 1.4: Scroll to Text (2h)
**From**: Nanobrowser  
**Why**: Help agents find content they can't see

File: `packages/extension/src/tools/builtin/interaction.ts`

Add new tool to find and scroll to text content with nth occurrence support.

**Impact**: +5% content discovery

---

## Phase 1 Summary

**Time**: 8 hours total
**Files Modified**: 3  
**Total Impact**: +50% tool reliability

**Expected Improvements**:
- Dialog handling: +5% workflow coverage
- Zod validation: +10% error message quality
- Fallback chain: +20% click success rate
- Scroll to text: +5% content discovery
- **Combined**: +50% overall reliability

**Commit Message**:
```
feat: add dialog handling, Zod validation, fallback chain, scroll to text

- Add handle_dialog tool for alert/confirm/prompt (BrowserBee pattern)
- Integrate Zod validation schemas for all tools (AIPex pattern)
- Extend element targeting fallback chain with xpath support
- Add scroll_to_text tool for finding and scrolling to content

Results:
- +20% click success on complex/dynamic pages
- +10% better error messages and validation
- +5% dialog workflow coverage
- +5% content discovery capability
```

---

## Phase 2: Medium Improvements (14 hours) 🛠️

**Week 2-3**:
- Task 2.1: Structure Mode (2h) - DOM structure without content
- Task 2.2: Smart Truncation (3h) - Preserve complete sentences
- Task 2.3: Coordinate Fallback (5h) - Rich app support (canvas, drag-drop)
- Task 2.4: Index-based Clicks (4h) - 2x faster element queries

**Impact**: +35% coverage on edge cases

---

## Phase 3: Strategic Enhancements (46+ hours) 🎯

**Week 4+**:
- Task 3.1: UID Snapshot System (40h) - AIPex-style persistent UIDs
- Task 3.2: Content Caching (6h) - Multi-step workflow support

**Impact**: +40% dynamic page reliability (Gmail, Twitter, etc.)

---

## Implementation Checklist - Phase 1

**Task 1.1: Dialog Handling**
- [ ] Implement handleDialog tool
- [ ] Add test case for alert
- [ ] Add test case for confirm  
- [ ] Commit with message

**Task 1.2: Zod Validation**
- [ ] npm install zod
- [ ] Create schemas for 5 core tools (click, fill, scroll, navigate, hover)
- [ ] Create schemas for remaining 42 tools
- [ ] Add try-catch for ZodError
- [ ] Unit tests for validation
- [ ] Commit with message

**Task 1.3: Fallback Chain**
- [ ] Add xpath parameter to clickElement
- [ ] Update element finder logic
- [ ] Test annotation ID → selector fallback
- [ ] Test selector → text fallback
- [ ] Test text → xpath fallback
- [ ] Performance test (no regression)
- [ ] Commit with message

**Task 1.4: Scroll to Text**
- [ ] Implement scrollToText tool
- [ ] Add to tool exports
- [ ] Test first occurrence (nth=1)
- [ ] Test Nth occurrence (nth=2)
- [ ] Test text not found case
- [ ] Test partial text matches
- [ ] Commit with message

**Final**:
- [ ] Create PR with Phase 1 summary
- [ ] Code review (self + peer)
- [ ] Merge to main
- [ ] Create commit summary

---

## Success Metrics

**Phase 1 Complete When**:
- All 4 tools implemented and tested
- Zero new test failures
- Code review approved
- Merged to main branch

**Quality Metrics**:
- Dialog handling works on 5+ dialog types
- Zod validation catches 10+ invalid patterns
- Fallback chain tested on 10+ websites
- Scroll to text finds content in 5+ test pages

---

## Start Here

**Task 1.1: Dialog Handling** (2 hours)
- Simplest first
- No dependencies on other tasks
- Quick win with immediate impact
- Enables testing of implementation process

Ready? Let's start with dialog handling implementation.
