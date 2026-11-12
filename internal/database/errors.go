package database

import "errors"

// ErrEntityNotFound indicates that a database entity disappeared before a mutation committed.
var ErrEntityNotFound = errors.New("database entity not found")

// ErrUserLinkNotFound 表示 UPDATE/DELETE 目标 user_links 行已不存在（并发删除）。
var ErrUserLinkNotFound = errors.New("user link not found")

// ErrLstNotFound 表示 UPDATE 目标 lsts 行已不存在。
var ErrLstNotFound = errors.New("list not found")
