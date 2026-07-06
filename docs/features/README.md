# Features -- In-Housing Plan

**Goal:** Remove fieldtheory-cli runtime dependencies. Native sync and generate are done; F2-F4
remain backlog.

## Feature List

| ID | Feature                   | Priority | Status | Doc                              |
| -- | ------------------------- | -------- | ------ | -------------------------------- |
| F0 | Base GraphQL Port (Sync)  | P0       | Done   | [F0](./F0-base-graphql-port.md)  |
| F1 | Generate (Template-Based) | P1       | Done   | [F1](./F1-generate.md)           |
| F2 | Unified Extraction        | P2       | Open   | [F2](./F2-unified-extraction.md) |
| F3 | Bookmark Folders          | P3       | Open   | [F3](./F3-bookmark-folders.md)   |
| F4 | Media Download            | P4       | Open   | [F4](./F4-media-download.md)     |

F0/F1 specs are design history. Live docs: AGENTS.md, README.md, TODO.md.

## Current Status

| Area             | Status                                  |
| ---------------- | --------------------------------------- |
| Sync             | Native GraphQL                          |
| Generate         | Template closures -> ~/StoneVault/wiki/ |
| Bookmark folders | Not implemented                         |
| Media download   | Not implemented                         |

Open engineering: see TODO.md (tests, LLM fallback, article images).
