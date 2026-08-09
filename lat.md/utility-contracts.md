# Utility Contracts

Shared utilities define small, stable contracts for priority scheduling, filesystem naming, HTTP/media handling, and platform console integration.

## Priority Heap

The generic heap is concurrency-safe per operation and requires a non-nil comparator at construction time.

[[internal/utils/algo.go#NewHeap]] preserves the panic-based `Pop` and `Peek` compatibility API while `TryPop` and `TryPeek` return `(zero, false)` for an empty heap. Callers such as [[download-pipeline#Download Pipeline#Batch User Download]] use the safe accessors where an empty queue is a normal state.

## Filesystem Paths

Path helpers reject empty paths and generate collision suffixes without changing a dotfile into an extension-only filename.

[[internal/utils/fs.go#UniquePath]] checks the filesystem only. `UniquePathResolver` additionally reserves unwritten paths, supports its zero value, canonicalizes relative and absolute paths, and follows Windows case-insensitive path semantics.

## Windows File Names

Filename sanitization produces a Windows-compatible component within an explicit UTF-8 byte budget.

[[internal/utils/fs.go#WinFileNameWithMaxLen]] removes URLs, unsupported characters, and control characters; converts line feeds to spaces; removes carriage returns and trailing dots/spaces; and prefixes reserved device names. Empty output remains valid so naming layers can apply their domain fallback.

## HTTP And Media URLs

HTTP and Twitter media helpers fail predictably and only rewrite URLs whose parsed hosts belong to the intended CDN.

[[internal/utils/http.go#CheckRespStatus]] returns `ErrNilHTTPResponse` for a missing response and `HttpStatusError` for status codes at or above 400. [[internal/utils/user.go#EnsurePhotoHighQuality]] upgrades exact `twimg.com` hosts while preserving highest-quality and video URLs.

## Console Titles

Console title helpers expose one cross-platform API with platform-specific behavior selected at build time.

On Windows, [[internal/utils/win32.go#GetConsoleTitle]] uses cached UTF-16 Win32 procedures and treats an empty title as a successful result when no system error is present. Other platforms intentionally provide no-op setters and empty getters.

## Verification

Utility boundary tests use synthetic paths and URLs and run under the repository-wide validation commands.

Regression coverage includes empty responses and paths, dotfiles, path reservation normalization, Windows device names, safe empty-heap access, deceptive CDN hosts, and existing compatibility behavior. See [[development#Development#Testing & CI]].
