# TMD API 使用文档

## 概述

TMD (Twitter Media Downloader) 提供 HTTP REST API，允许通过编程方式控制下载任务，支持 Web/API 调用。

## 启动 API Server

### 基本启动

```bash
# 使用默认端口 25556 启动
tmd -server

# 指定端口启动
tmd -server -port 8080
```

### 启动参数

| 参数        | 说明               | 默认值     |
| --------- | ---------------- | ------- |
| `-server` | 启用 API Server 模式 | -       |
| `-port`   | API Server 监听端口  | `25556` |

## 认证

### 概述

TMD 内置 Bearer Token 认证层。在 `conf.yaml` 中设置 `api_key` 即可开启，所有 HTTP API 请求需要携带 `Authorization: Bearer <key>` 头。`api_key` 为空时认证层完全跳过，行为零变化（向后兼容）。

### 配置方式

**方式一：conf.yaml**

```yaml
api_key: "your-secret-api-key"      # ← 直接写入配置文件
# 留空或不设置则不启用认证
```

修改后需重启 Server 生效（除非通过 Web UI 修改，见下文）。

**方式二：环境变量 `TMD_API_KEY`**

环境变量优先级高于 `conf.yaml`，同时设置时环境变量生效：

```bash
# Linux/Mac
export TMD_API_KEY="your-secret-api-key"
./tmd -server

# Windows (CMD)
set TMD_API_KEY=your-secret-api-key
tmd.exe -server
```

**方式三：Web UI 配置编辑**

进入系统设置 → 配置编辑：
- **简易模式**：在 `security` 分组的 `API Key` 字段中输入值（password 类型，显示为 `abc•••xyz`）
- **原始 YAML 模式**：直接写入 `api_key: "xxx"`

通过 Web UI 保存后 **立即生效**，无需重启。其他配置字段（如 `root_path`）仍需重启。

**方式四：Web UI 安全标签页**

系统设置 → **Security** 标签页可直接输入/保存/测试/清除 API Key。

| 功能 | 说明 |
|------|------|
| **保存到本地** | 将 Key 存入浏览器 localStorage |
| **保存到服务端** | 调用 API 将 Key 写入 `conf.yaml`，同时更新 localStorage。失败时自动回滚 localStorage |
| **测试连接** | 向 `/api/v1/tasks` 发送认证请求验证 Key 有效性 |
| **清除** | 先调 API 清空服务端配置，成功后才删除 localStorage 中的 Key |

💡 **前端存储机制**：登录成功后 JWT 存入浏览器 `localStorage`（键名 `tmd_jwt_token`），所有 API 请求自动从中读取并注入 `Authorization` 头。SSE 连接自动追加 `?token=` 参数。原始 API Key **不会**持久化到浏览器中——登录完成后即清除。

### 认证方式

所有 API 请求需要在 `Authorization` 头中携带 Bearer Token：

```http
Authorization: Bearer <your-token>
```

Token 可以是以下两种之一：

1. **JWT 会话令牌**（首选）：通过 `POST /api/v1/auth/login` 获取，1 小时有效，减少 API Key 暴露
2. **原始 API Key**（向后兼容）：直接在 `Authorization` 头中使用 `conf.yaml` 中配置的 `api_key`

**认证方式优先级：**

1. **`Authorization` HTTP 头**（首选）：用于所有常规 API 调用
2. **`?token=` 查询参数**（回退）：专为 SSE `EventSource` 设计（JS API 无法设置自定义头）

Web UI 在首次遇到 401 时会弹出认证对话框，输入 Key 后自动获取 JWT 并刷新页面。

### 字段编辑行为

配置编辑器的字段表单支持两个特殊 sentinel 值：

| 值 | 行为 |
|------|------|
| `__KEEP_OLD__` | 保留当前值不变（默认行为，前端不传值时使用） |
| `__CLEAR__` | 显式清空该字段（如清除 `api_key` 关闭认证） |

`api_key` 字段在配置表单中显示为脱敏的 `abc•••xyz` 格式。如果误将脱敏值提交，后端会返回错误提示，需留空以保留原值或输入真实值。

### 生效时机

| 修改方式 | 生效时机 | 说明 |
|---------|---------|------|
| Web UI 配置编辑（简易/YAML 模式） | **立即生效** | `handleSaveConfigFields` 同时更新内存和 `conf.yaml`；authMiddleware 运行时读取 |
| Web UI 安全标签页 | **立即生效** | 同上路径 |
| 直接编辑 `conf.yaml` | 需重启 | 程序不监听文件变化 |
| 环境变量 `TMD_API_KEY` | 需重启 | 只在启动时读取 |

### 公开路径（免认证）

以下端点**不需要认证**，用于 Web UI 加载、健康检查和主题切换：

| 端点 | 说明 |
|------|------|
| `GET /` 和 SPA 页面路由（`/tasks`、`/data`、`/schedules`、`/system`、`/logs`） | Web UI 页面 |
| `GET /favicon.ico` | 浏览器图标 |
| `GET /static/*` | 静态文件（JS/CSS） |
| `GET /api/v1/health` | 健康检查 |
| `GET /api/v1/download/context` | 下载页首屏聚合状态（未认证时只返回基础字段） |
| `GET /api/v1/config/theme` | 获取当前主题 |
| `POST /api/v1/config/theme` | 切换主题 |

> `GET /api/v1/config/themes` 同样免认证，但不是独立白名单项：白名单按前缀 `/api/v1/config/theme` 匹配，它被一并放行（`internal/api/middleware.go:91-96`）。
>
> 已注册的 Bot 回调路径（默认 `/api/v1/bot/feishu/callback`）同样免认证，见下文「22. Bot 回调（Feishu）」。

> **为什么 Web UI 页面需要公开？** SPA 的认证流程是：页面加载 → JS 执行 → 发现 API 返回 401 → 弹出认证对话框 → 用户输入 Key → localStorage 存储 → 后续请求携带 token。如果页面本身需要认证才能加载，用户将永远看不到登录界面。

### SSE 端点

`EventSource` API 无法设置自定义 HTTP 头，SSE 端点通过 `?token=` 查询参数认证：

```javascript
const token = localStorage.getItem('tmd_jwt_token');

new EventSource('/api/v1/sse/tasks?token=' + encodeURIComponent(token));
new EventSource('/api/v1/logs/stream?token=' + encodeURIComponent(token) + '&level=info');
```

SSE 端点**不在**公开路径白名单中——开启认证后必须携带有效 token。事件名、心跳、断线重连与断线重放规则见 [SSE 实时任务推送](#sse-实时任务推送)。

### 请求示例

```bash
# 正确认证
curl -H "Authorization: Bearer your-secret-key" http://localhost:25556/api/v1/tasks

# 无认证（返回 401）
curl http://localhost:25556/api/v1/tasks

# 错误 Token（返回 401）
curl -H "Authorization: Bearer wrong-key" http://localhost:25556/api/v1/tasks

# 缺少 Bearer 前缀（返回 401）
curl -H "Authorization: my-secret-key" http://localhost:25556/api/v1/tasks

# 公开路径（免认证）
curl http://localhost:25556/api/v1/health

# SSE 流（带 token）
curl -N "http://localhost:25556/api/v1/sse/tasks?token=your-secret-key"

# 日志流 SSE（带 token）
curl -N "http://localhost:25556/api/v1/logs/stream?token=your-secret-key"

# CORS 预检请求（免认证，由 CORS 中间件直接处理）
curl -X OPTIONS -H "Origin: http://example.com" \
  -H "Access-Control-Request-Method: GET" \
  http://localhost:25556/api/v1/tasks
```

### 安全建议

- **Key 强度**：后端强制至少 8 字符（`internal/config/config.go:242`），建议 ≥16 字符并使用随机字符串：`openssl rand -base64 32`
- **传输安全**：⚠️ 当前 API Key 和 JWT 通过 HTTP Header 明文传输，公网部署**必须使用 HTTPS**，否则可被中间人截获
- **推荐使用 JWT**：通过 `POST /api/v1/auth/login` 获取 1 小时有效的 JWT 会话令牌，减少 API Key 传输频率。JWT 过期后通过 `POST /api/v1/auth/refresh` 续期
- **Key 轮换**：定期更换 API Key。变更后旧 JWT 自动失效（签名密钥已变）
- **日志安全**：API Key 和 JWT **不会**出现在 TMD 请求日志中
- **已知限制**：仅支持 Bearer 方案，无多用户/角色/权限

***



## API 端点

> 🔓 = 公开端点（免认证） | 🔒 = 需要认证（当 `api_key` 配置后，需携带 `Authorization: Bearer <key>` 头）
>
> 以下各端点中，除非明确标注 🔓，均为 🔒 需要认证的端点。开启认证后所有 API 请求必须通过验证，详见[认证章节](#认证)。
>
> 💡 **提示**：以下 curl 示例默认不携带认证头（便于首次体验）。如果已开启认证，建议先获取 JWT 或直接使用 API Key，然后在每个请求中添加 `-H "Authorization: Bearer <token>"`。你也可以设置 shell 变量简化操作：
> ```bash
> # 方式一：使用 API Key
> AUTH="Authorization: Bearer your-secret-key"
> # 方式二：使用 JWT（推荐）
> JWT=$(curl -s -X POST -H "Authorization: Bearer your-secret-key" \
>   http://localhost:25556/api/v1/auth/login | jq -r '.data.token')
> AUTH="Authorization: Bearer $JWT"
> # 后续请求只需添加 -H "$AUTH"
> curl -H "$AUTH" http://localhost:25556/api/v1/tasks
> ```

### 1. 健康检查

检查 API Server 是否正常运行。

> 🔓 **公开端点**：即使开启了 API Key 认证，此端点也无需认证。

**请求：**

```http
GET /api/v1/health
```

**响应：**

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "version": "dev",
    "timestamp": "2024-01-15T10:30:00Z"
  }
}
```

> `version` 在 release 构建中由 ldflags 注入实际版本，开发和测试构建为 `dev`。

**示例：**

```bash
curl http://localhost:25556/api/v1/health
```

***

### 1.1 认证管理

获取和管理 JWT 会话令牌。

#### 获取 JWT 令牌

用 API Key 换取短期 JWT 会话令牌。

> 🔓 **公开端点**：即使开启了 API Key 认证，此端点也无需认证。通过 `Authorization: Bearer <key>` 头提供 API Key。

**请求：**

```http
POST /api/v1/auth/login
Authorization: Bearer <your-api-key>
```

**示例：**

```bash
curl -X POST http://localhost:25556/api/v1/auth/login \
  -H "Authorization: Bearer your-secret-key"
```

**响应：**

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "expires_at": "2026-06-25T12:00:00Z",
    "expires_in": 3600
  }
}
```

登录限制与错误：

- 未配置 `api_key` 时认证层未启用，`POST /api/v1/auth/login` 返回 `401 Unauthorized`（`{"success":false,"error":"unauthorized"}`）
- 同一 IP 每分钟最多 5 次失败尝试，超限返回 `429 Too Many Requests`（`too many requests`）

获取 JWT 后，后续请求使用 JWT 替代原始 API Key：

```bash
curl http://localhost:25556/api/v1/tasks \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

#### 刷新 JWT 令牌

在 JWT 过期前刷新，避免重新输入 API Key。

> 🔒 **需要认证**：需要携带有效的或已过期但签名正确的 JWT。authMiddleware 对 refresh/check 端点特殊处理——只要 JWT 签名有效（允许过期），就放行到 handler。
```http
POST /api/v1/auth/refresh
Authorization: Bearer <jwt-token>
```

**示例：**

```bash
curl -X POST http://localhost:25556/api/v1/auth/refresh \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

**响应格式：** 与 login 端点相同，返回新的 JWT。

**限制与错误：**

- 只接受签发时间在 24 小时内的 JWT；更早的 token 即使签名有效也返回 `401 Unauthorized`，并带 `X-Token-Type: too-old`
- 同一 IP 每分钟最多 5 次失败尝试，超限返回 `429 Too Many Requests`
- 认证失败响应带 `X-Token-Type` 头：`missing`（未提供 token）、`expired`（签名有效但已过期，普通端点）、`invalid`（签名/格式无效或 API Key 不匹配）

#### 检查 JWT 状态

查询当前 JWT 的有效性和过期时间。

> 🔒 **需要认证**：需要携带 JWT。与 refresh 相同——authMiddleware 放行签名正确（允许过期）的 JWT，handler 返回过期状态而非 401。

```http
GET /api/v1/auth/check
Authorization: Bearer <jwt-token>
```

**示例：**

```bash
curl http://localhost:25556/api/v1/auth/check \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

**响应：**

```json
{
  "success": true,
  "data": {
    "authenticated": true,
    "auth_enabled": true,
    "valid": true,
    "expires_at": "2026-06-25T12:00:00Z",
    "expires_in": 3590,
    "needs_refresh": false
  }
}
```

`needs_refresh` 为 `true` 表示剩余有效期不足 5 分钟，客户端应调用 refresh。未携带 token 时返回 `200`，`data` 只有 `authenticated:false` 与 `auth_enabled`。

***

### 2. 下载用户推文

下载指定用户的推文媒体。

**请求：**

```http
POST /api/v1/users/{screen_name}/download
Content-Type: application/json

{
  "auto_follow": false,
  "follow_members": false,
  "skip_profile": false,
  "no_retry": false
}
```

**URL 参数：**

| 字段            | 类型     | 必填 | 说明                          |
| ------------- | ------ | -- | --------------------------- |
| `screen_name` | string | 是  | 用户 Twitter 用户名（例如：elonmusk） |

**请求体参数：**

| 字段             | 类型   | 必填 | 默认值     | 说明                  |
| -------------- | ---- | -- | ------- | ------------------- |
| `auto_follow`  | bool | 否  | `false` | 自动关注受保护用户           |
| `follow_members` | bool | 否 | `false` | 下载时关注目标/成员         |
| `skip_profile` | bool | 否  | `false` | 跳过 Profile 下载（默认下载） |
| `no_retry`     | bool | 否  | `false` | 失败后不重试              |

**响应：**

```json
{
  "success": true,
  "data": {
    "task_id": "task_abc123",
    "status": "queued",
    "screen_name": "elonmusk",
    "auto_follow": false,
    "follow_members": false,
    "skip_profile": false,
    "no_retry": false,
    "message": "Download task queued successfully"
  }
}
```

**示例：**

```bash
# 基本下载（未开启认证时）
curl -X POST http://localhost:25556/api/v1/users/elonmusk/download

# 开启认证后需携带 Authorization 头
curl -X POST http://localhost:25556/api/v1/users/elonmusk/download \
  -H "Authorization: Bearer <your-token>"

# 跳过 Profile 下载
curl -X POST http://localhost:25556/api/v1/users/elonmusk/download \
  -H "Content-Type: application/json" \
  -d '{"skip_profile": true, "follow_members": false}'
```

> 以上请求若开启认证，需添加 `-H "Authorization: Bearer <key>"`，详见[认证章节](#认证)。

***

### 3. 下载用户 Profile

仅下载用户的 Profile 信息（头像、横幅、简介等）。

**请求：**

```http
POST /api/v1/users/{screen_name}/profile
```

**URL 参数：**

| 字段            | 类型     | 必填 | 说明                          |
| ------------- | ------ | -- | --------------------------- |
| `screen_name` | string | 是  | 用户 Twitter 用户名（例如：elonmusk） |

**响应：**

```json
{
  "success": true,
  "data": {
    "task_id": "task_def456",
    "status": "queued",
    "screen_name": "elonmusk",
    "message": "Profile download task queued"
  }
}
```

**示例：**

```bash
# 未开启认证时
curl -X POST http://localhost:25556/api/v1/users/elonmusk/profile

# 开启认证后
curl -X POST http://localhost:25556/api/v1/users/elonmusk/profile \
  -H "Authorization: Bearer <your-token>"
```

***

### 4. 标记用户为已下载

将用户标记为已下载状态，跳过历史推文。

**请求：**

```http
POST /api/v1/users/{screen_name}/mark
Content-Type: application/json

{
  "timestamp": "2024-01-15T10:30:00Z"
}
```

**URL 参数：**

| 字段            | 类型     | 必填 | 说明                          |
| ------------- | ------ | -- | --------------------------- |
| `screen_name` | string | 是  | 用户 Twitter 用户名（例如：elonmusk） |

**请求体参数：**

| 字段          | 类型     | 必填 | 默认值  | 说明                         |
| ----------- | ------ | -- | ---- | -------------------------- |
| `timestamp` | string | 否  | 当前时间 | 标记时间（ISO 8601格式），不传则使用当前时间 |

**响应：**

```json
{
  "success": true,
  "data": {
    "task_id": "task_ghi789",
    "status": "queued",
    "screen_name": "elonmusk",
    "timestamp": "2024-01-15T10:30:00Z",
    "message": "Mark downloaded task queued"
  }
}
```

**注意：** 如果请求中未提供 `timestamp`，响应中的 `timestamp` 字段将为 `null`，任务将使用当前时间执行。

**示例：**

```bash
# 标记为当前时间（未开启认证时）
curl -X POST http://localhost:25556/api/v1/users/elonmusk/mark

# 标记为当前时间（开启认证后）
curl -X POST http://localhost:25556/api/v1/users/elonmusk/mark \
  -H "Authorization: Bearer <your-token>"

# 指定时间标记（开启认证后）
curl -X POST http://localhost:25556/api/v1/users/elonmusk/mark \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{"timestamp": "2024-01-01T00:00:00Z"}'
```

***

### 4.1 标记关注列表为已下载

将某用户关注的所有用户标记为已下载状态。

**请求：**

```http
POST /api/v1/users/{screen_name}/following/mark
Content-Type: application/json

{
  "timestamp": "2024-01-15T10:30:00Z"
}
```

**URL 参数：**

| 字段            | 类型     | 必填 | 说明                          |
| ------------- | ------ | -- | --------------------------- |
| `screen_name` | string | 是  | 用户 Twitter 用户名（例如：elonmusk） |

**请求体参数：**

| 字段          | 类型     | 必填 | 默认值  | 说明                         |
| ----------- | ------ | -- | ---- | -------------------------- |
| `timestamp` | string | 否  | 当前时间 | 标记时间（ISO 8601格式），不传则使用当前时间 |

**响应：**

```json
{
  "success": true,
  "data": {
    "task_id": "task_ghi790",
    "status": "queued",
    "screen_name": "elonmusk",
    "timestamp": "2024-01-15T10:30:00Z",
    "message": "Mark following downloaded task queued"
  }
}
```

**示例：**

```bash
curl -X POST http://localhost:25556/api/v1/users/elonmusk/following/mark \
  -H "Content-Type: application/json" \
  -d '{"timestamp": "2024-01-01T00:00:00Z"}'
```

***

### 4.2 标记列表为已下载

将指定列表的所有成员标记为已下载状态。

**请求：**

```http
POST /api/v1/lists/{list_id}/mark
Content-Type: application/json

{
  "timestamp": "2024-01-15T10:30:00Z"
}
```

**URL 参数：**

| 字段        | 类型     | 必填 | 说明                          |
| --------- | ------ | -- | --------------------------- |
| `list_id` | uint64 | 是  | Twitter 列表 ID（例如：123456789） |

**请求体参数：**

| 字段          | 类型     | 必填 | 默认值  | 说明                         |
| ----------- | ------ | -- | ---- | -------------------------- |
| `timestamp` | string | 否  | 当前时间 | 标记时间（ISO 8601格式），不传则使用当前时间 |

**响应：**

```json
{
  "success": true,
  "data": {
    "task_id": "task_ghi791",
    "status": "queued",
    "list_id": "123456789",
    "timestamp": "2024-01-15T10:30:00Z",
    "message": "Mark list downloaded task queued"
  }
}
```

**示例：**

```bash
curl -X POST http://localhost:25556/api/v1/lists/123456789/mark \
  -H "Content-Type: application/json" \
  -d '{"timestamp": "2024-01-01T00:00:00Z"}'
```

***

### 5. 下载关注列表

下载某用户关注的所有用户的推文。

**请求：**

```http
POST /api/v1/users/{screen_name}/following/download
Content-Type: application/json

{
  "auto_follow": false,
  "follow_members": false,
  "skip_profile": false,
  "no_retry": false
}
```

**URL 参数：**

| 字段            | 类型     | 必填 | 说明                          |
| ------------- | ------ | -- | --------------------------- |
| `screen_name` | string | 是  | 用户 Twitter 用户名（例如：elonmusk） |

**请求体参数：**

| 字段             | 类型   | 必填 | 默认值     | 说明                       |
| -------------- | ---- | -- | ------- | ------------------------ |
| `auto_follow`  | bool | 否  | `false` | 自动关注受保护用户                |
| `follow_members` | bool | 否 | `false` | 下载时关注目标/成员             |
| `skip_profile` | bool | 否  | `false` | 跳过关注用户的 Profile 下载（默认下载） |
| `no_retry`     | bool | 否  | `false` | 失败后不重试                   |

**响应：**

```json
{
  "success": true,
  "data": {
    "task_id": "task_jkl012",
    "status": "queued",
    "screen_name": "elonmusk",
    "auto_follow": false,
    "follow_members": false,
    "skip_profile": false,
    "no_retry": false,
    "message": "Following download task queued successfully"
  }
}
```

**示例：**

```bash
curl -X POST http://localhost:25556/api/v1/users/elonmusk/following/download

# 跳过 Profile 下载
curl -X POST http://localhost:25556/api/v1/users/elonmusk/following/download \
  -H "Content-Type: application/json" \
  -d '{"skip_profile": true}'
```

***

### 6. 下载列表成员推文

批量下载 Twitter 列表中所有成员的推文。

**请求：**

```http
POST /api/v1/lists/{list_id}/download
Content-Type: application/json

{
  "auto_follow": false,
  "follow_members": false,
  "skip_profile": false,
  "no_retry": false
}
```

**URL 参数：**

| 字段        | 类型     | 必填 | 说明                          |
| --------- | ------ | -- | --------------------------- |
| `list_id` | uint64 | 是  | Twitter 列表 ID（例如：123456789） |

**请求体参数：**

| 字段             | 类型   | 必填 | 默认值     | 说明                       |
| -------------- | ---- | -- | ------- | ------------------------ |
| `auto_follow`  | bool | 否  | `false` | 自动关注受保护用户                |
| `follow_members` | bool | 否 | `false` | 下载时关注目标/成员             |
| `skip_profile` | bool | 否  | `false` | 跳过列表成员的 Profile 下载（默认下载） |
| `no_retry`     | bool | 否  | `false` | 失败后不重试                   |

**响应：**

```json
{
  "success": true,
  "data": {
    "task_id": "task_mno345",
    "status": "queued",
    "list_id": "123456789",
    "skip_profile": false,
    "auto_follow": false,
    "follow_members": false,
    "no_retry": false,
    "message": "List download task queued"
  }
}
```

**示例：**

```bash
curl -X POST http://localhost:25556/api/v1/lists/123456789/download \
  -H "Content-Type: application/json" \
  -d '{"auto_follow": true}'
```

***

### 7. 下载列表成员 Profile

仅下载 Twitter 列表中所有成员的 Profile。

**请求：**

```http
POST /api/v1/lists/{list_id}/profile
```

**URL 参数：**

| 字段        | 类型     | 必填 | 说明                          |
| --------- | ------ | -- | --------------------------- |
| `list_id` | uint64 | 是  | Twitter 列表 ID（例如：123456789） |

**响应：**

```json
{
  "success": true,
  "data": {
    "task_id": "task_pqr678",
    "status": "queued",
    "list_id": "123456789",
    "message": "List profile download task queued"
  }
}
```

**示例：**

```bash
curl -X POST http://localhost:25556/api/v1/lists/123456789/profile
```

***

### 8. 从 JSON 文件下载

从 JSON 文件（如其他工具导出的 Twitter 数据）下载媒体。

支持两种请求方式：

#### 方式一：multipart/form-data 上传（推荐）

适用于 Web UI 和远程调用，无需服务端文件路径。

**请求：**

```http
POST /api/v1/json/file/download
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary

------WebKitFormBoundary
Content-Disposition: form-data; name="files"; filename="tweets.json"
Content-Type: application/json

<文件内容>
------WebKitFormBoundary
Content-Disposition: form-data; name="files"; filename="followers.json"
Content-Type: application/json

<文件内容>
------WebKitFormBoundary
Content-Disposition: form-data; name="no_retry"

false
------WebKitFormBoundary--
```

**表单字段：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `files` | file | 是 | JSON 文件（支持多选，仅限 `.json` 扩展名） |
| `no_retry` | string | 否 | `"true"` 或 `"false"`，默认 `false` |

上传限制：单文件 ≤ 400 MiB（超过返回 `413` `Upload too large`）；只接受 `.json` 文件名；文件名不能为空且不能含 `/ \ < > : " | ? *`，否则返回 `400`；同名文件自动追加 `-2`、`-3` 等后缀。

**响应：**

```json
{
  "success": true,
  "data": {
    "task_id": "task_stu901",
    "status": "queued",
    "file_count": 2,
    "no_retry": false,
    "message": "JSON file upload task queued"
  }
}
```

**示例：**

```bash
curl -X POST http://localhost:25556/api/v1/json/file/download \
  -F "files=@/local/path/tweets.json" \
  -F "files=@/local/path/followers.json" \
  -F "no_retry=false"
```

**限制：**

- 单文件最大 400MB
- 请求总大小最大 1GB
- 仅支持 `.json` 扩展名

#### 方式二：JSON Body（兼容模式）

用于 CLI 和高级用法，需要服务端文件路径。

**请求：**

```http
POST /api/v1/json/file/download
Content-Type: application/json

{
  "paths": ["/path/to/tweets1.json", "/path/to/tweets2.json"],
  "no_retry": false
}
```

**请求体参数：**

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `paths` | []string | 是 | - | JSON 文件路径列表（服务端绝对路径） |
| `no_retry` | bool | 否 | `false` | 失败后不重试 |

**响应：**

```json
{
  "success": true,
  "data": {
    "task_id": "task_stu901",
    "status": "queued",
    "paths": ["/path/to/tweets1.json", "/path/to/tweets2.json"],
    "no_retry": false,
    "message": "JSON file download task queued"
  }
}
```

**示例：**

```bash
curl -X POST http://localhost:25556/api/v1/json/file/download \
  -H "Content-Type: application/json" \
  -d '{"paths": ["/data/tweets.json"]}'
```

***

### 8.1 从 JSON 文件夹下载

从 loongtweet 格式的文件夹下载推文媒体。

支持两种请求方式：

#### 方式一：multipart/form-data 上传（推荐）

直接上传 JSON 文件，无需 ZIP 打包或服务端路径。

**请求：**

```http
POST /api/v1/json/folder/download
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary

------WebKitFormBoundary
Content-Disposition: form-data; name="files"; filename="tweet-1.json"
Content-Type: application/json

<文件内容>
------WebKitFormBoundary
Content-Disposition: form-data; name="files"; filename="tweet-2.json"
Content-Type: application/json

<文件内容>
------WebKitFormBoundary
Content-Disposition: form-data; name="no_retry"

false
------WebKitFormBoundary--
```

**表单字段：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `files` | file | 是 | JSON 文件（支持多选，仅限 `.json` 扩展名） |
| `no_retry` | string | 否 | `"true"` 或 `"false"`，默认 `false` |

上传限制：单文件 ≤ 400 MiB（超过返回 `413` `Upload too large`）；只接受 `.json` 文件名；文件名不能为空且不能含 `/ \ < > : " | ? *`，否则返回 `400`；同名文件自动追加 `-2`、`-3` 等后缀。

**响应：**

```json
{
  "success": true,
  "data": {
    "task_id": "task_stu902",
    "status": "queued",
    "file_count": 2,
    "no_retry": false,
    "message": "LoongTweet upload task queued"
  }
}
```

**示例：**

```bash
curl -X POST http://localhost:25556/api/v1/json/folder/download \
  -F "files=@/local/path/tweet-1.json" \
  -F "files=@/local/path/tweet-2.json" \
  -F "no_retry=false"
```

**限制：**

- 单文件最大 400MB
- 请求总大小最大 1GB
- 仅支持 `.json` 扩展名

#### 方式二：JSON Body（兼容模式）

用于 CLI 和高级用法，需要服务端文件夹路径。

**请求：**

```http
POST /api/v1/json/folder/download
Content-Type: application/json

{
  "paths": ["/path/to/folder1", "/path/to/folder2"],
  "no_retry": false
}
```

**请求体参数：**

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `paths` | []string | 是 | - | 文件夹路径列表（服务端绝对路径） |
| `no_retry` | bool | 否 | `false` | 失败后不重试 |

**响应：**

```json
{
  "success": true,
  "data": {
    "task_id": "task_stu902",
    "status": "queued",
    "paths": ["/path/to/folder1", "/path/to/folder2"],
    "no_retry": false,
    "message": "JSON folder download task queued"
  }
}
```

**示例：**

```bash
curl -X POST http://localhost:25556/api/v1/json/folder/download \
  -H "Content-Type: application/json" \
  -d '{"paths": ["/data/loongtweet_folder"]}'
```

***

### 9. 批量下载

同时下载多个用户和列表。

**请求：**

```http
POST /api/v1/batch/download
Content-Type: application/json

{
  "users": ["elonmusk", "twitter", "github"],
  "lists": ["123456789", "987654321"],
  "following_names": ["userA", "userB"],
  "auto_follow": false,
  "follow_members": false,
  "skip_profile": false,
  "no_retry": false
}
```

**请求体参数：**

| 字段              | 类型        | 必填 | 默认值     | 说明                          |
| --------------- | --------- | -- | ------- | --------------------------- |
| `users`         | \[]string | 否  | -       | 要下载的用户名列表                   |
| `lists`         | \[]string | 否  | -       | 要下载的列表 ID 列表（uint64 十进制字符串） |
| `following_names` | \[]string | 否  | -       | 要下载其关注列表的用户名列表              |
| `auto_follow`   | bool      | 否  | `false` | 自动关注受保护用户                   |
| `follow_members` | bool     | 否  | `false` | 下载时关注目标/成员                |
| `skip_profile`  | bool      | 否  | `false` | 跳过 Profile 下载（默认下载）         |
| `no_retry`      | bool      | 否  | `false` | 失败后不重试                      |

**注意：** `users`、`lists` 和 `following_names` 至少需要一个。

**响应：**

```json
{
  "success": true,
  "data": {
    "task_id": "task_vwx234",
    "status": "queued",
    "users": ["elonmusk", "twitter", "github"],
    "lists": ["123456789", "987654321"],
    "following_names": ["userA", "userB"],
    "user_count": 3,
    "list_count": 2,
    "following_count": 2,
    "auto_follow": false,
    "follow_members": false,
    "skip_profile": false,
    "no_retry": false,
    "message": "Batch download task queued"
  }
}
```

**示例：**

```bash
curl -X POST http://localhost:25556/api/v1/batch/download \
  -H "Content-Type: application/json" \
  -d '{
    "users": ["elonmusk", "twitter"],
    "lists": ["123456789"]
  }'

# 跳过 Profile 下载
curl -X POST http://localhost:25556/api/v1/batch/download \
  -H "Content-Type: application/json" \
  -d '{
    "users": ["elonmusk", "twitter"],
    "lists": ["123456789"],
    "skip_profile": true
  }'
```

***

### 10. 获取任务列表

获取所有任务的当前状态。

**请求：**

```http
GET /api/v1/tasks
```

**响应：**

```json
{
  "success": true,
  "data": {
    "tasks": [
      {
        "task_id": "task_abc123",
        "entry_id": "sch_abc123",
        "type": "user_download",
        "status": "running",
        "data": { "screen_name": "elonmusk" },
        "progress": {
          "stage": "downloading",
          "total": 100,
          "completed": 45,
          "failed": 2,
          "current": "elonmusk"
        },
        "created_at": "2024-01-15T10:30:00Z",
        "started_at": "2024-01-15T10:30:05Z"
      }
    ]
  }
}
```

**任务状态：**

- `queued` - 排队中
- `running` - 运行中
- `completed` - 已完成
- `failed` - 失败
- `cancelled` - 已取消

**进度阶段 (`stage`)：**

- `syncing` - 同步中（获取用户/列表信息）
- `downloading` - 下载中
- `retrying` - 重试中
- `profile` - 下载 Profile 中
- `profile_warning` - Profile 下载有警告
- `marking` - 标记已下载中
- `completed` - 已完成

**任务类型 (`type`)：**

| 类型值 | 说明 |
|--------|------|
| `user_download` | 用户推文下载 |
| `list_download` | 列表成员下载 |
| `following_download` | 关注列表下载 |
| `profile_download` | Profile 下载 |
| `list_profile` | 列表成员 Profile 下载 |
| `mark_downloaded` | 标记已下载 |
| `json_file_download` | JSON 文件下载 |
| `json_folder_download` | JSON 文件夹下载 |
| `batch_download` | 批量下载 |
| `retry_all_failed` | 重试所有失败任务 |

任务对象还包含 `data` 字段，为创建任务时的入参快照（结构随任务类型变化；无入参时为 `null`），以及可选的 `result`、`error`、`ended_at`。

**示例：**

```bash
# 未开启认证时
curl http://localhost:25556/api/v1/tasks

# 开启认证后
curl -H "Authorization: Bearer <your-token>" http://localhost:25556/api/v1/tasks
```

***

### 10.1 查询任务（服务端过滤、搜索、排序与分页）

在服务端按状态、类型和关键词过滤任务，并排序分页。响应中的任务对象与 `GET /api/v1/tasks` 一致。

**请求：**

```http
GET /api/v1/tasks/query?status=failed,queued&type=user_download&q=alice&page=1&pageSize=20&sortBy=created_at&sortOrder=desc
```

**查询参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `status` | string | 空（全部） | 逗号分隔的状态：`queued`、`running`、`completed`、`failed`、`cancelled` |
| `type` | string | 空（全部） | 逗号分隔的任务类型，取值见上文「任务类型 (`type`)」 |
| `q` | string | 空 | 关键词，忽略大小写匹配 `task_id`、`error`、`result.message` 与 `data` 的 JSON 文本 |
| `page` | int | `1` | 页码；非法值或小于 1 时回退为 `1` |
| `pageSize` | int | `20` | 每页条数；非法值或小于 1 时回退为 `20`，超过上限时取 `200` |
| `sortBy` | string | `created_at` | `created_at`、`ended_at`、`started_at`、`status`、`type`；未知值回退为 `created_at` |
| `sortOrder` | string | `desc` | `asc` 或 `desc` |

**响应：**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "task_id": "task_abc123",
        "type": "user_download",
        "status": "failed",
        "data": { "screen_name": "alice" },
        "error": "rate limited",
        "created_at": "2024-01-15T10:30:00Z",
        "started_at": "2024-01-15T10:30:05Z",
        "ended_at": "2024-01-15T10:30:20Z"
      }
    ],
    "total": 42,
    "page": 1,
    "pageSize": 20,
    "totalPages": 3
  }
}
```

**错误响应：**

- 非法 `status`：`400`，`{"success": false, "error": "Invalid status filter"}`
- 非法 `type`：`400`，`{"success": false, "error": "Invalid type filter"}`
- 非法 `page`、`pageSize`、`sortBy`、`sortOrder` 不报错，按上表回退默认值

**示例：**

```bash
# 查询失败或排队中的用户下载任务，按创建时间倒序
curl "http://localhost:25556/api/v1/tasks/query?status=failed,queued&type=user_download&sortBy=created_at&sortOrder=desc"

# 关键词搜索，第二页，每页 50 条
curl "http://localhost:25556/api/v1/tasks/query?q=alice&page=2&pageSize=50"
```

***

### 11. 获取任务详情

获取单个任务的详细信息。

**请求：**

```http
GET /api/v1/tasks/{task_id}
```

**URL 参数：**

| 字段        | 类型     | 必填 | 说明                     |
| --------- | ------ | -- | ---------------------- |
| `task_id` | string | 是  | 任务 ID（例如：task\_abc123） |

**响应：**

```json
{
  "success": true,
  "data": {
    "task_id": "task_abc123",
    "type": "user_download",
    "status": "completed",
    "progress": {
      "stage": "completed",
      "total": 100,
      "completed": 100,
      "failed": 0,
      "current": ""
    },
    "result": {
      "main": {
        "downloaded": 95,
        "failed": 0
      },
      "profile": {
        "downloaded": 5,
        "failed": 0,
        "versioned": 1
      },
      "message": "",
      "failed_details": [
        "@alice: rate limited",
        "/data/imports/a.json: 3 failed"
      ]
    },
    "created_at": "2024-01-15T10:30:00Z",
    "started_at": "2024-01-15T10:30:05Z",
    "ended_at": "2024-01-15T10:35:00Z"
  }
}
```

**响应字段说明：**

- `result.failed_details` 为可选字段，最多 50 条。
  - Profile 下载失败记录用户与原因，形如 `@alice: rate limited`。
  - JSON 文件/文件夹下载按来源汇总，形如 `/path/a.json: 3 failed`。
  - 主下载（推文级）失败不写入该字段，请通过 `GET /api/v1/errors` 与日志（`GET /api/v1/logs`）查看。

**示例：**

```bash
curl http://localhost:25556/api/v1/tasks/task_abc123
```

***

### 12. 取消任务

取消正在运行或排队中的任务。

**请求：**

```http
POST /api/v1/tasks/{task_id}/cancel
```

**URL 参数：**

| 字段        | 类型     | 必填 | 说明                     |
| --------- | ------ | -- | ---------------------- |
| `task_id` | string | 是  | 任务 ID（例如：task\_abc123） |

**响应：**

```json
{
  "success": true,
  "data": {
    "message": "Task cancelled"
  }
}
```

**错误响应：**

```json
{
  "success": false,
  "error": "Task cannot be cancelled (not in queued or running status)"
}
```

**示例：**

```bash
curl -X POST http://localhost:25556/api/v1/tasks/task_abc123/cancel
```

***

### 13. 任务统计

获取按状态分类的任务计数。

**请求：**

```http
GET /api/v1/tasks/stats
```

**响应：**

```json
{
  "success": true,
  "data": {
    "queued": 2,
    "running": 1,
    "completed": 15,
    "failed": 1,
    "cancelled": 0,
    "total": 19
  }
}
```

**示例：**

```bash
curl http://localhost:25556/api/v1/tasks/stats
```

***

### 14. 取消所有排队任务

批量取消所有排队中（queued）的任务。

**请求：**

```http
POST /api/v1/tasks/cancel-queued
```

> **说明：** 无需请求体，直接取消所有排队中的任务。

**响应：**

```json
{
  "success": true,
  "data": {
    "cancelled_count": 3,
    "message": "3 queued task(s) cancelled"
  }
}
```

**示例：**

```bash
curl -X POST http://localhost:25556/api/v1/tasks/cancel-queued \
  -H "Content-Type: application/json" \
  -d '{}'
```

***

### 15. 重试任务

基于失败或取消的原始任务创建新的下载任务（克隆 taskData）。

**请求：**

```http
POST /api/v1/tasks/{task_id}/retry
```

**URL 参数：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `task_id` | string | 是 | 任务 ID（例如：task_abc123） |

**响应：**

```json
{
  "success": true,
  "data": {
    "message": "Task retried",
    "task_id": "task_new_xyz",
    "status": "queued",
    "original_id": "task_failed_123"
  }
}
```

**错误响应：**

- 任务不存在：`{"success": false, "error": "Task not found"}`
- 任务状态不可重试：`{"success": false, "error": "Task cannot be retried (not in failed or cancelled status)"}`

**示例：**

```bash
curl -X POST http://localhost:25556/api/v1/tasks/task_failed_123/retry
```

***

### 16. 删除任务

删除指定终端状态（completed/failed/cancelled）的任务。

**请求：**

```http
DELETE /api/v1/tasks/{task_id}
```

**URL 参数：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `task_id` | string | 是 | 任务 ID（例如：task_abc123） |

**响应：**

```json
{
  "success": true,
  "data": {
    "message": "Task deleted"
  }
}
```

**错误响应：**

- 任务不存在：`{"success": false, "error": "Task not found"}`
- 任务正在运行：`{"success": false, "error": "Task cannot be deleted (not in a terminal status)"}`

**示例：**

```bash
curl -X DELETE http://localhost:25556/api/v1/tasks/task_completed_123
```

***

### 16.1 批量取消 / 重试 / 删除任务

对最多 100 个任务执行同一操作，逐条返回结果。单个任务失败不会中断整批处理，HTTP 状态恒为 `200`。

**请求：**

```http
POST /api/v1/tasks/batch/cancel
POST /api/v1/tasks/batch/retry
POST /api/v1/tasks/batch/delete
Content-Type: application/json

{"task_ids": ["task_abc123", "task_def456"]}
```

**请求体参数：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `task_ids` | []string | 是 | 任务 ID 列表，最多 100 个 |

**响应：**

```json
{
  "success": true,
  "data": {
    "succeeded": 1,
    "failed": 1,
    "results": [
      {
        "task_id": "task_abc123",
        "ok": true,
        "new_task_id": "task_new_xyz"
      },
      {
        "task_id": "task_def456",
        "ok": false,
        "code": "not_found"
      }
    ]
  }
}
```

**响应字段：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `succeeded` | int | 成功的任务数 |
| `failed` | int | 失败的任务数 |
| `results` | array | 与请求 `task_ids` 顺序一致的逐条结果 |
| `results[].task_id` | string | 任务 ID |
| `results[].ok` | bool | 该任务是否操作成功 |
| `results[].code` | string | 失败码，仅在 `ok:false` 时返回 |
| `results[].new_task_id` | string | 新任务 ID，仅在 `retry` 成功时返回 |

**失败码：**

| 操作 | `code` | 含义 |
|------|---------|------|
| cancel | `not_found` | 任务不存在 |
| cancel | `not_cancellable` | 任务不在 `queued` 或 `running` 状态 |
| delete | `not_found` | 任务不存在 |
| delete | `not_deletable` | 任务不在终端状态（`completed` / `failed` / `cancelled`） |
| retry | `not_found` | 任务不存在 |
| retry | `not_retryable` | 任务不在 `failed` 或 `cancelled` 状态 |
| retry | `not_retryable_upload` | 上传型 JSON 文件/文件夹任务，无法重建 |
| retry | `invalid_task` | 无法根据任务数据重建执行函数 |
| retry | `queue_closed` | 下载队列已关闭 |
| retry | `enqueue_failed` | 新任务入队失败 |
| retry | `retry_failed` | 重试操作失败 |

**错误响应：**

- 缺少 `task_ids` 或为空数组：`400`，`{"success": false, "error": "task_ids is required"}`
- 超过 100 个：`400`，`{"success": false, "error": "Too many task_ids (max 100)"}`
- 请求体不是合法 JSON：`400`，`{"success": false, "error": "Invalid request body"}`

**示例：**

```bash
curl -X POST http://localhost:25556/api/v1/tasks/batch/cancel \
  -H "Content-Type: application/json" \
  -d '{"task_ids":["task_abc123","task_def456"]}'

curl -X POST http://localhost:25556/api/v1/tasks/batch/retry \
  -H "Content-Type: application/json" \
  -d '{"task_ids":["task_failed_123"]}'

curl -X POST http://localhost:25556/api/v1/tasks/batch/delete \
  -H "Content-Type: application/json" \
  -d '{"task_ids":["task_completed_123"]}'
```

***

### 17. 批量标记下载

同时标记多个用户、列表和关注列表为已下载状态。

**请求：**

```http
POST /api/v1/batch/mark
Content-Type: application/json

{
  "users": ["elonmusk", "twitter"],
  "lists": ["123456789"],
  "following_names": ["userA"],
  "timestamp": "2024-01-15T10:30:00Z"
}
```

**请求体参数：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `users` | []string | 否 | 要标记的用户名列表 |
| `lists` | []string | 否 | 要标记的列表 ID 列表（uint64 十进制字符串） |
| `following_names` | []string | 否 | 要标记其关注列表的用户名列表 |
| `timestamp` | string | 否 | 标记时间（ISO 8601格式），不传则使用当前时间 |

**注意：** `users`、`lists` 和 `following_names` 至少需要一个。

**响应：**

```json
{
  "success": true,
  "data": {
    "task_id": "task_vwx235",
    "status": "queued",
    "users": ["elonmusk", "twitter"],
    "lists": ["123456789"],
    "following_names": ["userA"],
    "message": "Batch mark downloaded task queued"
  }
}
```

**示例：**

```bash
curl -X POST http://localhost:25556/api/v1/batch/mark \
  -H "Content-Type: application/json" \
  -d '{"users": ["elonmusk", "twitter"]}'
```

***

### 18. 失败推文管理

管理下载过程中失败的推文记录，支持查看摘要、重试和清除。

#### 获取失败推文摘要

**请求：**

```http
GET /api/v1/errors
```

**响应：**

```json
{
  "success": true,
  "data": {
    "regular": {
      "1": 5,
      "2": 3
    },
    "json": [
      {
        "source_path": "/path/to/tweets.json",
        "type": "third_party",
        "count": 2
      }
    ]
  }
}
```

**响应字段：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `regular` | object | 常规下载错误，key 为 entity ID，value 为失败推文数 |
| `json` | array | JSON 导入错误，每个元素包含 source_path、type、count |

**示例：**

```bash
curl http://localhost:25556/api/v1/errors
```

#### 重试所有失败推文

重试所有历史失败推文（先重试常规下载错误，再重试 JSON 导入错误）。

**请求：**

```http
POST /api/v1/errors/retry
```

**响应：**

```json
{
  "success": true,
  "data": {
    "task_id": "task_retry_123",
    "status": "queued",
    "message": "Retry all failed tweets task queued"
  }
}
```

> **说明：** 该操作是异步的，返回 202 Accepted。任务完成后会通过 SSE 推送结果。

**示例：**

```bash
curl -X POST http://localhost:25556/api/v1/errors/retry
```

#### 清除失败推文记录

清除所有失败推文记录文件。

**请求：**

```http
DELETE /api/v1/errors
```

**响应：**

```json
{
  "success": true,
  "data": {
    "message": "All error records cleared"
  }
}
```

**示例：**

```bash
curl -X DELETE http://localhost:25556/api/v1/errors
```

***

### 19. 日志统计

按日志级别统计计数（debug/info/warn/error）。

**请求：**

```http
GET /api/v1/logs/stats
```

**响应：**

```json
{
  "success": true,
  "data": {
    "debug": 0,
    "info": 42,
    "warn": 3,
    "error": 1,
    "total": 46
  }
}
```

**示例：**

```bash
curl http://localhost:25556/api/v1/logs/stats
```

***

### 20. 日志导出

下载完整日志文件。

**请求：**

```http
GET /api/v1/logs/export
```

**响应：**

直接返回日志文件内容，`Content-Type: text/plain; charset=utf-8`，并带 `Content-Disposition: attachment; filename="tmd2-<时间戳>.log"`（时间戳格式 `20060102-150405`），浏览器会自动下载。

**示例：**

```bash
curl -o tmd.log http://localhost:25556/api/v1/logs/export
```

***

### 21. 用户历史名称查询（全局）

查询改过名的用户的历史名称记录，支持按名称筛选。只返回同一用户存在多条历史记录的情况（底层条件 `pn.user_id IN (SELECT user_id FROM user_previous_names GROUP BY user_id HAVING COUNT(*) > 1)`）。

**请求：**

```http
GET /api/v1/db/user-previous-names?q=elonmusk
```

**查询参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `page` | int | 1 | 页码 |
| `pageSize` | int | 20 | 每页数量 |
| `sortBy` | string | `id` | 排序字段 |
| `sortOrder` | string | `desc` | 排序方向 |
| `userId` | string | - | 按用户 ID 筛选 |
| `q` | string | - | 搜索关键词（匹配历史 `screen_name`、历史 `name`、当前 `screen_name`） |

**响应：**

```json
{
  "success": true,
  "data": {
    "data": [
      {
        "id": "1",
        "user_id": "44196397",
        "screen_name": "elonmusk_old",
        "name": "Elon Musk Old Name",
        "record_date": "2023-01-15",
        "current_screen_name": "elonmusk",
        "current_name": "Elon Musk"
      }
    ],
    "total": 1,
    "page": 1,
    "pageSize": 20,
    "totalPages": 1
  }
}
```

**说明：** 与 `/api/v1/db/users/{id}/previous-names` 不同，该端点支持全局搜索和按当前名称筛选，返回结果包含当前用户名和 screen name。

**示例：**

```bash
curl "http://localhost:25556/api/v1/db/user-previous-names?q=elonmusk"
```

***

### 22. Bot 回调（Feishu）

飞书（Feishu/Lark）Bot 的事件回调端点。其他 Bot（Telegram、Discord、Gotify、Pushover、WeChat）通过出站连接工作，不暴露 HTTP 端点。

| 项 | 值 |
|------|------|
| 方法/路径 | `POST /api/v1/bot/feishu/callback` |
| 路径覆盖 | `conf.yaml` → `feishu.callback_path` |
| 认证 | 不使用 TMD 的 Bearer Token；路径注册后按精确匹配免认证（`internal/api/middleware.go:148-151`） |
| 未启用 | 未配置 `feishu.app_id` 与 `feishu.app_secret` 时不注册该路径，请求按常规路由处理 |
| `503` | Bot 已注册但尚未启动完成，返回纯文本 `feishu bot not started` |

启用条件：`feishu.app_id` 与 `feishu.app_secret` 均非空（`main.go:439-443`）。

***

## 错误处理

### 错误响应格式

```json
{
  "success": false,
  "error": "错误描述信息"
}
```

### HTTP 状态码

| 状态码 | 说明          |
| --- | ----------- |
| 200 | 请求成功        |
| 201 | 资源已创建（如 `POST /api/v1/schedules`） |
| 202 | 任务已创建（异步操作） |
| 400 | 请求参数错误      |
| 401 | 未认证（需要有效的 Bearer Token，详见[认证章节](#认证)）|
| 404 | 资源不存在       |
| 405 | 方法不允许       |
| 409 | 状态冲突（任务状态不允许该操作、调度已禁用或正在触发） |
| 413 | 请求体或上传文件过大 |
| 429 | 请求过多（认证端点的登录/刷新/检查限流） |
| 500 | 服务器内部错误     |
| 503 | 服务不可用（数据库不可用、服务正在关闭、任务被拒绝、Bot 未启动）|

### 日志记录

API Server 记录所有请求的详细信息：

```
[api] GET /api/v1/tasks status=200 dur=2.3ms ip=127.0.0.1
```

日志包含：`[api]` 域前缀、HTTP 方法、请求路径、状态码、处理耗时（`dur`）、客户端 IP（`ip`）

### 响应写入错误处理

所有 JSON 响应的编码错误都会被记录到日志，便于排查客户端连接问题。

***

## 跨域支持 (CORS)

API 默认启用 CORS 支持，允许 Web 前端直接调用：

- **允许来源：** `*`（所有来源）
- **允许方法：** GET, POST, PUT, PATCH, DELETE, OPTIONS
- **允许头：** Content-Type, Authorization

> **与认证的交互**：OPTIONS 预检请求由 CORS 中间件在进入 `authMiddleware` 之前直接处理（返回 204），因此预检请求**不需要携带 Bearer Token**。

SSE 端点 (`/api/v1/sse/tasks`) 同样支持 CORS，确保 Web 界面可以跨域接收实时推送。SSE 连接如需认证，通过 `?token=` 查询参数传递。

***

## 安全特性

### Bearer Token 认证

TMD 内置 API Key 认证层，支持双模式：

- **开启方式**：在 `conf.yaml` 中设置 `api_key`，或通过环境变量 `TMD_API_KEY`
- **认证方式**：`Authorization: Bearer <token>` 请求头（首选），SSE 端点回退 `?token=` 查询参数
- **双模式**：支持 JWT 会话令牌（推荐，1 小时有效）和原始 API Key（向后兼容），authMiddleware 自动识别
- **向后兼容**：`api_key` 为空时认证层完全跳过

详见[认证章节](#认证)。

### 路径穿越防护

静态文件服务已实施路径穿越防护：

- 自动过滤 `..` 路径组件
- 禁止访问根目录之外的文件
- 仅允许访问嵌入的静态资源

### 配置脱敏

`/api/v1/config` 端点返回的配置信息已脱敏：

- `root_path` 返回配置中的完整路径
- 敏感信息（如 Cookie）不会返回

### 缓存控制

Web 界面响应包含适当的缓存头：

| 资源类型 | Cache-Control | 说明 |
|---------|---------------|------|
| HTML 页面 | `no-cache` + ETag | 协商缓存（304 Not Modified） |
| 静态资源 | `no-cache` + ETag | 协商缓存（304 Not Modified） |
| API 响应 | 无缓存 | 实时数据 |

***

## 任务管理

### 任务生命周期

1. **创建** → `queued`（排队中）
2. **开始执行** → `running`（运行中）
3. **完成** → `completed`（已完成）或 `failed`（失败）
4. **取消** → `cancelled`（已取消）

### 自动清理

- 任务保留时间：24 小时
- 清理频率：每小时

### SSE 实时更新

Web 界面使用 SSE 实现任务状态实时推送：任务状态变更时事件总线全量推送，心跳 25 秒，断线后固定 4 秒重连（已开启认证且无 token 时不重连）。服务端通过 `context.Done()` 感知客户端断开。事件名、帧格式、断线重放与认证方式见 [SSE 实时任务推送](#sse-实时任务推送)。

***

## Web 管理界面

Server 模式提供内置的 Web 管理界面，可通过浏览器访问。

### 访问方式

启动 Server 后，打开浏览器访问：

```
http://localhost:25556/
```

### 功能模块

| 模块 | 功能描述 |
|------|----------|
| **仪表盘** | 显示系统健康状态、任务统计、快速操作入口 |
| **新建任务** | 创建用户下载、列表下载、批量下载、JSON 下载任务 |
| **任务列表** | 实时显示所有任务状态（支持 SSE 实时更新）、进度条、取消操作 |
| **数据浏览** | 查看数据库中的 Users、Lists、User Entities、List Entities、User Links、User Previous Names（历史名称） |
| **配置编辑** | 双模式配置管理：结构化表单 + 原始 YAML 编辑器 |
| **Cookie 管理** | 管理额外账户 Cookie，支持结构化表单和原始 YAML 编辑 |
| **调度管理** | 创建、编辑、启用/禁用定时下载任务，支持手动触发 |
| **日志查看** | 实时日志查看器，支持级别筛选、搜索、分页、自动刷新 |

### 实时任务更新

Web 界面使用 Server-Sent Events (SSE) 技术实现任务状态实时推送，无需手动刷新页面即可看到任务进度更新。

***

## 新增 API 端点（Web 集成）

### SSE 实时任务推送

**请求：**

```http
GET /api/v1/sse/tasks
```

> 🔒 **SSE 认证**：此端点不在公开路径白名单中。当 API Key 认证开启时，需通过 `?token=` 查询参数传递 Key：
> ```
> GET /api/v1/sse/tasks?token=your-api-key
> ```
> 详见[认证章节的 SSE 端点说明](#sse-端点)。

**说明：**

- 建立 SSE 连接，任务状态变更时通过事件总线实时推送（全量推送，非增量）
- 心跳间隔 25 秒（服务端发送 SSE 注释帧维持连接）
- 支持跨域访问（CORS）
- 客户端断开时通过 `context.Done()` 自动感知，无资源泄漏

**响应格式：**

SSE 帧由 `id`、`event`、`data` 三部分组成，任务事件名为 `tasks`：

```
id: 1705312345123456789
event: tasks
data: [{"task_id":"task_xxx","status":"running",...}]
```

**事件类型：**

| 事件名 | 说明 |
|--------|------|
| `tasks` | 任务列表全量快照（创建、进度更新、状态变更时推送） |
| `schedules` | 调度配置变更 |
| `notification` | 通用通知 |
| `server_shutdown` | 服务端关闭 |

**断线重放：**

客户端重连时若带 `Last-Event-ID` 头（浏览器 `EventSource` 自动携带），服务端会重放该 ID 之后的事件；重放只覆盖 `notification` 与 `server_shutdown`，任务与调度事件以重连后的最新快照为准。

**示例：**

```javascript
const token = localStorage.getItem('tmd_jwt_token');
const url = token
    ? '/api/v1/sse/tasks?token=' + encodeURIComponent(token)
    : '/api/v1/sse/tasks';
const sse = new EventSource(url);
sse.addEventListener('tasks', (event) => {
    const tasks = JSON.parse(event.data);
    console.log('Tasks updated:', tasks);
});
```

断线后前端固定 4 秒重连（已开启认证且无 token 时不重连）。

***

### 数据库查询端点

用户、列表、用户实体、列表实体、用户链接、历史名称的分页查询与增删改，统一见 [数据库管理 API 详解](#数据库管理-api-详解)，此处不再重复示例。

***

### 获取系统配置

**请求：**

```http
GET /api/v1/config
```

**响应：**

```json
{
  "success": true,
  "data": {
    "root_path": "twitter_downloads",
    "max_download_routine": 50,
    "max_user_fetch_concurrent": 3,
    "max_file_name_len": 158
  }
}
```

**说明：**

- 返回脱敏后的配置信息（不包含敏感 Cookie 和代理地址）
- `root_path` 返回配置中的完整路径
- 未显式设置时返回有效默认值（不是 `0`）：`max_download_routine` 为 `min(50, CPU 核数 × 10)`、`max_user_fetch_concurrent` 为 `3`、`max_file_name_len` 为 `158`（`internal/config/config.go:30-39`、`internal/utils/fs.go:39`），示例值随机器核数变化
- 完整配置请使用 `/api/v1/config/fields` 或 `/api/v1/config/raw`

***

### 获取当前主题

获取当前前端 UI 主题名称。

**请求：**

```http
GET /api/v1/config/theme
```

**响应：**

```json
{
  "success": true,
  "data": {
    "theme": "download"
  }
}
```

**示例：**

```bash
curl http://localhost:25556/api/v1/config/theme
```

***

### 切换主题

切换到指定的前端 UI 主题。

**请求：**

```http
POST /api/v1/config/theme
Content-Type: application/json

{
  "theme": "download"
}
```

**请求体参数：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `theme` | string | 是 | 主题名称，来自可用主题列表（当前为 `download`） |

**响应（成功）：**

```json
{
  "success": true,
  "data": {
    "theme": "download"
  }
}
```

**响应（无效主题）：**

```json
{
  "success": false,
  "error": "Invalid theme: directory not found or missing index.html"
}
```

**说明：**

- 主题对应 `web/{theme}/index.html` 目录，由 embed FS 提供
- 无效主题名返回 400 Bad Request
- 切换后会立即生效，无需重启服务器

**示例：**

```bash
curl -X POST http://localhost:25556/api/v1/config/theme \
  -H "Content-Type: application/json" \
  -d '{"theme": "download"}'
```

***

### 获取可用主题列表

列出所有可用的前端 UI 主题及其当前选中的主题。

**请求：**

```http
GET /api/v1/config/themes
```

**响应：**

```json
{
  "success": true,
  "data": {
    "themes": ["download"],
    "current": "download"
  }
}
```

**字段说明：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `themes` | string[] | 所有可用主题名称列表 |
| `current` | string | 当前生效的主题名称 |

**示例：**

```bash
curl http://localhost:25556/api/v1/config/themes
```

***

### 获取原始配置文件内容

获取 conf.yaml 文件的原始 YAML 内容。

**请求：**

```http
GET /api/v1/config/raw
```

**响应：**

```json
{
  "success": true,
  "data": {
    "content": "root_path: ./downloads\ncookie:\n  auth_token: xxx\n  ct0: yyy\n...",
    "path": "/path/to/conf.yaml",
    "exists": true
  }
}
```

**响应字段：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `content` | string | 配置文件原始内容（YAML 格式） |
| `path` | string | 配置文件完整路径 |
| `exists` | bool | 配置文件是否存在 |

**示例：**

```bash
curl http://localhost:25556/api/v1/config/raw
```

***

### 更新原始配置文件

通过上传 YAML 内容更新配置文件。

**请求：**

```http
PUT /api/v1/config/raw
Content-Type: application/json

{
  "content": "root_path: ./downloads\ncookie:\n  auth_token: new_token\n..."
}
```

**请求体参数：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `content` | string | 是 | 完整的 YAML 配置内容 |

**响应：**

```json
{
  "success": true,
  "data": {
    "message": "Configuration saved successfully. Please restart TMD manually for changes to take effect.",
    "backup": "backups/conf.yaml.backup.1705312345123456789",
    "yaml_preview": "root_path: ./downloads\nmax_download_routine: 35\nmax_user_fetch_concurrent: 3"
  }
}
```

> 如果配置中检测到 `api_key` 字段变更，消息会变为 `"Configuration saved. API Key has been updated and takes effect immediately. Other changes may require a restart."`——即 `api_key` 通过此方式保存后**立即生效**，无需重启。其他字段（如 `root_path`）仍需重启。

**特性：**
- 自动验证 YAML 格式有效性
- 保存前自动创建备份（时间戳命名）
- 大部分配置更新后需手动重启 TMD 才能生效；`api_key` 例外，保存后立即生效

**示例：**

```bash
curl -X PUT http://localhost:25556/api/v1/config/raw \
  -H "Content-Type: application/json" \
  -d '{"content": "root_path: ./downloads\nmax_download_routine: 35\nmax_user_fetch_concurrent: 3"}'
```

***

### 获取结构化配置字段列表

获取可用于表单编辑的配置字段定义和当前值。

**请求：**

```http
GET /api/v1/config/fields
```

**响应：**

```json
{
  "success": true,
  "data": {
    "exists": true,
    "fields": [
      {
        "name": "root_path",
        "label": "Storage Path",
        "prompt": "enter storage dir",
        "value": "./downloads",
        "default": "",
        "type": "text",
        "placeholder": "",
        "required": true,
        "group": "basic"
      },
      {
        "name": "auth_token",
        "label": "Auth Token",
        "prompt": "enter auth_token",
        "value": "a1b•••xyz",
        "default": "",
        "type": "password",
        "placeholder": "",
        "required": true,
        "group": "cookie"
      },
      {
        "name": "ct0",
        "label": "CT0",
        "prompt": "enter ct0",
        "value": "x1y•••789",
        "default": "",
        "type": "password",
        "placeholder": "",
        "required": true,
        "group": "cookie"
      },
      {
        "name": "max_download_routine",
        "label": "Max Concurrent Downloads",
        "prompt": "enter max download routine",
        "value": "35",
        "default": "min(50, GOMAXPROCS*10)",
        "type": "number",
        "placeholder": "1-100, default min(50, GOMAXPROCS*10)",
        "required": false,
        "group": "advanced"
      },
      {
        "name": "max_user_fetch_concurrent",
        "label": "Max User Fetch Concurrent",
        "prompt": "enter max user media fetch concurrent",
        "value": "3",
        "default": "3",
        "type": "number",
        "placeholder": "1-35, default 3",
        "required": false,
        "group": "advanced"
      },
      {
        "name": "max_file_name_len",
        "label": "Max File Name Length",
        "prompt": "enter max file name length (50-245)",
        "value": "158",
        "default": "158",
        "type": "number",
        "placeholder": "50-245, default 158",
        "required": false,
        "group": "advanced"
      },
      {
        "name": "proxy_url",
        "label": "Proxy URL",
        "prompt": "enter proxy url (e.g., http://127.0.0.1:7897, leave empty for system proxy)",
        "value": "",
        "default": "",
        "type": "text",
        "placeholder": "http://127.0.0.1:7897 or leave empty",
        "required": false,
        "group": "advanced"
      },
      {
        "name": "api_key",
        "label": "API Key",
        "prompt": "enter API key for HTTP auth (leave empty to disable)",
        "value": "abc•••xyz",
        "default": "",
        "type": "password",
        "placeholder": "Leave empty to disable HTTP auth",
        "required": false,
        "group": "security"
      }
    ]
  }
}
```

**响应字段说明：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `fields[]` | array | 配置字段数组 |
| `fields[].name` | string | 字段名（用于提交） |
| `fields[].label` | string | 显示标签 |
| `fields[].type` | string | 输入类型（text/number/password） |
| `fields[].group` | string | 分组（basic/cookie/advanced/security） |
| `fields[].value` | string | 当前值（密码类型已脱敏） |
| `fields[].required` | bool | 是否必填 |

**分组说明：**
- **basic**: 基础设置（存储路径）
- **cookie**: Cookie 认证（auth_token, ct0）
- **advanced**: 高级选项（并发数、文件名长度、代理）
- **security**: 安全认证（API Key）

**示例：**

```bash
curl http://localhost:25556/api/v1/config/fields
```

***

### 保存结构化配置字段

通过键值对方式更新配置字段。

**请求：**

```http
PUT /api/v1/config/fields
Content-Type: application/json

{
  "fields": {
    "root_path": "./downloads",
    "auth_token": "__KEEP_OLD__",
    "ct0": "__KEEP_OLD__",
    "max_download_routine": "35",
    "max_user_fetch_concurrent": "3",
    "max_file_name_len": "158",
    "proxy_url": "",
    "api_key": "__KEEP_OLD__"
  }
}
```

**请求体参数：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `fields` | object | 是 | 键值对，key 为字段名，value 为新值 |

**特殊值：**
- `__KEEP_OLD__`: 保持原值不变（用于密码字段）
- `__CLEAR__`: 显式清空该字段（例如清空 `api_key` 以关闭认证）

> 💡 `api_key` 通过此接口保存后，如果值发生变更（或使用 `__CLEAR__` 清空），将**立即生效**，无需重启服务。详见[认证章节 - 生效时机](#生效时机)。

**响应：**

```json
{
  "success": true,
  "data": {
    "message": "Configuration saved successfully. Please restart TMD manually for changes to take effect.",
    "backup": "backups/conf.yaml.backup.1705312345123456789",
    "yaml_preview": "root_path: ./downloads\n...",
    "fields": [...]
  }
}
```

**响应字段：**
- `yaml_preview`: 保存后的完整 YAML 内容预览
- `fields`: 更新后的字段列表（可直接用于刷新前端）

**示例：**

```bash
# 只修改并发数，其他保持不变
curl -X PUT http://localhost:25556/api/v1/config/fields \
  -H "Content-Type: application/json" \
  -d '{
    "fields": {
      "auth_token": "__KEEP_OLD__",
      "ct0": "__KEEP_OLD__",
      "max_download_routine": "40",
      "max_user_fetch_concurrent": "5"
    }
  }'
```

***

### 获取系统日志

查询系统日志，支持按级别、域、时间范围筛选、搜索和分页。

**请求：**

```http
GET /api/v1/logs?level=info&page=1&pageSize=100&q=download
```

**查询参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `level` | string | `""`(全部) | 日志级别筛选：debug/info/warn/error |
| `domain` | string | `""`(全部) | 日志域筛选（如 api、task、downloader、rate-limit） |
| `start_time` | string | - | 起始时间过滤（RFC3339，如 `2024-01-15T10:00:00+08:00`） |
| `end_time` | string | - | 结束时间过滤（RFC3339，如 `2024-01-15T11:00:00+08:00`） |
| `page` | int | `1` | 页码 |
| `pageSize` | int | `100` | 每页数量（最大 200） |
| `q` | string | - | 搜索关键词 |

**响应：**

```json
{
  "success": true,
  "data": {
    "logs": [
      "INFO[2024-01-15T10:30:00+08:00] [task] Created task_id=task_abc123 type=user_download target=elonmusk status=queued",
      "INFO[2024-01-15T10:29:58+08:00] [theme] Switched theme=download"
    ],
    "total": 150,
    "page": 1,
    "pageSize": 100,
    "totalPages": 2
  }
}
```

**日志级别说明：**

| 级别 | 说明 |
|------|------|
| `debug` | 调试信息（需启用 `-dbg` 模式） |
| `info` | 一般信息 |
| `warn` | 警告信息 |
| `error` | 错误信息 |

**示例：**

```bash
# 获取所有日志（默认前 100 条）
curl http://localhost:25556/api/v1/logs

# 只看错误日志
curl "http://localhost:25556/api/v1/logs?level=error"

# 搜索包含 download 的日志
curl "http://localhost:25556/api/v1/logs?q=download"

# 分页查看第 2 页
curl "http://localhost:25556/api/v1/logs?page=2&pageSize=50"
```

***

### 日志实时流

通过 SSE 实时推送日志，支持按级别、域和关键词筛选。

**请求：**

```http
GET /api/v1/logs/stream?level=info&q=download
```

**查询参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `level` | string | `""`(全部) | 日志级别筛选：debug/info/warn/error |
| `domain` | string | `""`(全部) | 日志域筛选（如 api、task、downloader、rate-limit） |
| `q` | string | - | 搜索关键词 |

**响应格式：**

SSE 事件流，每条日志为一行 `data:` 事件：

```
: connected

data: INFO[2024-01-15T10:30:00+08:00] [task] Created task_id=task_abc123 type=user_download target=elonmusk status=queued
```

**示例：**

```javascript
const token = localStorage.getItem('tmd_jwt_token');
const baseURL = '/api/v1/logs/stream?level=error';
const url = token ? baseURL + '&token=' + encodeURIComponent(token) : baseURL;
const logStream = new EventSource(url);
logStream.addEventListener('log', (event) => {
    console.log('Log:', event.data);
});
```

***

### Cookie 管理 API

管理额外账户的 Cookie（用于多账户下载）。

#### 获取额外 Cookie（结构化表单）

**请求：**

```http
GET /api/v1/cookies
```

**响应：**

```json
{
  "success": true,
  "data": {
    "exists": true,
    "items": [
      {
        "index": 0,
        "auth_token": "a1b•••xyz",
        "ct0": "x1y•••789"
      }
    ]
  }
}
```

**响应字段：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `exists` | bool | additional_cookies.yaml 文件是否存在 |
| `items[]` | array | Cookie 列表（密码字段已脱敏） |
| `items[].index` | int | 账户索引 |
| `items[].auth_token` | string | Auth Token（脱敏显示） |
| `items[].ct0` | string | CT0（脱敏显示） |

#### 保存额外 Cookie（结构化表单）

**请求：**

```http
PUT /api/v1/cookies
Content-Type: application/json

{
  "cookies": [
    {
      "auth_token": "new_token_value",
      "ct0": "new_ct0_value"
    },
    {
      "auth_token": "__KEEP_OLD__",
      "ct0": "__KEEP_OLD__"
    }
  ]
}
```

**请求体参数：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `cookies` | []map | 是 | Cookie 列表，每个元素包含 `auth_token` 和 `ct0` |

**字段值规则：**

| 值 | 行为 |
|------|------|
| `__KEEP_OLD__` | 保留当前值不变 |
| `__CLEAR__` | 显式清空该字段 |

> 💡 `__CLEAR__` 同样适用于配置字段中的 `api_key`，详见[认证章节 - 字段编辑行为](#字段编辑行为)。

**响应：**

```json
{
  "success": true,
  "data": {
    "message": "Additional cookies saved successfully. Please restart TMD manually for changes to take effect.",
    "backup": "backups/additional_cookies.yaml.backup.1705312345123456789"
  }
}
```

**注意：** 保存后需手动重启 TMD 才能生效。

#### 获取原始 Cookie 文件内容

**请求：**

```http
GET /api/v1/cookies/raw
```

**响应：**

```json
{
  "success": true,
  "data": {
    "content": "- auth_token: xxx\n  ct0: yyy\n...",
    "path": "/path/to/additional_cookies.yaml",
    "exists": true
  }
}
```

#### 更新原始 Cookie 文件

**请求：**

```http
PUT /api/v1/cookies/raw
Content-Type: application/json

{
  "content": "- auth_token: new_token\n  ct0: new_ct0\n..."
}
```

**请求体参数：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `content` | string | 是 | 完整的 YAML Cookie 内容 |

**响应：**

```json
{
  "success": true,
  "data": {
    "message": "Additional cookies saved successfully. Please restart TMD manually for changes to take effect.",
    "backup": "backups/additional_cookies.yaml.backup.1705312345123456789"
  }
}
```

**注意：** 保存后需手动重启 TMD 才能生效。

***

### 服务器管理 API

#### 获取下载页聚合状态

聚合下载页首屏所需的版本、认证开关、Cookie 配置、队列、并发上限与任务统计，避免前端串联多个请求。

> 🔓 **公开端点**：即使开启 API Key 认证也无需预先认证。未认证时只返回基础字段；`api_key` 为空时 `authenticated` 恒为 `true`。认证开启后，可通过 `Authorization: Bearer <token>` 或 `?token=<token>`（与 SSE 一致）携带 API Key/JWT。

**请求：**

```http
GET /api/v1/download/context
```

**响应（未认证）：**

```json
{
  "success": true,
  "data": {
    "version": "dev",
    "auth_enabled": true,
    "authenticated": false,
    "api_key_configured": true,
    "cookie_configured": true,
    "additional_cookie_accounts": 0,
    "server_shutting_down": false
  }
}
```

**响应（认证后）：**

```json
{
  "success": true,
  "data": {
    "version": "dev",
    "auth_enabled": true,
    "authenticated": true,
    "api_key_configured": true,
    "cookie_configured": true,
    "additional_cookie_accounts": 2,
    "server_shutting_down": false,
    "queue": {
      "queue_depth": 5,
      "active_jobs": 2,
      "pending_jobs": 3,
      "detached_jobs": 0
    },
    "max_download_routine": 50,
    "max_user_fetch_concurrent": 3,
    "max_file_name_len": 158,
    "db_ready": true,
    "task_stats": {
      "queued": 2,
      "running": 1,
      "completed": 15,
      "failed": 1,
      "cancelled": 0,
      "total": 19
    }
  }
}
```

**响应字段：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `version` | string | 服务端版本，开发/测试构建为 `dev` |
| `auth_enabled` | bool | 是否配置了 API Key（认证是否开启） |
| `authenticated` | bool | 当前请求是否已通过认证；未配置 API Key 时为 `true` |
| `api_key_configured` | bool | 是否配置了 API Key |
| `cookie_configured` | bool | 主账号 Cookie（`auth_token`）是否已配置 |
| `additional_cookie_accounts` | int | 额外 Cookie 账号数 |
| `server_shutting_down` | bool | 服务端是否正在关闭 |
| `queue` | object | 下载队列状态，字段同 `GET /api/v1/queue/status`；队列未初始化时省略 |
| `max_download_routine` | int | 生效的下载并发数（配置为 0 时为默认值） |
| `max_user_fetch_concurrent` | int | 生效的用户信息抓取并发数（配置为 0 时为默认值） |
| `max_file_name_len` | int | 生效的文件名最大长度（配置为 0 时为默认值） |
| `db_ready` | bool | 数据库是否可用 |
| `task_stats` | object | 任务统计，字段同 `GET /api/v1/tasks/stats` |

未认证时 `queue`、`max_download_routine`、`max_user_fetch_concurrent`、`max_file_name_len`、`db_ready`、`task_stats` 不返回。`queue`、`db_ready`、`task_stats` 使用 `omitempty`：队列未初始化、数据库不可用或任务管理器缺失时字段省略。

**示例：**

```bash
# 未认证（获取认证开关等基础字段）
curl http://localhost:25556/api/v1/download/context

# 认证后（携带 JWT 或 API Key）
curl -H "Authorization: Bearer <your-token>" http://localhost:25556/api/v1/download/context

# 查询参数方式（与 SSE 一致）
curl "http://localhost:25556/api/v1/download/context?token=<your-token>"
```

***

#### 关闭服务器

优雅关闭 API Server，取消所有运行中的任务。

**请求：**

```http
POST /api/v1/server/shutdown
```

**响应：**

```json
{
  "success": true,
  "data": {
    "message": "Server shutting down...",
    "action": "shutdown"
  }
}
```

**说明：**

- 响应写入后立即进入优雅关闭，不额外等待固定延迟
- 新的写请求返回 503，所有运行中的任务立即收到取消信号
- 已准入请求、下载队列、调度器、Bot 和 HTTP Server 并行收敛，共享一个 45 秒总截止时间
- 任务 SSE 在写出 `server_shutdown` 后主动断开
- 数据库连接将被关闭

***

### 调度器管理 API

管理定时下载任务调度。调度配置写入接口会在保存成功后自动重载配置；如果保存后的配置中存在启用中的规则且调度器未运行，会自动启动调度器。

#### 获取所有调度

**请求：**

```http
GET /api/v1/schedules
```

**响应：**

```json
{
  "success": true,
  "data": {
    "scheduler_running": true,
    "exists": true,
    "entries": [
      {
        "entry": {
          "id": "sch_abc123",
          "type": "user",
          "target": "elonmusk",
          "name": "每日下载 Elon",
          "schedule": "daily:08:00",
          "enabled": true,
          "run_on_start": false,
          "auto_follow": false,
          "follow_members": false,
          "skip_profile": false,
          "no_retry": false
        },
        "schedule_display": "每天 08:00",
        "last_run_at": "2024-01-15T08:00:00Z",
        "next_run_at": "2024-01-16T08:00:00Z",
        "run_count": 15,
        "last_task_id": "task_xxx",
        "last_error": "",
        "consecutive_failures": 0,
        "triggering": false
      }
    ],
    "active": 1,
    "total": 1
  }
}
```

**响应字段：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `scheduler_running` | bool | 调度器是否正在运行 |
| `exists` | bool | 调度配置文件是否存在 |
| `entries` | array | 调度条目列表 |
| `active` | int | 启用中的调度数量 |
| `total` | int | 调度总数 |

`scheduler_running` 表示调度器循环是否已启动。创建、更新、启用或重载调度后，如果存在启用中的规则，服务端会自动启动调度器。

**调度条目字段 (`entry`)：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 调度 ID |
| `type` | string | 调度类型：`user`、`list`、`following`、`mixed` |
| `target` | string | 调度目标（用户名或列表 ID）；`mixed` 类型下为空 |
| `users` | string[] | `mixed` 类型的用户名列表 |
| `lists` | string[] | `mixed` 类型的列表 ID 列表 |
| `following_names` | string[] | `mixed` 类型的 following 用户名列表 |
| `name` | string | 调度名称 |
| `schedule` | string | 调度表达式（如 `daily:08:00`、`interval:6h`） |
| `enabled` | bool | 是否启用 |
| `run_on_start` | bool | 系统首次启动时是否立即执行 |
| `auto_follow` | bool | 自动关注受保护用户 |
| `follow_members` | bool | 下载时关注目标/成员                |
| `skip_profile` | bool | 跳过 Profile 下载 |
| `no_retry` | bool | 失败后不重试 |

**调度状态字段 (`entries[]`)：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `entry` | object | 调度条目配置 |
| `schedule_display` | string | 可读调度规则 |
| `last_run_at` | string | 上次触发时间，ISO 8601 格式 |
| `next_run_at` | string | 下次预计触发时间，ISO 8601 格式 |
| `run_count` | int | 累计触发次数 |
| `last_task_id` | string | 上次触发创建的任务 ID |
| `last_error` | string | 上次触发错误 |
| `consecutive_failures` | int | 连续触发失败次数 |
| `triggering` | bool | 是否正在触发该调度规则；仅表示 scheduler 正在创建任务，不代表后台下载任务仍在运行 |

#### 创建调度

**请求：**

```http
POST /api/v1/schedules
Content-Type: application/json

{
  "type": "user",
  "target": "elonmusk",
  "name": "每日下载 Elon",
  "schedule": "daily:08:00",
  "enabled": true,
  "run_on_start": false,
  "auto_follow": false,
  "follow_members": false,
  "skip_profile": false,
  "no_retry": false
}
```

**请求体参数：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | string | 是 | 调度类型：`user`、`list`、`following`、`mixed` |
| `target` | string | 否 | 调度目标；`mixed` 类型不使用该字段 |
| `users` | string[] | 否 | `mixed` 类型的用户名列表 |
| `lists` | string[] | 否 | `mixed` 类型的列表 ID 列表 |
| `following_names` | string[] | 否 | `mixed` 类型的 following 用户名列表 |
| `name` | string | 否 | 调度名称 |
| `schedule` | string | 是 | 调度表达式 |
| `enabled` | bool | 否 | 是否启用（默认 false） |
| `run_on_start` | bool | 否 | 系统首次启动时执行（默认 false） |
| `auto_follow` | bool | 否 | 自动关注（默认 false） |
| `follow_members` | bool | 否 | 下载时关注目标/成员（默认 false） |
| `skip_profile` | bool | 否 | 跳过 Profile（默认 false） |
| `no_retry` | bool | 否 | 不重试（默认 false） |
| `id` | string | 否 | 自定义 ID（不提供则自动生成） |

`mixed` 类型示例：

```json
{
  "type": "mixed",
  "name": "批量下载",
  "schedule": "interval:8h",
  "enabled": true,
  "users": ["elonmusk", "openai"],
  "lists": ["123456789"],
  "following_names": ["someuser"],
  "auto_follow": true
}
```

**响应：**

```json
{
  "success": true,
  "data": {
    "message": "Schedule created successfully.",
    "backup": "backups/schedules.yaml.backup.1705312345123456789",
    "entry": { ... }
  }
}
```

成功返回 `201 Created`。若配置已写入磁盘但重载失败，返回 `200`，`message` 为 `Schedule saved, but reload failed: <原因>`。

#### 更新调度

**批量替换全部调度（表单模式推荐）：**

```http
PUT /api/v1/schedules
Content-Type: application/json

{
  "entries": [
    {
      "type": "user",
      "target": "elonmusk",
      "name": "每日下载 Elon",
      "schedule": "daily:08:00",
      "enabled": true
    },
    {
      "type": "mixed",
      "name": "批量下载",
      "schedule": "interval:8h",
      "enabled": true,
      "users": ["openai"],
      "lists": ["123456789"],
      "following_names": ["someuser"]
    }
  ]
}
```

该接口会用 `entries` 一次性替换整个 `schedules.yaml` 中的调度列表，并返回规范化后的完整条目。未提供 `id` 的条目会自动生成 ID。请求验证失败时不会写入新配置。保存成功后会自动重载调度配置；如果存在启用中的规则且调度器未运行，会自动启动调度器。若配置已写入磁盘但重载失败，返回 `200`，`message` 为 `Schedules saved, but reload failed: <原因>`。

**响应：**

```json
{
  "success": true,
  "data": {
    "message": "Schedules saved and reloaded successfully.",
    "backup": "backups/schedules.yaml.backup.1705312345123456789",
    "entries": [ ... ]
  }
}
```

#### 更新单个调度

**请求：**

```http
PUT /api/v1/schedules/{id}
Content-Type: application/json

{
  "type": "user",
  "target": "elonmusk",
  "name": "更新后的名称",
  "schedule": "daily:09:00",
  "enabled": true
}
```

**URL 参数：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 调度 ID |

**响应：**

```json
{
  "success": true,
  "data": {
    "message": "Schedule updated successfully.",
    "backup": "backups/schedules.yaml.backup.1705312345123456789",
    "entry": { ... }
  }
}
```

#### 删除调度

**请求：**

```http
DELETE /api/v1/schedules/{id}
```

**响应：**

```json
{
  "success": true,
  "data": {
    "message": "Schedule deleted successfully.",
    "backup": "backups/schedules.yaml.backup.1705312345123456789"
  }
}
```

#### 启用/禁用调度

**请求：**

```http
PATCH /api/v1/schedules/{id}/enabled
Content-Type: application/json

{
  "enabled": true
}
```

**请求体参数：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `enabled` | bool | 是 | 是否启用 |

**响应：**

```json
{
  "success": true,
  "data": {
    "message": "Schedule updated successfully.",
    "backup": "backups/schedules.yaml.backup.1705312345123456789",
    "entry": { ... }
  }
}
```

#### 手动触发调度

**请求：**

```http
POST /api/v1/schedules/{id}/trigger
```

**响应：**

```json
{
  "success": true,
  "data": {
    "task_id": "task_abc123",
    "message": "Schedule triggered successfully."
  }
}
```

失败时返回：

| 状态码 | `error` | 场景 |
|--------|---------|------|
| `400` | `Scheduler not initialized` | 调度器未启动 |
| `404` | `Schedule not found` | 条目不存在 |
| `409` | `Schedule is disabled` | 条目已禁用 |
| `409` | `Schedule is already triggering` | 正在触发中；`detail` 为底层错误（形如 `schedule is already triggering: schedule "<name>"`） |
| `500` | `Failed to trigger schedule: <原因>` | 其他错误 |

#### 获取原始调度文件内容

**请求：**

```http
GET /api/v1/schedules/raw
```

**响应：**

```json
{
  "success": true,
  "data": {
    "content": "schedules:\n  - id: sch_abc123\n    type: user\n    target: elonmusk\n...",
    "path": "/path/to/schedules.yaml",
    "exists": true
  }
}
```

#### 更新原始调度文件

**请求：**

```http
PUT /api/v1/schedules/raw
Content-Type: application/json

{
  "content": "schedules:\n  - id: sch_abc123\n    type: user\n    target: elonmusk\n    schedule: daily:08:00\n    enabled: true"
}
```

**请求体参数：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `content` | string | 是 | 完整的 YAML 调度内容 |

**响应：**

```json
{
  "success": true,
  "data": {
    "message": "Schedules saved and reloaded successfully.",
    "backup": "backups/schedules.yaml.backup.1705312345123456789"
  }
}
```

#### 重新加载调度

**请求：**

```http
POST /api/v1/schedules/reload
```

**响应：**

```json
{
  "success": true,
  "data": {
    "message": "Schedules reloaded successfully."
  }
}
```

重载成功后，如果存在启用中的规则且调度器未运行，会自动启动调度器。

#### 验证调度

验证调度条目格式是否正确，不实际保存。

**请求：**

```http
POST /api/v1/schedules/validate
Content-Type: application/json

{
  "entries": [
    {
      "type": "mixed",
      "users": ["elonmusk"],
      "lists": ["123456789"],
      "following_names": ["openai"],
      "schedule": "interval:8h"
    }
  ]
}
```

**请求体参数（三选一）：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `entry` | object | 验证单个调度条目 |
| `entries` | array | 验证多个调度条目 |
| `raw` | string | 验证 YAML 格式的调度内容 |

**响应：**

```json
{
  "success": true,
  "data": {
    "valid": true
  }
}
```

**验证失败响应：**

```json
{
  "success": true,
  "data": {
    "valid": false,
    "errors": ["schedule #1 (每日下载): invalid schedule expression"]
  }
}
```

***

#### 批量触发所有调度

批量触发所有已启用的调度规则，返回每个规则的触发结果。

**请求：**

```http
POST /api/v1/schedules/trigger-all
```

**响应：**

```json
{
  "success": true,
  "data": {
    "total": 3,
    "succeeded": 3,
    "failed": 0,
    "results": [
      { "entry_id": "sch_abc123", "task_id": "task_xxx" },
      { "entry_id": "sch_def456", "task_id": "task_yyy" },
      { "entry_id": "sch_ghi789", "task_id": "task_zzz" }
    ]
  }
}
```

**响应字段：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `total` | int | 尝试触发的调度总数 |
| `succeeded` | int | 成功触发的数量 |
| `failed` | int | 失败的数量 |
| `results[].entry_id` | string | 调度条目 ID |
| `results[].task_id` | string | 创建的任务 ID（成功时） |
| `results[].error` | string | 错误信息（失败时） |

**错误响应：**

- 调度器未初始化：`{"success": false, "error": "Scheduler not initialized"}`
- 没有已启用的调度：`{"success": false, "error": "No enabled schedules to trigger"}`

**示例：**

```bash
curl -X POST http://localhost:25556/api/v1/schedules/trigger-all
```

***

#### 获取调度概览统计

获取调度的概览统计信息，包括总数、启用数、禁用数和异常数。

**请求：**

```http
GET /api/v1/schedules/stats
```

**响应：**

```json
{
  "success": true,
  "data": {
    "total": 10,
    "enabled": 8,
    "disabled": 2,
    "failures": 1
  }
}
```

**响应字段：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `total` | int | 调度总数 |
| `enabled` | int | 启用中的调度数量 |
| `disabled` | int | 禁用的调度数量 |
| `failures` | int | 有连续失败记录的调度数量 |

**示例：**

```bash
curl http://localhost:25556/api/v1/schedules/stats
```

***

#### 获取下载队列状态

获取下载队列的实时状态，包括待处理、活跃和分离的任务数量。

**请求：**

```http
GET /api/v1/queue/status
```

**响应：**

```json
{
  "success": true,
  "data": {
    "queue_depth": 5,
    "active_jobs": 2,
    "pending_jobs": 3,
    "detached_jobs": 0
  }
}
```

**响应字段：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `queue_depth` | int | 队列总深度（活跃 + 待处理 + 分离） |
| `active_jobs` | int | 正在执行的任务数 |
| `pending_jobs` | int | 排队等待的任务数 |
| `detached_jobs` | int | 分离任务数（超过取消宽限期仍在运行） |

**示例：**

```bash
curl http://localhost:25556/api/v1/queue/status
```

***

## 数据库管理 API 详解

### 通用查询参数

所有数据库列表查询端点（GET）支持以下通用参数：

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `page` | int | 1 | 页码 |
| `pageSize` | int | 20 | 每页数量（最大 200） |
| `sortBy` | string | `id` | 排序字段 |
| `sortOrder` | string | `desc` | 排序方向：`asc` 或 `desc` |
| `q` | string | - | 搜索关键词 |

### 1. 用户管理

#### 查询用户列表

**请求：**

```http
GET /api/v1/db/users?page=1&pageSize=20&sortBy=id&sortOrder=desc&q=elonmusk
```

**查询参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `accessible` | bool | 按可访问状态筛选 |
| `protected` | bool | 按保护状态筛选 |

**响应：**

```json
{
  "success": true,
  "data": {
    "data": [
      {
        "id": "44196397",
        "screen_name": "elonmusk",
        "name": "Elon Musk",
        "protected": false,
        "friends_count": 100,
        "is_accessible": true
      }
    ],
    "total": 1,
    "page": 1,
    "pageSize": 20,
    "totalPages": 1
  }
}
```

#### 获取用户详情

**请求：**

```http
GET /api/v1/db/users/44196397
```

**响应：**

```json
{
  "success": true,
  "data": {
    "id": "44196397",
    "screen_name": "elonmusk",
    "name": "Elon Musk",
    "protected": false,
    "friends_count": 100,
    "is_accessible": true
  }
}
```

**响应字段：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 用户 ID |
| `screen_name` | string | 用户 Screen Name |
| `name` | string | 显示名称 |
| `protected` | bool | 是否受保护 |
| `friends_count` | int | 关注数 |
| `is_accessible` | bool | 是否可通过 API 正常访问（非封禁/注销状态） |

#### 更新用户

**请求：**

```http
PATCH /api/v1/db/users/44196397
Content-Type: application/json

{
  "screen_name": "elonmusk",
  "name": "Elon Musk Updated",
  "friends_count": 150,
  "protected": true,
  "is_accessible": false
}
```

**请求体参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `screen_name` | string | 否 | 用户 Screen Name |
| `name` | string | 否 | 显示名称 |
| `friends_count` | int | 否 | 关注数 |
| `protected` | bool | 否 | 是否受保护 |
| `is_accessible` | bool | 否 | 是否可访问 |

**响应：**

```json
{
  "success": true,
  "data": {
    "id": "44196397",
    "screen_name": "elonmusk",
    "name": "Elon Musk Updated",
    "protected": true,
    "friends_count": 150,
    "is_accessible": false
  }
}
```

**响应字段：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 用户 ID |
| `screen_name` | string | 用户 Screen Name |
| `name` | string | 显示名称 |
| `protected` | bool | 是否受保护 |
| `friends_count` | int | 关注数 |
| `is_accessible` | bool | 是否可通过 API 正常访问（非封禁/注销状态） |

#### 删除用户

**请求：**

```http
DELETE /api/v1/db/users/44196397
```

**响应：**

```json
{
  "success": true,
  "data": {
    "message": "User deleted successfully",
    "cascade_links": 3,
    "cascade_entities": 12,
    "cascade_previous_names": 2
  }
}
```

级联字段为本次删除的关联记录数（链接、实体、历史名称）。

#### 获取用户历史名称

**请求：**

```http
GET /api/v1/db/users/44196397/previous-names
```

**响应：**

```json
{
  "success": true,
  "data": {
    "data": [
      {
        "id": "1",
        "user_id": "44196397",
        "screen_name": "elonmusk_old",
        "name": "Elon Musk Old Name",
        "record_date": "2023-01-15"
      }
    ],
    "total": 1,
    "page": 1,
    "pageSize": 20,
    "totalPages": 1
  }
}
```

#### 获取用户的所有实体

**请求：**

```http
GET /api/v1/db/users/44196397/entities?page=1&pageSize=20
```

分页参数同通用查询；`sortBy` 白名单为 `id`、`user_id`、`name`、`media_count`、`latest_release_time`。

**响应：**

```json
{
  "success": true,
  "data": {
    "data": [
      {
        "id": "1",
        "user_id": "44196397",
        "name": "Elon Musk(elonmusk)",
        "parent_dir": "users",
        "media_count": 150,
        "latest_release_time": "2024-01-15T10:30:00Z"
      }
    ],
    "total": 1,
    "page": 1,
    "pageSize": 20,
    "totalPages": 1
  }
}
```

#### 获取用户的所有链接

**请求：**

```http
GET /api/v1/db/users/44196397/links?page=1&pageSize=20
```

分页参数同通用查询；`sortBy` 白名单为 `id`、`user_id`、`name`、`parent_lst_entity_id`。

**响应：**

```json
{
  "success": true,
  "data": {
    "data": [
      {
        "id": "1",
        "user_id": "44196397",
        "name": "elonmusk_link",
        "parent_lst_entity_id": "1",
        "parent_lst_entity_name": "Tech News"
      }
    ],
    "total": 1,
    "page": 1,
    "pageSize": 20,
    "totalPages": 1
  }
}
```

***

### 2. 列表管理

#### 查询列表

**请求：**

```http
GET /api/v1/db/lists?page=1&pageSize=20&q=tech
```

**查询参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `ownerId` | string | 按所有者 ID 筛选 |

**响应：**

```json
{
  "success": true,
  "data": {
    "data": [
      {
        "id": "123456789",
        "name": "Tech News",
        "owner_user_id": "44196397"
      }
    ],
    "total": 1,
    "page": 1,
    "pageSize": 20,
    "totalPages": 1
  }
}
```

#### 获取列表详情

**请求：**

```http
GET /api/v1/db/lists/123456789
```

**响应：**

```json
{
  "success": true,
  "data": {
    "id": "123456789",
    "name": "Tech News",
    "owner_user_id": "44196397"
  }
}
```

#### 更新列表

**请求：**

```http
PATCH /api/v1/db/lists/123456789
Content-Type: application/json

{
  "name": "Updated List Name",
  "owner_user_id": "44196397"
}
```

**请求体参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 否 | 列表名称 |
| `owner_user_id` | string | 否 | 所有者用户 ID |

**响应：**

```json
{
  "success": true,
  "data": {
    "id": "123456789",
    "name": "Updated List Name",
    "owner_user_id": "44196397"
  }
}
```

#### 删除列表

**请求：**

```http
DELETE /api/v1/db/lists/123456789
```

**响应：**

```json
{
  "success": true,
  "data": {
    "message": "List deleted successfully"
  }
}
```

***

### 3. 用户实体管理

#### 查询用户实体

**请求：**

```http
GET /api/v1/db/user-entities?page=1&pageSize=20&q=elonmusk
```

**查询参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `userId` | string | 按用户 ID 筛选 |

**响应：**

```json
{
  "success": true,
  "data": {
    "data": [
      {
        "id": "1",
        "user_id": "44196397",
        "name": "Elon Musk(elonmusk)",
        "latest_release_time": "2024-01-15T10:30:00Z",
        "parent_dir": "users",
        "media_count": 150
      }
    ],
    "total": 1,
    "page": 1,
    "pageSize": 20,
    "totalPages": 1
  }
}
```

#### 获取用户实体详情

**请求：**

```http
GET /api/v1/db/user-entities/1
```

**响应：**

```json
{
  "success": true,
  "data": {
    "id": "1",
    "user_id": "44196397",
    "name": "Elon Musk(elonmusk)",
    "latest_release_time": "2024-01-15T10:30:00Z",
    "parent_dir": "users",
    "media_count": 150
  }
}
```

#### 更新用户实体

**请求：**

```http
PATCH /api/v1/db/user-entities/1
Content-Type: application/json

{
  "name": "Updated Entity Name",
  "media_count": 200
}
```

**请求体参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 否 | 实体名称 |
| `media_count` | int32 | 否 | 媒体文件数量 |
| `latest_release_time` | string | 否 | RFC 3339 时间；空字符串清除该值 |

**注意：** `parent_dir` 字段不允许修改，请求中包含该字段将返回 400 错误。修改 `name` 会移动 `parent_dir` 下对应目录；统计字段先以字段级更新提交，目录改名最后执行。同进程同实体操作会串行；目标目录已被其他路径占用或进程外写入导致陈旧更新时返回 409，记录在操作期间被删除时返回 404。响应中的 `latest_release_time` 始终是 UTC RFC3339。

**响应：**

```json
{
  "success": true,
  "data": {
    "id": "1",
    "user_id": "44196397",
    "name": "Updated Entity Name",
    "latest_release_time": "2024-01-15T10:30:00Z",
    "parent_dir": "users",
    "media_count": 200
  }
}
```

#### 删除用户实体

**请求：**

```http
DELETE /api/v1/db/user-entities/1
```

删除会暂存并移除对应存储目录；如果数据库删除失败，目录会恢复到原路径。该操作会删除目录内的媒体和元数据文件。

**响应：**

```json
{
  "success": true,
  "data": {
    "message": "Entity deleted successfully"
  }
}
```

***

### 4. 列表实体管理

#### 查询列表实体

**请求：**

```http
GET /api/v1/db/list-entities?page=1&pageSize=20&q=listname
```

**查询参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `listId` | string | 按列表 ID 筛选 |

**响应：**

```json
{
  "success": true,
  "data": {
    "data": [
      {
        "id": "1",
        "lst_id": "123456789",
        "name": "List Entity Name",
        "parent_dir": "lists",
        "list_name": "Tech News"
      }
    ],
    "total": 1,
    "page": 1,
    "pageSize": 20,
    "totalPages": 1
  }
}
```

#### 获取列表实体详情

**请求：**

```http
GET /api/v1/db/list-entities/1
```

**响应：**

```json
{
  "success": true,
  "data": {
    "id": "1",
    "lst_id": "123456789",
    "name": "List Entity Name",
    "parent_dir": "lists",
    "list_name": "Tech News"
  }
}
```

#### 更新列表实体

**请求：**

```http
PATCH /api/v1/db/list-entities/1
Content-Type: application/json

{
  "name": "Updated List Entity"
}
```

**请求体参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 否 | 实体名称 |

**注意：** `parent_dir` 字段不允许修改，请求中包含该字段将返回 400 错误。修改 `name` 会移动 `parent_dir` 下对应目录；同进程同实体操作会串行，目标目录冲突或进程外陈旧写入返回 409，记录在操作期间被删除时返回 404。

**响应：**

```json
{
  "success": true,
  "data": {
    "id": "1",
    "lst_id": "123456789",
    "name": "Updated List Entity",
    "parent_dir": "lists"
  }
}
```

#### 删除列表实体

**请求：**

```http
DELETE /api/v1/db/list-entities/1
```

删除会暂存并移除对应存储目录；如果数据库删除失败，目录会恢复到原路径。该操作会删除目录内的列表媒体和元数据文件。

**响应：**

```json
{
  "success": true,
  "data": {
    "message": "List entity deleted successfully"
  }
}
```

***

### 5. 用户链接管理

#### 查询用户链接

**请求：**

```http
GET /api/v1/db/user-links?page=1&pageSize=20
```

**查询参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `userId` | string | 按用户 ID 筛选 |
| `listEntityId` | string | 按列表实体 ID 筛选 |

**响应：**

```json
{
  "success": true,
  "data": {
    "data": [
      {
        "id": "1",
        "user_id": "44196397",
        "name": "elonmusk_link",
        "parent_lst_entity_id": "1",
        "parent_lst_entity_name": "Tech News"
      }
    ],
    "total": 1,
    "page": 1,
    "pageSize": 20,
    "totalPages": 1
  }
}
```

`list_name` / `parent_lst_entity_name` 由关联表实时补齐；关联记录不存在时为空字符串。

#### 获取用户链接详情

**请求：**

```http
GET /api/v1/db/user-links/1
```

**响应：**

```json
{
  "success": true,
  "data": {
    "id": "1",
    "user_id": "44196397",
    "name": "elonmusk_link",
    "parent_lst_entity_id": "1",
    "parent_lst_entity_name": "Tech News"
  }
}
```

#### 更新用户链接

**请求：**

```http
PATCH /api/v1/db/user-links/1
Content-Type: application/json

{
  "name": "updated_link_name"
}
```

**请求体参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 否 | 链接名称 |

**响应：**

```json
{
  "success": true,
  "data": {
    "id": "1",
    "user_id": "44196397",
    "name": "updated_link_name",
    "parent_lst_entity_id": "1"
  }
}
```

#### 删除用户链接

**请求：**

```http
DELETE /api/v1/db/user-links/1
```

**响应：**

```json
{
  "success": true,
  "data": {
    "message": "User link deleted successfully"
  }
}
```

***

### 6. 数据库统计

返回各表记录数。键名是**物理表名**，不是资源名。

**请求：**

```http
GET /api/v1/db/stats
```

**响应：**

```json
{
  "success": true,
  "data": {
    "users": 12,
    "lsts": 3,
    "user_entities": 40,
    "lst_entities": 5,
    "user_links": 7,
    "user_previous_names": 9
  }
}
```

**说明：**

- `lsts` 是列表表，对应 `/api/v1/db/lists` 的资源
- 六个键始终存在，每次调用实时 `COUNT(*)`

***

## 注意事项

1. **异步执行** - 所有下载任务都是异步执行的，创建后立即返回 task\_id
2. **Twitter 限流** - API 会自动处理 Twitter 的速率限制
3. **任务取消** - 只能取消 `queued` 或 `running` 状态的任务
4. **存储位置** - 下载的文件保存在配置的数据目录中
5. **日志查看** - 服务器日志显示在控制台，可用于调试

***

## 完整 API 端点速查表

### 核心 API

| 端点                                        | 方法   | 功能             |
| ----------------------------------------- | ---- | -------------- |
| `/api/v1/health`                          | GET  | 健康检查           |
| `/api/v1/bot/feishu/callback`             | POST | Bot 回调（免认证，仅启用飞书 Bot 时注册） |
| `/api/v1/auth/login`                     | POST | 用 API Key 换取 JWT 令牌 |
| `/api/v1/auth/refresh`                   | POST | 刷新 JWT 令牌 |
| `/api/v1/auth/check`                     | GET  | 检查 JWT 有效性 |
| `/api/v1/users/{name}/download`           | POST | 下载用户推文         |
| `/api/v1/users/{name}/profile`            | POST | 下载用户 Profile   |
| `/api/v1/users/{name}/mark`               | POST | 标记用户为已下载       |
| `/api/v1/users/{name}/following/download` | POST | 下载关注列表         |
| `/api/v1/users/{name}/following/mark`     | POST | 标记关注列表为已下载     |
| `/api/v1/lists/{id}/download`             | POST | 下载列表成员推文       |
| `/api/v1/lists/{id}/profile`              | POST | 下载列表成员 Profile |
| `/api/v1/lists/{id}/mark`                 | POST | 标记列表为已下载       |
| `/api/v1/json/file/download`              | POST | 从 JSON 文件下载    |
| `/api/v1/json/folder/download`            | POST | 从 JSON 文件夹下载   |
| `/api/v1/batch/download`                  | POST | 批量下载           |
| `/api/v1/batch/mark`                      | POST | 批量标记下载        |
| `/api/v1/tasks`                           | GET  | 获取任务列表         |
| `/api/v1/tasks/{id}`                      | GET  | 获取任务详情         |
| `/api/v1/tasks/{id}/cancel`               | POST | 取消任务           |
| `/api/v1/tasks/stats`                     | GET  | 任务统计（按状态计数） |
| `/api/v1/tasks/cancel-queued`             | POST | 取消所有排队中的任务 |
| `/api/v1/tasks/{id}/retry`                | POST | 重试失败/取消的任务 |
| `/api/v1/tasks/{id}`                      | DELETE | 删除终端状态任务 |
| `/api/v1/tasks/query`                     | GET  | 服务端过滤/搜索/排序/分页任务 |
| `/api/v1/tasks/batch/cancel`              | POST | 批量取消任务（最多 100 个） |
| `/api/v1/tasks/batch/retry`               | POST | 批量重试任务（最多 100 个） |
| `/api/v1/tasks/batch/delete`              | POST | 批量删除任务（最多 100 个） |

### Web 界面与数据 API

| 端点                                        | 方法   | 功能               |
| ----------------------------------------- | ---- | ---------------- |
| `/`                                       | GET  | Web 管理界面首页     |
| `/tasks`                                  | GET  | Web 任务页面（SPA路由） |
| `/data`                                   | GET  | Web 数据浏览页（SPA路由） |
| `/schedules`                              | GET  | Web 调度管理页（SPA路由） |
| `/system`                                 | GET  | Web 系统配置页（SPA路由） |
| `/logs`                                   | GET  | Web 日志页面（SPA路由） |
| `/static/*`                               | GET  | 静态资源（CSS/JS）   |
| `/api/v1/config/theme`                   | GET  | 获取当前前端主题 |
| `/api/v1/config/theme`                   | POST | 切换前端主题 |
| `/api/v1/config/themes`                  | GET  | 获取可用主题列表 |
| `/favicon.ico`                           | GET  | 浏览器图标 |
| `/api/v1/sse/tasks`                       | GET  | SSE 实时任务推送     |
| `/api/v1/config`                          | GET  | 获取系统配置（脱敏）  |
| `/api/v1/config/raw`                      | GET  | 获取原始配置文件内容  |
| `/api/v1/config/raw`                      | PUT  | 更新原始配置文件      |
| `/api/v1/config/fields`                   | GET  | 获取结构化配置字段    |
| `/api/v1/config/fields`                   | PUT  | 保存结构化配置字段    |
| `/api/v1/cookies`                         | GET  | 获取额外 Cookie（脱敏） |
| `/api/v1/cookies`                         | PUT  | 保存额外 Cookie      |
| `/api/v1/cookies/raw`                     | GET  | 获取原始 Cookie 文件  |
| `/api/v1/cookies/raw`                     | PUT  | 更新原始 Cookie 文件  |
| `/api/v1/logs`                            | GET  | 获取系统日志         |
| `/api/v1/logs/stream`                     | GET  | SSE 实时日志流      |
| `/api/v1/logs/stats`                      | GET  | 日志级别统计计数 |
| `/api/v1/logs/export`                     | GET  | 导出完整日志文件 |
| `/api/v1/server/shutdown`                 | POST | 优雅关闭服务器        |
| `/api/v1/download/context`                | GET  | 下载页首屏聚合状态（公开） |
| `/api/v1/errors`                          | GET  | 失败推文摘要 |
| `/api/v1/errors/retry`                    | POST | 重试所有历史失败推文 |
| `/api/v1/errors`                          | DELETE | 清除所有失败推文记录 |

### 调度器 API

| 端点                                        | 方法   | 功能               |
| ----------------------------------------- | ---- | ---------------- |
| `/api/v1/schedules`                       | GET  | 获取所有调度         |
| `/api/v1/schedules`                       | PUT  | 批量替换全部调度      |
| `/api/v1/schedules`                       | POST | 创建调度           |
| `/api/v1/schedules/raw`                   | GET  | 获取原始调度文件内容  |
| `/api/v1/schedules/raw`                   | PUT  | 更新原始调度文件      |
| `/api/v1/schedules/reload`                | POST | 重新加载调度         |
| `/api/v1/schedules/validate`              | POST | 验证调度条目         |
| `/api/v1/schedules/trigger-all`           | POST | 批量触发所有已启用调度 |
| `/api/v1/schedules/stats`                 | GET  | 调度概览统计         |
| `/api/v1/schedules/{id}`                  | PUT  | 更新调度           |
| `/api/v1/schedules/{id}`                  | DELETE | 删除调度         |
| `/api/v1/schedules/{id}/enabled`          | PATCH | 启用/禁用调度       |
| `/api/v1/schedules/{id}/trigger`          | POST | 手动触发调度         |
| `/api/v1/queue/status`                    | GET  | 下载队列状态         |

### 数据库管理 API

| 端点                                        | 方法   | 功能               |
| ----------------------------------------- | ---- | ---------------- |
| `/api/v1/db/users`                        | GET  | 查询用户列表（分页/排序/搜索） |
| `/api/v1/db/users/{id}`                   | GET  | 获取用户详情       |
| `/api/v1/db/users/{id}`                   | PATCH | 部分更新用户信息     |
| `/api/v1/db/users/{id}`                   | DELETE | 删除用户         |
| `/api/v1/db/users/{id}/previous-names`    | GET  | 获取用户历史名称    |
| `/api/v1/db/users/{id}/entities`          | GET  | 获取用户的所有实体（分页） |
| `/api/v1/db/users/{id}/links`             | GET  | 获取用户的所有链接（分页） |
| `/api/v1/db/user-previous-names`          | GET  | 全局历史名称查询（含当前名称） |
| `/api/v1/db/lists`                        | GET  | 查询列表（分页/排序/搜索） |
| `/api/v1/db/lists/{id}`                   | GET  | 获取列表详情       |
| `/api/v1/db/lists/{id}`                   | PATCH | 部分更新列表信息     |
| `/api/v1/db/lists/{id}`                   | DELETE | 删除列表         |
| `/api/v1/db/lists/{id}/entities`          | GET  | 获取列表的所有实体（分页） |
| `/api/v1/db/user-entities`                | GET  | 查询用户实体（分页/排序/搜索） |
| `/api/v1/db/user-entities/{id}`           | GET  | 获取用户实体详情    |
| `/api/v1/db/user-entities/{id}`           | PATCH | 部分更新用户实体     |
| `/api/v1/db/user-entities/{id}`           | DELETE | 删除用户实体     |
| `/api/v1/db/list-entities`                | GET  | 查询列表实体（分页/排序/搜索） |
| `/api/v1/db/list-entities/{id}`           | GET  | 获取列表实体详情    |
| `/api/v1/db/list-entities/{id}`           | PATCH | 部分更新列表实体     |
| `/api/v1/db/list-entities/{id}`           | DELETE | 删除列表实体     |
| `/api/v1/db/user-links`                   | GET  | 查询用户链接（分页/搜索） |
| `/api/v1/db/user-links/{id}`              | GET  | 获取用户链接详情    |
| `/api/v1/db/user-links/{id}`              | PATCH | 部分更新用户链接     |
| `/api/v1/db/user-links/{id}`              | DELETE | 删除用户链接     |
| `/api/v1/db/stats`                        | GET  | 数据库各表记录数统计 |

***

## 请求参数汇总表

### URL 参数

| 端点                                               | URL 参数        | 类型     | 说明          |
| ------------------------------------------------ | ------------- | ------ | ----------- |
| `/api/v1/users/{screen_name}/download`           | `screen_name` | string | Twitter 用户名 |
| `/api/v1/users/{screen_name}/profile`            | `screen_name` | string | Twitter 用户名 |
| `/api/v1/users/{screen_name}/mark`               | `screen_name` | string | Twitter 用户名 |
| `/api/v1/users/{screen_name}/following/download` | `screen_name` | string | Twitter 用户名 |
| `/api/v1/users/{screen_name}/following/mark`     | `screen_name` | string | Twitter 用户名 |
| `/api/v1/lists/{list_id}/download`               | `list_id`     | uint64 | 列表 ID       |
| `/api/v1/lists/{list_id}/profile`                | `list_id`     | uint64 | 列表 ID       |
| `/api/v1/lists/{list_id}/mark`                   | `list_id`     | uint64 | 列表 ID       |
| `/api/v1/tasks/{task_id}`                        | `task_id`     | string | 任务 ID       |
| `/api/v1/tasks/{task_id}/cancel`                 | `task_id`     | string | 任务 ID       |
| `/api/v1/tasks/{task_id}/retry`                  | `task_id`     | string | 任务 ID       |
| `/api/v1/tasks/{task_id}`                        | `task_id`     | string | 任务 ID       |
| `/api/v1/schedules/{id}`                         | `id`          | string | 调度 ID       |
| `/api/v1/schedules/{id}/enabled`                 | `id`          | string | 调度 ID       |
| `/api/v1/schedules/{id}/trigger`                 | `id`          | string | 调度 ID       |

### 请求体参数

| 参数             | 类型   | 默认值     | 说明                  |
| -------------- | ---- | ------- | ------------------- |
| `auto_follow`  | bool | `false` | 自动关注受保护用户           |
| `follow_members` | bool | `false` | 下载时关注目标/成员         |
| `skip_profile` | bool | `false` | 跳过 Profile 下载（默认下载） |
| `no_retry`     | bool | `false` | 失败后不重试              |

**说明：**
- `auto_follow` 只处理 “受保护且未关注” 的用户；`follow_members` 会对下载目标中所有未关注用户尝试关注（不限是否受保护）。

#### 各端点特有参数

| 端点                              | 参数             | 类型        | 必填 | 说明                  |
| ------------------------------- | -------------- | --------- | -- | ------------------- |
| `/api/v1/users/{name}/mark`     | `timestamp`    | string    | 否  | 标记时间（ISO 8601）      |
| `/api/v1/users/{name}/following/mark` | `timestamp` | string | 否  | 标记时间（ISO 8601）      |
| `/api/v1/lists/{id}/mark`       | `timestamp`    | string    | 否  | 标记时间（ISO 8601）      |
| `/api/v1/json/file/download` | `paths` | []string | 是* | JSON 文件路径列表（服务端绝对路径，JSON Body 模式） |
| `/api/v1/json/file/download` | `files` | file | 是* | JSON 文件（multipart 上传模式，支持多选） |
| `/api/v1/json/file/download` | `no_retry` | bool/string | 否 | 失败后不重试 |
| `/api/v1/json/folder/download` | `paths` | []string | 是* | 文件夹路径列表（服务端绝对路径，JSON Body 模式） |
| `/api/v1/json/folder/download` | `files` | file | 是* | JSON 文件（multipart 上传模式，支持多选） |
| `/api/v1/json/folder/download` | `no_retry` | bool/string | 否 | 失败后不重试 |
| `/api/v1/batch/download`        | `users`        | \[]string | 否  | 用户名列表               |
| `/api/v1/batch/download`        | `lists`        | \[]string | 否  | 列表 ID 列表（uint64 十进制字符串） |
| `/api/v1/batch/download`        | `following_names` | \[]string | 否 | 关注列表用户名列表        |
| `/api/v1/batch/download`        | `auto_follow`  | bool      | 否  | 自动关注受保护用户           |
| `/api/v1/batch/download`        | `follow_members` | bool     | 否  | 下载时关注目标/成员          |
| `/api/v1/batch/download`        | `skip_profile` | bool      | 否  | 跳过 Profile 下载（默认下载） |
| `/api/v1/batch/download`        | `no_retry`     | bool      | 否  | 失败后不重试              |
| `/api/v1/tasks/batch/{cancel,retry,delete}` | `task_ids` | []string | 是 | 任务 ID 列表，最多 100 个 |
| `/api/v1/tasks/query` | `status`、`type`、`q`、`page`、`pageSize`、`sortBy`、`sortOrder` | string/int | 否 | 任务过滤、搜索、排序与分页，详见「10.1 查询任务」 |

**说明：**
- `是*` 表示 JSON Body 模式的 `paths` 和 multipart 模式的 `files` 二选一，根据 `Content-Type` 自动判断。
