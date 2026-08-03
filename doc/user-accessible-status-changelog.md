> **⚠️ 历史文档说明**
> 本文档描述的是 v2.8.0 引入 `is_accessible` 字段时的实现，此后已多次重构。
> **勘误**：初版文档虚构了 `InaccessibleIDs` 收集机制（`MembersResult.InaccessibleIDs`、`parseItemContentToUser` 返回不可访问 ID、列表下载流程遍历 `InaccessibleIDs` 调 `SetUserAccessible`）。该机制在任何版本中都不存在——真实的不可访问检测位于 `internal/twitter/user.go` 的 `parseUserResults()`（`UserUnavailable` 时返回 `rest_id`），由调用方通过 `SetUserAccessible` / `SetUserAccessibleByScreenName` 标记（见 4.2.5、4.3.6、4.6.2）。
> 当前实现：`is_accessible` 字段仍保留在数据库模型中（`internal/database/model.go`），标记逻辑已改为 `internal/database/user.go` 的 `MarkUserInaccessible` / `MarkListMembersAccessibleByIDs`（由 `internal/downloading/list_download.go`、`internal/service/download_service.go`、`internal/downloading/profile/downloader.go` 调用）。
> 文中引用的 v2.8.0 时代文件名已变更：`internal/database/crud.go` 拆分至 `user.go`、`lst.go` 等；`internal/downloading/features.go` 拆分至 `list_download.go`、`list_sync.go`、`mark_downloaded.go`、`user_sync.go`；`internal/twitter/twitter_test.go` 已删除；`internal/profile/` 移至 `internal/downloading/profile/`。如需了解当前实现，请参考实际代码。

***

# 用户可访问状态记录功能 - 代码变更文档

## 一、功能概述

在 `users` 表中新增 `is_accessible` 字段，用于记录 Twitter 用户是否可通过 API 正常访问（非封禁/注销状态）。每次下载列表成员时，自动检测并更新该状态。

### 核心需求
- **区分可访问/不可访问用户**：Twitter API 对封禁/注销用户返回 `UserUnavailable` 类型，需识别并记录
- **自动更新**：每次获取列表成员时同步更新数据库中的访问状态
- **向后兼容**：对已有 `foo.db` 数据库无破坏性影响

---

## 二、架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                        调用链路                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  main.go (userArgs.GetUser) / profile 下载                  │
│      └── twitter.GetUserById() / GetUserByScreenName()      │
│                      │                                      │
│                      ↓                                      │
│              twitter/user.go                                │
│                  parseUserResults()                         │
│                      ├── 正常 → 返回 (*User, rest_id, nil)  │
│                      └── UserUnavailable → 返回 (nil,       │
│                            rest_id, error)                 │
│                                          ↓                  │
│  main.go (userArgs.GetUser)             │                   │
│      ├── uid > 0 → database.SetUserAccessible(db, uid,      │
│      │              false)                                  │
│      └── uid == 0（screen_name 查询）→                      │
│            database.SetUserAccessibleByScreenName(...)      │
│                                                             │
│  downloading/features.go                                    │
│      ├── syncUser(db, user, accessible)                     │
│      │       └── CreateUser / UpdateUser (含 is_accessible) │
│      ├── downloadList() / syncLstAndGetMembers() /          │
│      │   MarkUsersAsDownloaded()                            │
│      │       └── lst.GetMembers() → *MembersResult{Users}   │
│      │           （不含不可访问用户收集，见 4.3）            │
│      └── syncUserAndEntity → syncUser(db, user, true)       │
│                                                             │
│  internal/profile/downloader.go                             │
│      └── syncUserDirectory(): 成功获取 Profile              │
│              → usrdb.IsAccessible = true                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 三、文件变更清单

| 文件 | 变更类型 | 涉及函数/结构体 |
|------|----------|----------------|
| `internal/database/model.go` | 新增字段 | `User.IsAccessible` |
| `internal/database/crud.go`（已拆分至 `user.go`、`schema.go` 等） | Schema + 函数 + 新增 | `schema`, `CreateUser`, `UpdateUser`, `MigrateDatabase`, `SetUserAccessible`, `SetUserAccessibleByScreenName` |
| `internal/twitter/user.go` | 函数重构 | `parseUserResults`, `getUser`（UserUnavailable 检测，返回 rest_id） |
| `internal/twitter/list.go` | 接口 + 结构 + 函数重构 | `ListBase`, `MembersResult`, `parseItemContentToUser`, `itemContentsToUsers`, `getMembers`, `List.GetMembers`, `UserFollowing.GetMembers` |
| `internal/downloading/features.go`（已拆分至 `list_download.go`、`list_sync.go`、`mark_downloaded.go`、`user_sync.go`） | 签名变更 + 调用点更新 | `syncUser`, `downloadList`, `syncLstAndGetMembers`, `MarkUsersAsDownloaded` |
| `internal/profile/downloader.go`（现位于 `internal/downloading/profile/downloader.go`） | 字段赋值 | `syncUserDirectory` |
| `main.go` | 调用点更新 + 迁移调用 | `connectDatabase`, `userArgs.GetUser` |
| `internal/twitter/twitter_test.go`（已删除） | 测试适配 | `TestGetMembers` |

---

## 四、逐文件详细变更

### 4.1 internal/database/model.go

**变更目的**：在数据模型中增加可访问状态字段

```go
// === 修改前 ===
type User struct {
	Id           uint64 `db:"id"`
	ScreenName   string `db:"screen_name"`
	Name         string `db:"name"`
	IsProtected  bool   `db:"protected"`
	FriendsCount int    `db:"friends_count"`
}

// === 修改后 ===
type User struct {
	Id           uint64 `db:"id"`
	ScreenName   string `db:"screen_name"`
	Name         string `db:"name"`
	IsProtected  bool   `db:"protected"`
	FriendsCount int    `db:"friends_count"`
	IsAccessible bool   `db:"is_accessible"`  // 新增
}
```

**说明**：
- 使用 `db:"is_accessible"` 标签映射到 SQLite 列名
- 布尔类型，SQLite 中存储为 `0`/`1`
- Go 零值 `false` 对应 SQLite 的 `0`

---

### 4.2 internal/database/crud.go

#### 4.2.1 Schema 变更

```sql
-- 新增列定义
is_accessible BOOLEAN NOT NULL DEFAULT 1
```

**说明**：
- `DEFAULT 1`：现有用户默认为可访问
- `NOT NULL`：确保字段不为空

#### 4.2.2 新增 MigrateDatabase 函数

```go
func MigrateDatabase(db *sqlx.DB) error {
	migrations := []string{
		`ALTER TABLE users ADD COLUMN is_accessible BOOLEAN NOT NULL DEFAULT 1`,
	}
	for _, migration := range migrations {
		if _, err := db.Exec(migration); err != nil {
			if !strings.Contains(err.Error(), "duplicate column name") {
				return fmt.Errorf("migration failed: %w", err)
			}
			// 已存在该列时忽略错误
		}
	}
	return nil
}
```

**设计要点**：
- 使用迁移数组模式，方便未来添加更多迁移
- 容错处理 `duplicate column name`：支持重复执行
- 在 `connectDatabase()` 中调用，确保每次启动都检查

#### 4.2.3 CreateUser 变更

```go
// === 修改前 ===
stmt := `INSERT INTO Users(id, screen_name, name, protected, friends_count)
        VALUES(:id, :screen_name, :name, :protected, :friends_count)`

// === 修改后 ===
stmt := `INSERT INTO Users(id, screen_name, name, protected, friends_count, is_accessible)
        VALUES(:id, :screen_name, :name, :protected, :friends_count, :is_accessible)`
```

#### 4.2.4 UpdateUser 变更

```go
// === 修改前 ===
stmt := `UPDATE users SET screen_name=:screen_name, name=:name,
        protected=:protected, friends_count=:friends_count WHERE id=:id`

// === 修改后 ===
stmt := `UPDATE users SET screen_name=:screen_name, name=:name,
        protected=:protected, friends_count=:friends_count,
        is_accessible=:is_accessible WHERE id=:id`
```

#### 4.2.5 新增 SetUserAccessible 函数

```go
func SetUserAccessible(db *sqlx.DB, uid uint64, accessible bool) error {
	stmt := `UPDATE users SET is_accessible=? WHERE id=?`
	result, err := db.Exec(stmt, accessible, uid)
	if err != nil {
		return fmt.Errorf("failed to set accessible status for user %d: %w", uid, err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected for user %d: %w", uid, err)
	}
	if rows == 0 {
		return fmt.Errorf("user %d not found, cannot set accessible status", uid)
	}
	return nil
}
```

同版本还新增了 `SetUserAccessibleByScreenName`（按 `screen_name` 更新，逻辑一致）。

**设计要点**：
- 单独更新访问状态，无需完整 User 对象
- 用户不存在时**返回 "not found" 错误，不自动创建用户**——调用方将 `not found` 视为预期情况忽略（见 4.6.2），避免为不存在的用户写入仅含 ID 的空记录
- 用于标记不可访问用户时的轻量操作

---

### 4.3 internal/twitter/list.go

#### 4.3.1 接口签名变更

```go
// === 修改前 ===
type ListBase interface {
	GetMembers(context.Context, *resty.Client) ([]*User, error)
	GetId() int64
	Title() string
}

// === 修改后 ===
type ListBase interface {
	GetMembers(context.Context, *resty.Client) (*MembersResult, error)  // 变更
	GetId() int64
	Title() string
}
```

#### 4.3.2 新增 MembersResult 结构体

```go
type MembersResult struct {
	Users []*User
}
```

**设计决策**：
- 将成员列表封装为结果对象，便于后续扩展
- 注意：本版本 **没有** 在 `MembersResult` 中收集不可访问用户 ID。列表成员解析对 `UserUnavailable` 成员仅跳过（解析失败），不可访问检测发生在 `twitter/user.go` 的 `parseUserResults()`（见 4.3.6）

#### 4.3.3 新增 parseItemContentToUser 辅助函数

```go
func parseItemContentToUser(ic gjson.Result) (*User, error) {
	user_results, err := getResults(ic, timelineUser)
	if err != nil {
		return nil, err
	}
	if user_results.String() == "{}" {
		return nil, fmt.Errorf("empty user results")
	}

	u, _, err := parseUserResults(&user_results)
	if err != nil {
		return nil, err
	}
	return u, nil
}
```

**说明**：此函数从 `itemContentsToUsers` 内联逻辑中提取，不包含不可访问检测——`parseUserResults` 返回 `UserUnavailable` 错误时，该成员被跳过（与旧逻辑一致）。

#### 4.3.4 重构 itemContentsToUsers

```go
// === 修改前 ===
func itemContentsToUsers(itemContents []gjson.Result) []*User { ... }

// === 修改后 ===
func itemContentsToUsers(itemContents []gjson.Result) MembersResult {
	result := MembersResult{
		Users: make([]*User, 0, len(itemContents)),
	}
	for _, ic := range itemContents {
		user, err := parseItemContentToUser(ic)
		if err != nil {
			log.Debugln("parseItemContentToUser failed:", err)
			continue
		}
		if user != nil {
			result.Users = append(result.Users, user)
		}
	}
	return result
}
```

#### 4.3.5 getMembers 及实现类变更

所有以下函数的返回类型从 `([]*User, error)` 改为 `(*MembersResult, error)`：

- `getMembers()` - 内部通用函数
- `List.GetMembers()` - 列表成员获取
- `UserFollowing.GetMembers()` - 关注列表获取

#### 4.3.6 internal/twitter/user.go：parseUserResults 检测 UserUnavailable

不可访问用户的检测实际发生在这里（返回 `rest_id` 供调用方标记）：

```go
func parseUserResults(user_results *gjson.Result) (*User, uint64, error) {
	result := user_results.Get("result")
	if !result.Exists() {
		return nil, 0, fmt.Errorf("user result does not exist")
	}
	if result.Get("__typename").String() == "UserUnavailable" {
		// 返回不可访问用户的 ID，用于标记状态
		if restId := result.Get("rest_id"); restId.Exists() {
			log.Debugf("UserUnavailable detected, rest_id: %s", restId.String())
			return nil, restId.Uint(), fmt.Errorf("user unavaiable")
		}
		// 尝试从其他字段获取ID
		log.Debugf("UserUnavailable result: %s", result.String())
		return nil, 0, fmt.Errorf("user unavaiable")
	}
	// ... 正常解析 legacy 字段
}
```

**返回值语义**：
| 返回值组合 | 含义 |
|-----------|------|
| `(user, rest_id, nil)` | 正常用户 |
| `(nil, rest_id, error)` | 不可访问用户，rest_id 为其 ID |
| `(nil, 0, error)` | 解析失败（含 UserUnavailable 无 rest_id 的情况，如 screen_name 查询） |

---

### 4.4 internal/downloading/features.go

#### 4.4.1 syncUser 签名变更

```go
// === 修改前 ===
func syncUser(db *sqlx.DB, user *twitter.User) error { ... }

// === 修改后 ===
func syncUser(db *sqlx.DB, user *twitter.User, accessible bool) error {
    // ... 原有逻辑 ...
    usrdb.IsAccessible = accessible  // 新增赋值
    // ... 后续 CRUD ...
}
```

**调用处变更**：

```go
// syncUser 的唯一调用点（syncUserAndEntity，features.go:524；该函数又被
// BatchUserDownload / DownloadUser 等多处调用）
if err := syncUser(db, user, true); err != nil { ... }
//                                    ^^^^
//                          成功获取到用户信息，标记为可访问
```

#### 4.4.2 downloadList 变更

```go
membersResult, err := list.GetMembers(ctx, client)
if err != nil {
    return nil, err
}

eid, err := ent.Id()
if err != nil {
    return nil, err
}

members := membersResult.Users
if len(members) == 0 {
    return nil, nil
}
log.Debugln("members:", len(members))
packgedUsers := make([]userInLstEntity, len(members))
for i, user := range members {
    packgedUsers[i] = userInLstEntity{user: user, leid: &eid}
}
return BatchUserDownload(ctx, client, db, packgedUsers, realDir, true, additional, dwn)
```

**行为变化**（实际 diff，git b22b570^..b22b570）：
- 旧逻辑：`members, err := list.GetMembers(...)`；`if err != nil || len(members) == 0 { return nil, err }`
- 新逻辑：只有 API 错误才返回 error；空成员列表返回 `nil, nil`（本版本列表流程不收集/标记不可访问用户）

#### 4.4.3 syncLstAndGetMembers 变更

```go
membersResult, err := lst.GetMembers(ctx, client)
if err != nil {
    return nil, err
}

members := membersResult.Users
if len(members) == 0 {
    return nil, nil
}
```

**行为变化**：与 downloadList 相同——旧逻辑 `if err != nil || len(members) == 0 { return nil, err }`；新逻辑仅 API 错误返回 error，空成员列表返回 `nil, nil`。同样不在此处标记不可访问用户。

#### 4.4.4 MarkUsersAsDownloaded 变更

```go
membersResult, err := lst.GetMembers(ctx, client)
if err != nil {
    // 错误处理不变 ...
    continue
}

// 仅遍历可访问用户（无 InaccessibleIDs 收集）
for _, user := range membersResult.Users {
    info := markSingleUserWithInfo(db, user, dir, timestamp)
    results = append(results, info)
    // ...
}
```

---

### 4.5 internal/profile/downloader.go

#### syncUserDirectory 变更

```go
usrdb.FriendsCount = 0
usrdb.IsProtected = profile.Protected
usrdb.Name = profile.Name
usrdb.ScreenName = screenName
usrdb.IsAccessible = true  // 新增：成功获取 profile 说明用户可访问
```

**说明**：Profile 下载走的是独立 API（非列表），能成功获取到 Profile 数据即证明用户可访问。

---

### 4.6 main.go

#### 4.6.1 connectDatabase 变更

```go
func connectDatabase(path string) (*sqlx.DB, error) {
    // ... 原有逻辑 ...
    database.CreateTables(db)
    database.MigrateDatabase(db)  // 新增：执行数据库迁移
    // ...
}
```

**调用时机**：程序启动时，在 `CreateTables` 之后立即执行。

#### 4.6.2 userArgs.GetUser 变更（标记不可访问用户）

实际变更发生在 `userArgs.GetUser`（CLI 用户参数解析/校验路径），而非列表下载流程。`twitter.GetUserById` / `GetUserByScreenName` 失败时返回从 `UserUnavailable` 中提取的 uid，据此标记：

```go
usr, uid, err := twitter.GetUserById(ctx, client, id)
if err != nil {
    // 标记不可访问用户（如果存在于数据库中）
    if uid > 0 {
        if markErr := database.SetUserAccessible(db, uid, false); markErr != nil {
            // 用户不存在时不记录警告（预期行为）
            if !strings.Contains(markErr.Error(), "not found") {
                log.Warnln("failed to mark user as inaccessible:", uid, markErr)
            }
        }
    }
    return nil, err
}
```

screen_name 分支同理：`GetUserByScreenName` 失败时若 uid > 0 用 `SetUserAccessible`，否则（API 对 screen_name 查询的 UserUnavailable 响应不含 rest_id）改用 `SetUserAccessibleByScreenName(db, screenName, false)`。

---

### 4.7 internal/twitter/twitter_test.go

测试代码适配新的返回类型：

```go
// === 修改前 ===
users, err := lst.GetMembers(ctx, client)
// ...

users, err = fo.GetMembers(ctx, client)

// === 修改后 ===
usersResult, err := lst.GetMembers(ctx, client)
users := usersResult.Users  // 从结果中提取
// ...

usersResult, err = fo.GetMembers(ctx, client)
users = usersResult.Users
```

---

## 五、数据流图

### 5.1 用户解析与列表下载时的完整流程

```
    ┌─────────────────────────────┐    ┌─────────────────────────────┐
    │ 用户解析（GetUserById /      │    │ 列表下载（downloadList /     │
    │ GetUserByScreenName）        │    │ syncLstAndGetMembers /      │
    └────────────┬────────────────┘    │ MarkUsersAsDownloaded）     │
                 │                     └──────────────┬──────────────┘
                 ▼                                    ▼
    ┌──────────────────────┐            ┌──────────────────────┐
    │ twitter/user.go      │            │ twitter/list.go      │
    │ parseUserResults()   │            │ itemContentsToUsers()│
    └──────────┬───────────┘            └──────────┬───────────┘
               │                                   │
    ┌──────────┴──────────┐              ┌─────────▼─────────┐
    │ 正常用户             │              │ 正常用户 → Users[]│
    │ (user, rest_id, nil)│              │ UserUnavailable / │
    └──────────┬──────────┘              │ 解析失败 → 跳过    │
               │                         └─────────┬─────────┘
    ┌──────────▼──────────┐                        │
    │ UserUnavailable     │                        ▼
    │ (nil, rest_id, err) │           ┌────────────────────────┐
    └──────────┬──────────┘           │ syncUser(db, user,     │
               │                      │   accessible=true)     │
               ▼                      │ → CreateUser/UpdateUser│
    ┌──────────────────────┐          └────────────────────────┘
    │ 调用方 main.go        │
    │ userArgs.GetUser:    │
    │ uid>0 →              │
    │ SetUserAccessible(   │
    │   db, uid, false)    │
    │ uid==0 →             │
    │ SetUserAccessibleBy- │
    │ ScreenName(db,name,  │
    │   false)             │
    └──────────────────────┘
```

**说明**：不可访问标记只发生在用户解析路径（CLI 参数解析、Profile 下载），列表成员下载流程不标记。Profile 下载成功时在 `syncUserDirectory` 中置 `usrdb.IsAccessible = true`（见 4.5）。

### 5.2 数据库状态转换

```
┌─────────────────────────────────────────────────────────┐
│                   is_accessible 状态机                    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│   ┌──────────────┐                                      │
│   │  默认值: true  │ ← 新建用户 / 数据库迁移              │
│   └──────┬───────┘                                      │
│          │                                              │
│   ┌──────▼───────┐    ┌──────────────────┐              │
│   │   true       │◄──►│     false         │              │
│   │  (可访问)     │    │   (不可访问)       │              │
│   │              │    │                  │              │
│   │ syncUser()   │    │ SetUserAccess..  │              │
│   │ (accessible  │    │ (accessible=false)│              │
│   │  =true)      │    │                  │              │
│   └──────────────┘    └──────────────────┘              │
│                                                         │
│   触发条件:                                              │
│   → true:  成功通过 API 获取到用户信息                     │
│   → false: API 返回 UserUnavailable                      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 六、向后兼容性保证

### 6.1 数据库兼容

| 场景 | 行为 | 结果 |
|------|------|------|
| 全新安装 | `CREATE TABLE` 包含新列 | ✅ 正常工作 |
| 旧数据库首次启动 | `ALTER TABLE` 添加新列 | ✅ 所有用户默认 `is_accessible=1` |
| 旧数据库重复启动 | `ALTER TABLE` 报 duplicate column name | ✅ 忽略错误，继续运行 |

### 6.2 API 兼容

| 场景 | 行为 |
|------|------|
| 列表成员全部不可访问 | `GetMembers` 返回空 `Users[]`（解析失败成员被跳过，无错误） |
| 列表中部分可访问 | `Users[]` 仅含可访问成员 |
| 列表不存在 | 返回 error（原有逻辑不变） |

### 6.3 代码兼容

- `User` 结构体零值的 `IsAccessible=false`，但通过 `DEFAULT 1` 保证数据库层面正确
- `SetUserAccessible` / `SetUserAccessibleByScreenName` 对不存在的用户返回 "not found" 错误，调用方将其视为预期情况忽略（不自动建用户，见 4.2.5、4.6.2）
- 所有调用点已统一更新，无遗留编译错误

---

## 七、测试验证

### 7.1 编译验证

```bash
go build ./...   # 通过，无错误
```

### 7.2 单元测试

```bash
go test ./internal/database/...   # 通过
go test ./internal/downloading/... # 通过
```

### 7.3 手动验证建议

1. **新建数据库测试**：删除或重命名 `foo.db`，运行程序确认新表结构正确
2. **旧数据库迁移测试**：使用现有 `foo.db`，运行程序确认自动添加新列
3. **不可访问用户测试**：找一个已知被封禁/注销的用户所在列表，运行下载确认被正确标记
4. **查询验证**：
   ```sql
   -- 查看所有不可访问用户
   SELECT id, screen_name, name FROM users WHERE is_accessible = 0;

   -- 查看可访问用户数量
   SELECT COUNT(*) FROM users WHERE is_accessible = 1;
   ```

---

## 八、潜在风险与缓解措施

| 风险 | 影响 | 缓解措施 | 当前状态 |
|------|------|----------|----------|
| `UserUnavailable` 无 `rest_id` | 无法记录该不可访问用户 ID | 代码中有 `Exists()` 检查，无 ID 则跳过 | ⚠️ 需实际 API 测试验证 |
| 大量不可访问用户导致频繁 UPDATE | 性能影响 | SQLite WAL 模式 + 批量写入优化空间 | 🟡 可接受 |
| 并发写入同一用户 | 数据竞争 | SQLite 事务隔离 + WAL 模式 | ✅ 已有保障 |
| 迁移中途失败 | 数据库不一致 | 迁移简单（单条 ALTER），原子性由 SQLite 保证 | ✅ 低风险 |

---

## 九、后续扩展建议

1. **批量更新优化**：将多个 `SetUserAccessible` 合并为单条 SQL
   ```sql
   UPDATE users SET is_accessible=0 WHERE id IN (?,?,?...)
   ```

2. **状态时间戳**：记录最后更新时间，便于分析用户状态变化趋势

3. **不可访问原因分类**：如果 Twitter API 未来提供更详细的错误码，可扩展字段区分封禁/注销/其他

4. **统计功能**：添加命令行参数查看不可访问用户统计
   ```bash
   tmd --stats inaccessible-users
   ```
