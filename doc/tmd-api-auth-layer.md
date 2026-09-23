# TMD API 认证/授权层

> 本文档详细说明 TMD (Twitter Media Downloader) 中 API 认证/授权层的设计原理、配置方法、认证流程和前端集成。涵盖 **API Key Bearer Token** 和 **JWT Session Token** 两种认证方式。
>
> 面向对象：TMD 开发者（Go 后端 + JavaScript 前端）。

---

## 目录

1. [功能概述](#功能概述)
2. [架构概览](#架构概览)
3. [配置说明](#配置说明)
4. [架构与中间件链](#架构与中间件链)
5. [认证方式一：原始 API Key（兼容模式）](#认证方式一原始-api-key兼容模式)
6. [认证方式二：JWT Session Token（推荐）](#认证方式二jwt-session-token推荐)
7. [双模式认证详解](#双模式认证详解)
8. [公开路径白名单](#公开路径白名单)
9. [SSE 端点的特殊处理](#sse-端点的特殊处理)
10. [API 使用示例](#api-使用示例)
11. [前端认证流程](#前端认证流程)
12. [前端 JWT 集成详解](#前端-jwt-集成详解)
13. [配置持久化与生效机制](#配置持久化与生效机制)
14. [环境变量覆盖](#环境变量覆盖)
15. [安全注意事项](#安全注意事项)
16. [实现参考](#实现参考)
17. [变更历史](#变更历史)

---

## 功能概述

TMD 默认的 HTTP API Server 端口是全开放的，任何能访问该端口的设备都可以调用所有 API，包括执行下载、管理数据、修改配置等敏感操作。这在以下场景中构成安全风险：

- **公网部署**：将 TMD 暴露到公网时，任何人都可以控制下载任务
- **内网多设备访问**：同一内网的其他设备可无限制调用 API

**认证层的目标**：在保持向后兼容的前提下，为 API 添加 Bearer Token 认证，同时确保 Web UI 的正常使用不受影响。

### 🔗 相关文件

| 文件 | 说明 |
|------|------|
| `internal/api/middleware.go` | authMiddleware 双模式认证实现 |
| `internal/api/auth_jwt.go` | JWT 核心 + 3 个 handler + rate limiter |
| `internal/api/server.go` | Server 结构体 + 路由注册 + 中间件链 |
| `internal/config/config.go` | APIKey 配置字段 |
| `internal/api/web/web1/app.js` | web1 前端 JWT 集成 |
| `internal/api/web/web2/app.js` | web2 前端 JWT 集成 |
| `internal/api/web/web3/app.js` | web3 前端 JWT 集成（与 web2 同构） |

---

## 架构概览

```
┌──────────────────────────────────────────────────────────┐
│  客户端                                                    │
│  ┌──────────────────────────────┐                         │
│  │ Web UI (web1 / web2 / web3)  │                         │
│  │ localStorage:                │                         │
│  │  tmd_jwt_token   ← 优先     │                         │
│  │  tmd_jwt_expiry  ← 过期时间 │                         │
│  │  无 tmd_api_key  (不在前端存储)│                        │
│  │                              │                         │
│  │ 401 → _tryRefreshJWT()      │                         │
│  │     → 成功重试原请求         │                         │
│  │     → 失败弹认证对话框       │                         │
│  │ Proactive: setInterval 45min │                         │
│  │ SSE: ?token=<jwt>           │                         │
│  └──────────────────────────────┘                         │
│  ┌──────────────────────────────┐                         │
│  │ curl / 第三方                 │                         │
│  │ Authorization: Bearer <jwt>  │                         │
│  │ Authorization: Bearer <key>  │ ← 也支持原始 Key        │
│  └──────────────────────────────┘                         │
└──────────────────────────┬───────────────────────────────┘
                           │
                           ▼ HTTP Request
┌──────────────────────────────────────────────────────────┐
│  TMD Server 中间件链                                       │
│                                                            │
│  ① securityHeadersMiddleware                               │
│     X-Content-Type-Options: nosniff                        │
│     X-Frame-Options: SAMEORIGIN                            │
│     Referrer-Policy: same-origin                           │
│                                                            │
│  ② loggingMiddleware                                       │
│     日志格式: [api] GET /api/v1/tasks status=200 dur=2.3ms ip=127.0.0.1 │
│     请求头/请求体不记录；查询参数经 SanitizeURL 脱敏               │
│                                                            │
│  ③ API-Version header                                     │
│     API-Version: v1                                        │
│                                                            │
│  ④ CORS middleware                                         │
│     AllowedOrigins: *                                      │
│     AllowedHeaders: Content-Type, Authorization            │
│     OPTIONS → 204 (直接返回，不进入内层)                    │
│                                                            │
│  ⑤ authMiddleware (核心)                                   │
│     ├─ isPublicPath(path) → 放行                           │
│     ├─ botCallbackPaths[path] 命中 → 放行（已注册回调）      │
│     ├─ config.APIKey == "" → 放行（认证未启用）            │
│     ├─ 提取 token: Auth Head > ?token=                     │
│     ├─ token == "" → 401 "missing"                        │
│     ├─ isAuthManagementPath(path)?                         │
│     │   └─ validateSessionToken (允许过期) → 放行/401      │
│     ├─ JWT 验证 (首选)                                     │
│     │   └─ validateSessionToken → 放行/继续               │
│     ├─ 原始 API Key 比较 (向后兼容)                         │
│     │   └─ token == config.APIKey → 放行/继续              │
│     └─ 401 + X-Token-Type: missing|expired|invalid                 │
│        (refresh 端点另有 too-old：签发超 jwtMaxRefreshAge)  │
│                                                            │
│  ⑥ ServeMux → handler                                      │
│     POST /api/v1/auth/login    → handleAuthLogin (公开)     │
│     POST /api/v1/auth/refresh  → handleAuthRefresh         │
│     GET  /api/v1/auth/check    → handleAuthCheck           │
│     GET  /api/v1/sse/tasks     → handleSSETasks            │
│     GET  /api/v1/logs/stream   → handleLogStream           │
│     ... 其他 80+ 路由                                       │
└──────────────────────────────────────────────────────────┘
```

### 关键设计决策

| 决策 | 理由 |
|------|------|
| authMiddleware 在 CORS 内层 | OPTIONS 预检由 CORS 直接处理（204），不经过 auth，无需预检携带 token |
| authMiddleware 在 ServeMux 外层 | 对所有路由统一检查，无需每个 handler 单独处理 |
| 双模式：JWT → 原始 Key | 先试 JWT（快路径），失败回退原始 Key 确保向后兼容 |
| auth 管理端点特殊处理 | 避免「鸡生蛋」：JWT 过期后客户端需要调用 refresh，但 refresh 被 authMiddleware 拦住 |
| bot 回调精确路径豁免 | 第三方平台回调不带 TMD Bearer；只放行 `RegisterBotCallback` 实际注册的路径，避免宽泛前缀开口子 |
| 关停写闸门在 auth 外层 | 关停期间所有新写请求（POST/PUT/PATCH/DELETE）一致返回 503，与是否认证无关；未认证请求不会因先认证而绕过闸门 |

---

## 配置说明

### conf.yaml

```yaml
root_path: "D:/TwitterMedia"
cookie:
  auth_token: "..."
  ct0: "..."
api_key: "your-secret-api-key"    # 空字符串 = 不启用认证
max_download_routine: 20
max_user_fetch_concurrent: 3
proxy_url: "http://127.0.0.1:7897"
```

### 配置字段元信息

| 字段 | 类型 | 环境变量 | 默认值 | 分组 | Web UI 类型 | 脱敏 |
|------|------|---------|-------|------|------------|------|
| `api_key` | `string` | `TMD_API_KEY` | `""`（空 = 禁用） | `security` | password | 是（`abc•••xyz`） |

### 配置加载优先级

1. `conf.yaml` → 启动时读取
2. `TMD_API_KEY` 环境变量 → 启动时覆盖（优先级最高）
3. Web UI 配置编辑 → 运行时覆盖内存 + 写回文件（**立即生效**）

### `NormalizeLoadedConf` 处理

```go
// 代码位置: internal/config/config.go#NormalizeLoadedConf
conf.APIKey = strings.TrimSpace(conf.APIKey)
```

所有加载路径（文件、环境变量）都会经过此函数，确保 Key 没有首尾空白。

### Web UI 配置编辑

`api_key` 在系统设置的配置编辑器中以 **password** 类型显示（值被脱敏，如 `abc•••xyz`），归属于 `security` 分组。通过 Web UI 保存后**立即生效**，无需重启。

**特殊 sentinel 值**（代码位置：`internal/api/config_handlers.go#handleSaveConfigFields`）：

| 值 | 行为 | 适用场景 |
|------|------|---------|
| `__KEEP_OLD__` | 保留当前值不变 | 修改其他字段时保持 `api_key` 不变 |
| `__CLEAR__` | 显式清空该字段为 `""` | 关闭认证 |

**掩码占位值会被拒绝**：`handleSaveConfigFields` 调用 `isMaskedValue`（`internal/api/config_handlers.go#isMaskedValue`）拦截前端误提交的脱敏占位文本（如 `abc•••xyz` 或 `***`），返回 400 并提示「留空以保留当前值，或输入真实值」。

**最小长度**：`api_key` 的 Setter（`internal/config/config.go#GetFieldDefs` 中的 `api_key` 字段定义）在非空时要求至少 8 个字符，否则保存报错。

---

## 架构与中间件链

### 中间件包裹顺序（代码位置：`internal/api/server.go#buildHandler`）

```go
func (s *Server) buildHandler() http.Handler {
    mux := http.NewServeMux()
    // ... 注册所有路由 ...

    var handler http.Handler = mux
    handler = s.authMiddleware(handler)             // ⑥ auth
    handler = s.shutdownMutationMiddleware(handler) // ⑤ 关停写请求闸门
    handler = cors.New(...).Handler(handler)        // ④ CORS

    // ③ API-Version（内联闭包，非独立函数：设置 API-Version: v1 后转交 CORS）
    corsHandler := handler
    handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("API-Version", "v1")
        corsHandler.ServeHTTP(w, r)
    })

    handler = loggingMiddleware(handler)            // ② 日志
    handler = securityHeadersMiddleware(handler)    // ① 安全头
    return handler
}
```

注意包裹顺序：最外层（先执行）是 `securityHeadersMiddleware`，最内层是 `ServeMux`。关停写请求闸门在认证外层，因此关停期间未认证写请求也会一致返回 503。

### 认证中间件代码位置

- **实现**：`internal/api/middleware.go#Server.authMiddleware` — `Server.authMiddleware()` 方法
- **注入**：`internal/api/server.go#buildHandler` — `handler = s.authMiddleware(handler)`
- **依赖**：`internal/api/auth_jwt.go#deriveJWTSecret` — `deriveJWTSecret()`
- **依赖**：`internal/api/auth_jwt.go#validateSessionToken` — `validateSessionToken()`
- **依赖**：`internal/api/auth_jwt.go#enforceMaxRefreshAge` — `enforceMaxRefreshAge()`（refresh 端点使用）

---

## 认证方式一：原始 API Key（兼容模式）

### 工作原理

客户端直接将 `conf.yaml` 中配置的 `api_key` 值放入 `Authorization` 头中发送。服务端 authMiddleware 提取 token 后与 `s.config.APIKey` 做字符串直接比较。

**适用场景**：
- 旧客户端（升级前使用原始 Key）
- curl 快速调试（无需先 login）
- 第三方集成（不方便管理 JWT 生命周期）

### 认证流程

```
客户端                                    TMD Server
  │                                           │
  │  GET /api/v1/tasks                        │
  │  Authorization: Bearer <api_key>          │
  │──────────────────────────────────────────►│
  │                                           │  authMiddleware:
  │                                           │  ① extractBearerToken → "<api_key>"
  │                                           │  ② validateSessionToken → 失败（不是 JWT）
  │                                           │  ③ token == config.APIKey? → 通过 ✅
  │                                           │  ④ 放行到 ServeMux
  │  HTTP 200 + JSON                          │
  │◄──────────────────────────────────────────│
```

### 认证失败流程（无 token）

```
客户端                                    TMD Server
  │                                           │
  │  GET /api/v1/tasks (无 Authorization)     │
  │──────────────────────────────────────────►│
  │                                           │  authMiddleware:
  │                                           │  ① extractBearerToken → ""
  │                                           │  ② ?token= → ""
  │                                           │  ③ token == "" → 401
  │                                           │  writeAuth401("missing")
  │  HTTP 401                                 │
  │  WWW-Authenticate: Bearer realm="TMD API" │
  │  X-Token-Type: missing                     │
  │  {"success":false,"error":"unauthorized"} │
  │◄──────────────────────────────────────────│
```

### 局限

- API Key 在每次请求中都通过网络传输（需要 HTTPS 加密通道）
- 无过期机制（Key 永久有效直到手动修改）
- 无法精细控制访问权限

---

## 认证方式二：JWT Session Token（推荐）

### 核心原理

JWT（JSON Web Token，RFC 7519）是一种用于在客户端和服务端之间安全传输声明的开放标准。TMD 使用 HS256（HMAC-SHA256）签名的 JWT 作为短期会话令牌。

**流程**：
1. 客户端用 API Key 调用 `POST /api/v1/auth/login`
2. 服务端验证 Key 后签发 JWT（1 小时有效）
3. 后续请求用 JWT 替代原始 Key
4. JWT 过期前客户端调用 `POST /api/v1/auth/refresh` 获取新 JWT

### 令牌获取流程

```
┌──────────────┐         ┌──────────────────────────┐         ┌──────────────┐
│  客户端       │         │      TMD Server           │         │  conf.yaml   │
├──────────────┤         ├──────────────────────────┤         ├──────────────┤
│ API Key      │──登录──►│ ① 验证 API Key           │         │ api_key      │
│              │         │ ② deriveJWTSecret(key)    │         │              │
│              │         │ ③ generateSessionToken() │         │              │
│              │◄──JWT──│ ④ 返回 {token, expires}   │         │              │
├──────────────┤         ├──────────────────────────┤         └──────────────┘
│ JWT          │──请求──►│ authMiddleware:           │
│ (后续)       │         │ ① JWT 验证 → 通过 ✅     │
│              │◄──200──│ ② 失败 → 回退原始 Key     │
└──────────────┘         └──────────────────────────┘
```

### 密钥派生（Key Derivation）

**代码位置**：`internal/api/auth_jwt.go#deriveJWTSecret`

```go
func deriveJWTSecret(apiKey string) []byte {
    mac := hmac.New(sha256.New, []byte("tmd-jwt-v1"))
    mac.Write([]byte(apiKey))
    return mac.Sum(nil)
}
```

**设计理由**：

| 理由 | 说明 |
|------|------|
| 隔离泄露影响 | 即使 `jwt_secret` 暴露（如进程内存 dump），原始 `api_key` 不受影响，只需清除 JWT |
| 无需额外配置 | 不引入独立 JWT 签名密钥，用户只需管理 `api_key` |
| 标准 HKDF 风格 | `HMAC(context, key_material)` 是 NIST 推荐的密钥派生模式 |

**jwt_secret ≠ api_key**：由于 HMAC 的单向性，即使攻击者知道了 `jwt_secret`，也无法逆向推导出 `api_key`。

### JWT 结构

**Header：**
```json
{
  "alg": "HS256",
  "typ": "JWT"
}
```

**Payload（claims）——定义在 `internal/api/auth_jwt.go#jwtClaims`：**
```json
{
  "iss": "tmd",                    // Issuer
  "sub": "tmd-session",            // Subject
  "iat": 1719212345,               // Issued At
  "exp": 1719215945,               // Expiration (iat + 3600s)
  "jti": "1719212345012345678"     // JWT ID (基于 UnixNano)
}
```

### Claims 验证规则

```go
func validateSessionToken(tokenString string, apiKey string) (*jwt.Token, error) {
    secret := deriveJWTSecret(apiKey)
    token, err := jwt.ParseWithClaims(tokenString, &jwtClaims{}, func(t *jwt.Token) (any, error) {
        if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
            return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
        }
        return secret, nil
    },
        jwt.WithIssuer(jwtIssuer),
        jwt.WithSubject(jwtSubject),
        jwt.WithLeeway(30*time.Second),
        jwt.WithValidMethods([]string{"HS256"}),
    )
    if err != nil {
        return nil, err
    }
    return token, nil
}
```

| Claim | 验证逻辑 | 安全意义 | 容忍度 |
|-------|---------|---------|--------|
| `alg` | `jwt.WithValidMethods(["HS256"])` | 防止 alg=none 攻击 | 无 |
| `iss` | `jwt.WithIssuer("tmd")` | 防止跨服务 JWT 混用 | 无 |
| `sub` | `jwt.WithSubject("tmd-session")` | 确保是会话令牌 | 无 |
| `exp` | `jwt.ParseWithClaims` 自动检查 | 防止重放过期 JWT | 30 秒时钟偏差 |
| `iat` | `jwt.ParseWithClaims` 自动检查 | 确保 JWT 有正确签发时间 | 30 秒时钟偏差 |
| 签名 | HMAC-SHA256 + `deriveJWTSecret` | 防篡改 | 密钥错误 = 签名无效 |

### `/api/v1/auth/login` — 登录端点

**代码位置**：`internal/api/auth_jwt.go#Server.handleAuthLogin`

**认证**：🔓 公开（在 `isPublicPath` 白名单中）

**请求：**
```http
POST /api/v1/auth/login
Authorization: Bearer <api_key>
```

**成功响应（200）：**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expires_at": "2026-06-25T12:00:00Z",
    "expires_in": 3600
  }
}
```

**失败响应（401）：**
```json
{
  "success": false,
  "error": "unauthorized"
}
```

```
handleAuthLogin(w, r):
  ① r.Method != POST → 405
  ② token = extractBearerToken(r)
     if token == "" → token = r.URL.Query().Get("token")
     if token == "" → 401 "unauthorized"
  ③ s.configMu.RLock(); apiKey = s.config.APIKey; s.configMu.RUnlock()
     if apiKey == "" → 401（认证未配置，不消耗限流配额）
  ④ clientAddr = clientIP(r.RemoteAddr)
     if !s.authRateLimit.Allow(clientAddr) → 429 "too many requests"
  ⑤ if token != apiKey:
       s.authRateLimit.Fail(clientAddr)
       log.Warnf("[auth] Login rejected ip=%s reason=api_key_mismatch", clientAddr)
       401 "unauthorized"
  ⑥ jwtToken = generateSessionToken(apiKey)   // 失败 → 500 "failed to generate token"
  ⑦ return { token, expires_at, expires_in }
```

### `/api/v1/auth/refresh` — 刷新端点

**代码位置**：`internal/api/auth_jwt.go#Server.handleAuthRefresh`

**认证**：🔒 非公开，由 authMiddleware 特殊处理

authMiddleware 行为：
- 路径匹配 `isAuthManagementPath` → 允许签名有效（允许过期）的 JWT 通过
- JWT 完全无效（签名错误/格式错误）→ 401

```
handleAuthRefresh(w, r):
  ① r.Method != POST → 405
  ② tokenStr = extractBearerToken(r)
     if tokenStr == "" → r.URL.Query().Get("token")
     if tokenStr == "" → 401
  ③ s.configMu.RLock(); apiKey = s.config.APIKey; s.configMu.RUnlock()
     if apiKey == "" → 401
  ④ clientAddr = clientIP(r.RemoteAddr)
     if !s.authRateLimit.Allow(clientAddr) → 429 "too many requests"
  ⑤ _, err = validateSessionToken(tokenStr, apiKey)
     if err != nil && !isJWTExpiredError(err):
       // 签名无效/格式错误（不是单纯的过期）
       X-Token-Type: invalid
       401
  ⑥ err = enforceMaxRefreshAge(tokenStr, apiKey)
     if err != nil:
       // 签发时间距今超过 jwtMaxRefreshAge（24h）→ 拒绝续期
       X-Token-Type: too-old
       401
  ⑦ // 如果到达这里：JWT 有效或 JWT 过期但签名正确且在续期窗口内 → 允许刷新
  ⑧ jwtToken = generateSessionToken(apiKey)
  ⑨ return { token, expires_at, expires_in }
```

**续期窗口**：`enforceMaxRefreshAge`（`internal/api/auth_jwt.go#enforceMaxRefreshAge`）按 `IssuedAt` 计算，超过 `jwtMaxRefreshAge`（24 小时）的令牌即使签名有效也不再续期，防止被盗令牌无限期续期；连续正常刷新的会话每次都会重新签发（`IssuedAt` 前移），不受此限制。`enforceMaxRefreshAge` 用 `jwt.WithoutClaimsValidation()` 重新解析，因为它需要处理的正是「已过期」这一被 `validateSessionToken` 判为失败的状态。

**关键设计**：JWT 过期后会被 authMiddleware 拦截（返回 401）。为了让客户端能 refresh，`isAuthManagementPath` 在 middleware 中放行签名有效（允许过期）的 JWT。这解决了「鸡生蛋」问题：客户端需要 refresh JWT，但 refresh 端点本身需要有效的 JWT。

### `/api/v1/auth/check` — 检查端点

**代码位置**：`internal/api/auth_jwt.go#Server.handleAuthCheck`

**认证**：🔒 非公开，与 refresh 相同特殊处理

**请求：**
```http
GET /api/v1/auth/check
Authorization: Bearer <jwt_token>
```

**有效 JWT 响应（API Key 已配置）：**
```json
{
  "success": true,
  "data": {
    "authenticated": true,
    "auth_enabled": true,
    "valid": true,
    "expires_at": "2026-06-25T12:00:00Z",
    "expires_in": 3550,
    "needs_refresh": false
  }
}
```

**`needs_refresh` 字段**：当剩余时间小于 `jwtRefreshMargin`（5 分钟）时为 `true`，提示前端主动刷新。

**无 token 但 API Key 已配置：**
```json
{
  "success": true,
  "data": {
    "authenticated": false,
    "auth_enabled": true
  }
}
```

**API Key 未配置（认证未启用）：**
```json
{
  "success": true,
  "data": {
    "authenticated": false,
    "auth_enabled": false
  }
}
```

**过期 token 响应：**
```json
{
  "success": true,
  "data": {
    "authenticated": false,
    "auth_enabled": true,
    "valid": false,
    "expired": true,
    "error": "token expired"
  }
}
```

> `error` 字段的值固定为 `"token expired"`（过期）、`"token invalid"`（签名/格式错误）或 `"too many requests"`（该 IP 触发限流，此时仍返回 HTTP 200 且 `valid: false`），不回传原始 error 字符串。
### 常量定义

**代码位置**：`internal/api/auth_jwt.go` 顶部常量块（`jwtIssuer`/`jwtSubject`/`jwtTokenTTL`/`jwtRefreshMargin`/`jwtMaxRefreshAge`/`jwtSigningCtx`）

```go
const (
    jwtIssuer        = "tmd"
    jwtSubject       = "tmd-session"
    jwtTokenTTL      = 1 * time.Hour
    jwtRefreshMargin = 5 * time.Minute // refresh when less than 5 min remaining
    jwtMaxRefreshAge = 24 * time.Hour
    jwtSigningCtx    = "tmd-jwt-v1" // HMAC derivation context
)
```

| 常量 | 值 | 说明 |
|------|-----|------|
| `jwtIssuer` | `"tmd"` | JWT 签发者标识 |
| `jwtSubject` | `"tmd-session"` | JWT 主题 |
| `jwtTokenTTL` | `1 * time.Hour` | JWT 有效期（3600 秒） |
| `jwtRefreshMargin` | `5 * time.Minute` | 前端 proactive refresh 阈值（`needs_refresh`） |
| `jwtMaxRefreshAge` | `24 * time.Hour` | refresh 链最长时间窗口（按 `IssuedAt` 计） |
| `jwtSigningCtx` | `"tmd-jwt-v1"` | HMAC 密钥派生的 context 标识 |
## 双模式认证详解

### authMiddleware 完整决策树

**代码位置**：`internal/api/middleware.go#Server.authMiddleware`

```
authMiddleware(next, w, r):
  │
  ├─ ① isPublicPath(r.URL.Path)?
  │   └─ true → next.ServeHTTP(w, r)  // 公开路径直接放行
  │
  ├─ ② s.botCallbackPaths 中存在 r.URL.Path?
  │   └─ true → next.ServeHTTP(w, r)  // 已注册 bot 回调精确路径放行
  │
  ├─ ③ s.configMu.RLock()
  │    apiKey = s.config.APIKey
  │    s.configMu.RUnlock()
  │    apiKey == ""?
  │   └─ true → next.ServeHTTP(w, r)  // 认证未配置
  │
  ├─ ④ 提取 token:
  │    token = extractBearerToken(r)
  │    token == "" → token = r.URL.Query().Get("token")
  │    token == "" → writeAuth401(w, "missing"); return  // X-Token-Type: missing
  │
  ├─ ⑤ isAuthManagementPath(r.URL.Path)?
  │   ├─ true: _, err = validateSessionToken(token, apiKey)
  │   │   ├─ err == nil || isJWTExpiredError(err) → next.ServeHTTP ✅
  │   │   └─ else → writeAuth401(w, "invalid"); return  // X-Token-Type: invalid
  │   └─ false → 继续 ↓
  │
  ├─ ⑥ jwtToken, jwtErr = validateSessionToken(token, apiKey)
  │   jwtErr == nil && jwtToken != nil && jwtToken.Valid?
  │   └─ true → next.ServeHTTP(w, r) ✅ (JWT 认证)
  │
  ├─ ⑦ token == apiKey?
  │   └─ true → next.ServeHTTP(w, r) ✅ (原始 Key)
  │
  └─ ⑧ 401 + X-Token-Type:
       if isJWTExpiredError(jwtErr) → X-Token-Type: expired
       else → X-Token-Type: invalid
       writeAuth401(w, "invalid")
```

### 辅助函数

| 函数 | 位置 | 说明 |
|------|------|------|
| `isPublicPath(path)` | `internal/api/middleware.go#isPublicPath` | 检查路径是否在公开白名单中 |
| `isAuthManagementPath(path)` | `internal/api/middleware.go#isAuthManagementPath` | 检查是否为 refresh/check 端点 |
| `extractBearerToken(r)` | `internal/api/middleware.go#extractBearerToken` | 从 `Authorization` 头提取 Bearer token |
| `isJWTExpiredError(err)` | `internal/api/auth_jwt.go#isJWTExpiredError` | 检查错误是否为 JWT 过期 |
| `writeAuth401(w, tokenType)` | `internal/api/middleware.go#writeAuth401` | 写入统一 401 响应 + `WWW-Authenticate` 头 |
| `clientIP(remoteAddr)` | `internal/api/auth_jwt.go#clientIP` | 从 `host:port` 提取纯 IP |
| `enforceMaxRefreshAge(token, key)` | `internal/api/auth_jwt.go#enforceMaxRefreshAge` | refresh 端点校验签发时间窗口 |

### X-Token-Type 响应头

| 值 | 触发条件 | 前端行为 |
|---------|---------|---------|
| `missing` | 未携带任何 token | 弹出认证对话框 |
| `expired` | JWT 已过期但签名有效 | 调用 `/api/v1/auth/refresh` 续期 |
| `invalid` | JWT 签名无效/格式错误/Key 不匹配 | 清除本地凭据，弹出认证对话框 |
| `too-old` | refresh 端点上 JWT 签名有效但签发已超 `jwtMaxRefreshAge`（24h） | 续期被拒 → 走重新登录流程 |

> **注意**：`authMiddleware` 产生的 401 都携带 `X-Token-Type`，值为 `missing`/`invalid`/`expired` 之一；`too-old` 只由 `handleAuthRefresh`（`internal/api/auth_jwt.go#Server.handleAuthRefresh`）显式设置。实现上 `writeAuth401(w, tokenType)`（`internal/api/middleware.go#writeAuth401`）在 tokenType 非空且头未设置时写入该头并统一设置 `WWW-Authenticate: Bearer realm="TMD API"` 与 JSON 错误体；`authMiddleware` 对 expired/invalid 分支先显式设置再调用（`writeAuth401` 不会覆盖），missing 分支（token 为空）由 `writeAuth401` 直接写入。其他端点（如 login 的 401）走普通 `writeError`，不带该头。

### 场景对照表

| # | 场景 | 请求携带 | 中间件行为 | 结果 |
|---|------|---------|-----------|------|
| 1 | 全新客户端 | 无 token | token 为空 → 401 `X-Token-Type: missing` | 弹认证框 |
| 2 | 有 API Key 无 JWT | `Bearer <api_key>` | JWT 验证失败 → `token == apiKey` → 放行 | ✅ 向后兼容 |
| 3 | 有有效 JWT | `Bearer <jwt>` | `validateSessionToken` 成功 → 放行 | ✅ 推荐模式 |
| 4 | JWT 过期 | `Bearer <expired_jwt>` | JWT 验证失败（过期）→ Key 不匹配 → 401 `X-Token-Type: expired` | 前端 refresh |
| 5 | JWT 篡改 | `Bearer <tampered_jwt>` | 签名验证失败 → 401 `X-Token-Type: invalid` | 弹认证框 |
| 6 | API Key 变更后旧 JWT | `Bearer <old_jwt>` | 派生密钥不同→签名验证失败→401 `X-Token-Type: invalid` | 弹认证框，旧 JWT 自动失效 |
| 7 | 认证未配置 | 任何 | `apiKey == ""` → 放行 | ✅ 无认证 |
| 8 | auth/refresh 有过期 JWT | `Bearer <expired_jwt>` | `isAuthManagementPath` → JWT 签名有效（允许过期）→ 放行 | ✅ handler 签发新 JWT |
| 9 | auth/refresh 有无效 JWT | `Bearer <tampered>` | `isAuthManagementPath` → 签名无效 → 401 `X-Token-Type: invalid` | ❌ 拒绝 |
| 10 | auth/check 无 token | 无 | token 为空 → `writeAuth401("missing")`（带 `X-Token-Type: missing`） | 401 |
| 11 | auth/check 有有效 JWT | `Bearer <jwt>` | `isAuthManagementPath` → JWT 有效 → 放行 | ✅ handler 返回状态 |
| 12 | 已注册 bot 回调 | 第三方平台自带签名（无 TMD Bearer） | `s.botCallbackPaths` 精确命中 → 放行（不校验 TMD token） | ✅ 回调由平台 `verify_token`/`encrypt_key` 自校验 |
| 13 | auth/refresh 有签发过久的 JWT | `Bearer <stale_jwt>` | 签名有效但 `enforceMaxRefreshAge` 失败 → 401 `X-Token-Type: too-old` | ❌ 拒绝，需重新 login |

### 前端 401 处理策略

```
客户端收到 HTTP 401:
  │
  ├─ localStorage 有 tmd_jwt_token？
  │   ├─ 是 → 调用 POST /api/v1/auth/refresh
  │   │       ├─ 成功 → 新 JWT 存入 localStorage → 重试原请求 ✅
  │   │       └─ 失败 → 弹出认证对话框
  │   └─ 否 → 直接弹出认证对话框
  │
  └─ 用户在对话框中输入 API Key:
       └─ 调用 POST /api/v1/auth/login
           ├─ 成功 → 存 JWT + 过期时间 → reload 页面 ✅
           └─ 失败 → 显示错误信息
```

---

## 公开路径白名单

**代码位置**：`internal/api/middleware.go#publicPathPrefixes`，判定逻辑在 `internal/api/middleware.go#isPublicPath`

```go
var publicPathPrefixes = []string{
    "/api/v1/health",
    "/api/v1/auth/login",   // login 端点需要在没有 JWT 时也能被调用
    "/api/v1/config/theme", // theme 切换器由内联 JS 调用，不经过 api 对象
    "/static/",
}
```

> 注意 `publicPathPrefixes` 是**前缀**匹配（`strings.HasPrefix`），因此 `/api/v1/config/theme` 同时放行了 `/api/v1/config/theme` 与 `/api/v1/config/themes`。`/`、`/favicon.ico` 与 5 个 SPA 页面路由（`/tasks`、`/data`、`/schedules`、`/system`、`/logs`）是精确匹配，写死在 `isPublicPath` 中。

### 完整公开路径列表

| 路径 | 方法 | 说明 | 安全设计 |
|------|------|------|---------|
| `/` | GET | Web UI 首页 | SPA 入口，必须公开 |
| `/favicon.ico` | GET | 浏览器图标 | 自动请求 |
| `/tasks` | GET | SPA 页面路由 | 必须公开（JS 加载后弹认证框） |
| `/data` | GET | SPA 页面路由 | 同上 |
| `/schedules` | GET | SPA 页面路由 | 同上 |
| `/system` | GET | SPA 页面路由 | 同上 |
| `/logs` | GET | SPA 页面路由 | 同上 |
| `/api/v1/health` | GET | 健康检查 | Docker healthcheck、负载均衡 |
| `/api/v1/auth/login` | POST | JWT 登录 | **有速率限制**（5次/分钟/IP） |
| `/api/v1/config/theme` | GET/POST | 主题切换 | 内联 JS 直调，无法经 api 对象 |
| `/api/v1/config/themes` | GET | 主题列表 | 主题切换器使用 |
| `/static/*` | GET | 静态资源 | CSS/JS 需要加载才能执行 |

### 不公开但特殊处理的路径

| 路径 | 方法 | 说明 | 处理方式 |
|------|------|------|---------|
| `/api/v1/auth/refresh` | POST | JWT 刷新 | middleware 内放行签名有效（允许过期）的 JWT |
| `/api/v1/auth/check` | GET | JWT 状态查询 | 同上 |

### Bot 回调精确路径豁免

第三方平台（Feishu 等）的 HTTP 回调不会携带 TMD 的 Bearer token，也无法携带（事件真实性由平台侧的 `verify_token`/`encrypt_key` 校验）。因此 `authMiddleware` 在读取 API Key **之前**先查 `s.botCallbackPaths`：

- 只有**实际注册**的回调路径（`RegisterBotCallback` 时写入 `s.botCallbackPaths`，见 `internal/api/server.go#Server.RegisterBotCallback`）被放行；
- 不按宽泛的 `/api/v1/bot/` 前缀放行，未注册的 bot 路径仍然要求认证。

### 为什么 Web UI 页面需要免认证？

SPA 的认证流程：页面加载 → JS 执行 → 发现 API 返回 401 → 弹认证对话框 → 用户输入 Key → localStorage 存储 → 后续请求携带 token。

如果页面本身需要认证才能加载，用户将**永远看不到登录界面**（经典的「鸡生蛋」问题）。

---

## SSE 端点的特殊处理

### 问题

浏览器 `EventSource` API 无法设置自定义 HTTP 头：

```javascript
// ❌ EventSource 忽略自定义头
const es = new EventSource('/api/v1/sse/tasks', {
    headers: { 'Authorization': 'Bearer xxx' }
});
```

### 解决方案

SSE 端点支持 `?token=` 查询参数作为认证回退：

```javascript
// ✅ SSM: 使用查询参数
const token = localStorage.getItem('tmd_jwt_token') || '';  // 只有 JWT，无 API Key
const es = new EventSource('/api/v1/sse/tasks?token=' + encodeURIComponent(token));
```

authMiddleware 中 token 提取优先级：

1. `Authorization` HTTP 头（首选）
2. `r.URL.Query().Get("token")`（回退，用于 SSE）

### 受影响的 SSE 端点

| 端点 | 用途 | 公开？ | 认证方式 |
|------|------|--------|---------|
| `GET /api/v1/sse/tasks` | 任务状态、调度状态实时推送 | 🔒 受保护 | `?token=<jwt>` 或 `Authorization` 头 |
| `GET /api/v1/logs/stream` | 日志实时流 | 🔒 受保护 | `?token=<jwt>` + `&level=&q=` |

### SSE 断线重连 + JWT 过期处理（web1）

**代码位置**：`internal/api/web/web1/app.js` 的 `sseManager.conn.onerror`（`sseManager` 对象内）与顶层函数 `tryRefreshJWT`、`sseManager._scheduleReconnect`

```
SSE onerror:
  ① conn.close(); conn = null
  ② 若已连接过 → 更新状态与指示器；reconnectDisabled / 关停页 → 直接 return
  ③ reconnectAttempts++
     若 reconnectAttempts >= 10 且 % 5 == 0 → api.getHealth() 探活（失败仅告警，继续重试）
  ④ tryRefreshJWT('SSE', cb):
     有 JWT 且 2 分钟内将过期 → api._tryRefreshJWT() 预刷新
     否则（无 JWT / 剩余时间充足）→ 直接回调
  ⑤ 回调 _scheduleReconnect(): 无论刷新结果如何，指数退避重连
     （delay = min(baseReconnectDelay * 2^(attempts-1), maxReconnectDelay)）
```

**重要**：web2 的 SSE 在 `onerror` 中已内置完整 JWT 刷新逻辑（`internal/api/web/web2/app.js#connectSSE` 的 `sseSource.onerror`）：先调用 `API._tryRefreshJWT()`，成功则指数退避重连；失败再用 `auth/check` 探测——401 表示会话失效弹认证框，网络错误表示服务器暂时不可达则静默重连。web3 同构（`internal/api/web/web3/app.js#connectSSE`）。

---

## API 使用示例

### 前提

假设 `conf.yaml` 中配置了 `api_key: "my-secret-key-123"`，Server 运行在 `http://localhost:25556`。

### 1. JWT 完整登录流程（推荐）

```bash
# Step 1: 用 API Key 换取 JWT
JWT=$(curl -s -X POST http://localhost:25556/api/v1/auth/login \
  -H "Authorization: Bearer my-secret-key-123" | jq -r '.data.token')

# Step 2: 用 JWT 访问 API
curl -H "Authorization: Bearer $JWT" \
  http://localhost:25556/api/v1/tasks

# Step 3: JWT 过期前刷新
NEW_JWT=$(curl -s -X POST http://localhost:25556/api/v1/auth/refresh \
  -H "Authorization: Bearer $JWT" | jq -r '.data.token')

# Step 4: 检查 JWT 状态
curl http://localhost:25556/api/v1/auth/check \
  -H "Authorization: Bearer $NEW_JWT"
```

### 2. 直接使用 API Key（向后兼容）

```bash
curl -H "Authorization: Bearer my-secret-key-123" \
  http://localhost:25556/api/v1/tasks
```

### 3. 未认证请求（401）

```bash
curl http://localhost:25556/api/v1/tasks
```

**预期**：
```
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer realm="TMD API"
X-Token-Type: missing
Content-Type: application/json

{"success":false,"error":"unauthorized"}
```

### 4. 错误 Token

```bash
curl -H "Authorization: Bearer wrong-key" http://localhost:25556/api/v1/tasks
```
→ HTTP 401

### 5. 缺少 Bearer 前缀

```bash
curl -H "Authorization: my-secret-key-123" http://localhost:25556/api/v1/tasks
```

→ HTTP 401（`extractBearerToken` 要求 `"Bearer "` 前缀）

### 6. 公开路径（免认证）

```bash
curl http://localhost:25556/api/v1/health
curl http://localhost:25556/
curl http://localhost:25556/static/app.js
```

→ HTTP 200，无需携带 token

### 7. SSE 实时推送（带 token）

```bash
# 用 JWT
JWT=$(curl -s -X POST -H "Authorization: Bearer my-secret-key-123" \
  http://localhost:25556/api/v1/auth/login | jq -r '.data.token')
curl -N "http://localhost:25556/api/v1/sse/tasks?token=$JWT"
```

### 8. 日志流（带 token）

```bash
curl -N "http://localhost:25556/api/v1/logs/stream?token=$JWT&level=info"
```

### 9. CORS 预检请求

```bash
curl -X OPTIONS \
  -H "Origin: http://example.com" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: authorization" \
  http://localhost:25556/api/v1/tasks
```

→ HTTP 204，**无需 token**（CORS 在内层 auth 之前处理 OPTIONS）

---

## 前端认证流程

### localStorage 中存储的键

| 键名 | 类型 | 说明 | 写入时机 |
|------|------|------|---------|
| `tmd_jwt_token` | string | JWT 令牌 | login/refresh 成功后 |
| `tmd_jwt_expiry` | string | RFC3339 过期时间 | login/refresh 成功后 |

**注意**：前端**不存储**原始 API Key（`tmd_api_key` 键不存在于任何主题中）。这是安全设计——API Key 仅在登录时通过 HTTPS 提交给 login 端点，后续所有请求使用 JWT。

### 首次加载（无认证凭据）

```
浏览器打开 http://localhost:25556/
  │
  ├─ ① 页面 HTML/JS/CSS 加载 ✅（公开路径）
  │
  ├─ ② SSE 连接: EventSource('/api/v1/sse/tasks?token=') → 401
  │     (无 JWT，token 为空)
  │
  ├─ ③ api.getTasks() → fetch('/api/v1/tasks') → 401
  │     Error: { status: 401, message: 'unauthorized' }
  │
  ├─ ④ unhandledrejection 捕获 401
  │     localStorage 无 tmd_jwt_token → showAuthDialog()
  │
  ├─ ⑤ 认证对话框弹出
  │     用户输入 API Key
  │
  ├─ ⑥ submitAuthKey():
  │     fetch POST /api/v1/auth/login { Authorization: Bearer <key> }
  │     │
  │     ├─ 成功:
  │     │   localStorage.setItem('tmd_jwt_token', json.data.token)
  │     │   localStorage.setItem('tmd_jwt_expiry', json.data.expires_at)
  │     │   window.location.reload()
  │     │
  │     └─ 失败:
  │       显示错误信息 ("登录失败: xxx")
  │
  └─ ⑦ 页面刷新后:
       localStorage 有 JWT
       SSE: /api/v1/sse/tasks?token=<jwt> → 200 ✅
       API: Authorization: Bearer <jwt> → 200 ✅
```

### JWT 过期自动恢复

```
进行中的 API 请求 → 服务端返回 HTTP 401
  │
  ├─ localStorage 有 tmd_jwt_token？
  │   ├─ 是 → api._tryRefreshJWT()
  │   │       ├─ 成功 → 更新 localStorage
  │   │       │        重试原请求（用新 JWT）✅
  │   │       └─ 失败 → showAuthDialog()
  │   └─ 否 → showAuthDialog()
  │
  └─ 全局兜底: unhandledrejection 事件监听
       (捕获任何未被 try/catch 的 401)
```

### 定期主动刷新

```
页面加载 → 设置 setInterval(45 分钟):
  │
  每次触发:
  ├─ localStorage 有 tmd_jwt_token？
  │   ├─ 是 → refreshJWTIfNeeded():
  │   │        剩余 > 30 分钟 → 跳过（避免无谓请求）
  │   │        否则 → api._tryRefreshJWT()（静默刷新）
  │   └─ 否 → 跳过
  │
  └─ 注意: 首次刷新不由 setInterval 触发
       (避免与 init() 中的 API 调用重复)
       第一个 API 请求的 401 处理会触发首次 refresh
```

### API Key 变更时的 JWT 失效

```
用户在 Web UI 配置编辑页修改 api_key
  │
  ├─ 调用 PUT /api/v1/config/fields { "api_key": "new-key" }
  │   └─ 保存成功
  │       ├─ 服务端 *s.config = *newConf（立即生效）
  │       └─ 前端检测到 api_key 变更:
  │           clearStoredAuth()  // 移除 tmd_jwt_token / tmd_jwt_expiry
  │
  └─ 用户下次 API 请求:
       ├─ 无 JWT → 无 Authorization 头
       ├─ 服务端返回 401 "missing"
       └─ 前端弹出认证对话框 → 用户用新 Key 重新 login
```

### Security 标签页（系统设置 → 🔐 安全认证）

web1（`internal/api/web/web1/app.js#renderSecurityEditor`）与 web2（`internal/api/web/web2/app.js#renderSecurityEditor`）都在系统设置里提供独立的安全认证面板；web3 同构（`getJWTStatus`/`secLogin`/`secClear`）。

| 功能 | 说明 |
|------|------|
| **JWT 状态指示** | 绿色「✅ JWT active (expires in ~X min)」或红色「❌ JWT expired」（web1：`getJWTStatusHTML`） |
| **Login & Save** | 输入 API Key → 调用 login 端点 → 存 JWT（web1：`secLogin`） |
| **Test Connection** | 直接用 API Key 测试服务端连接（绕过 API 客户端的 401 处理；web1：`secTest`） |
| **Clear** | 清除所有本地凭据（JWT + expiry；web1：`secClear` → `clearStoredAuth`） |
| **Refresh Session** | 手动刷新 JWT（web1：`secRefresh`；web2：`refreshSecJWT`） |

> 历史说明：早期版本 web1 没有独立安全面板，管理功能合并至配置编辑页；当前 web1 已提供「🔐 安全认证」标签。

---

## 前端 JWT 集成详解

### web1 主题实现（经典主题）

**文件**：`internal/api/web/web1/app.js`

#### API 客户端（`api.request`）

**符号位置**：`internal/api/web/web1/app.js` 中对象 `api` 的方法 `api.request`

**Authorization 注入**：
```javascript
// 注入 Authorization 头（使用 JWT 会话令牌）
const jwt = localStorage.getItem('tmd_jwt_token');
if (jwt) {
  options.headers = { ...options.headers, 'Authorization': 'Bearer ' + jwt };
}
// 无 API Key fallback - 前端不存储原始 Key
```

**401 自动刷新**：
```javascript
if (res.status === 401) {
  const tokenType = res.headers.get('X-Token-Type') || '';
  const haveJWT = !!localStorage.getItem('tmd_jwt_token');
  if (haveJWT && tokenType !== 'invalid' && tokenType !== 'missing') {
    const refreshed = await this._tryRefreshJWT();
    if (refreshed && !extra._retried) {
      // _retried 标志：刷新后仍 401 时不再递归，防止无限重试
      return this.request(method, path, body, { ...extra, _retried: true });
    }
  }
  const authErr = makeUnauthorizedError(tokenType);   // 顶层函数，按 X-Token-Type 生成提示
  requireAuthentication(authErr);                     // clearStoredAuth() + 弹出认证对话框
  throw authErr;
}
```

**`api._tryRefreshJWT`**（符号位置：`api._tryRefreshJWT` 与 `api._doRefreshJWT`）：
```javascript
async _tryRefreshJWT() {
  // _refreshPromise 去重：并发的多个 401 共享同一个刷新请求
  if (this._refreshPromise) return this._refreshPromise;
  this._refreshPromise = this._doRefreshJWT().finally(() => { this._refreshPromise = null; });
  return this._refreshPromise;
},
async _doRefreshJWT() {
  const oldJWT = localStorage.getItem('tmd_jwt_token');
  if (!oldJWT) return false;
  const { signal, controller } = this._getAbortSignal();
  const timer = setTimeout(() => controller.abort(), 30000);   // 30 秒超时
  const res = await fetch(this.base + '/api/v1/auth/refresh', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + oldJWT },
    signal
  });
  if (!res.ok) return false;
  const json = await res.json();
  if (!json.success || !json.data || !json.data.token) return false;
  localStorage.setItem('tmd_jwt_token', json.data.token);
  if (json.data.expires_at) localStorage.setItem('tmd_jwt_expiry', json.data.expires_at);
  else localStorage.removeItem('tmd_jwt_expiry');
  return true;
}
```

**SSE 连接**（符号位置：`sseManager._tokenParam`，内部调用顶层函数 `appendJWTToken`）：
```javascript
_tokenParam() {
  const p = new URLSearchParams();
  appendJWTToken(p);   // 有 JWT 时执行 p.append('token', jwt)
  const qs = p.toString();
  return qs ? '?' + qs : '';
}
```

**SSE onerror JWT 保护**（符号位置：`sseManager` 的 `conn.onerror` + 顶层函数 `tryRefreshJWT`）：
```javascript
this.conn.onerror = () => {
  // ... 关闭连接、更新状态、必要时（attempts>=10 且 %5==0）探活 ...
  tryRefreshJWT('SSE', () => this._scheduleReconnect());
};

// 顶层函数：仅当 JWT 将在 2 分钟内过期时才预刷新，否则直接回调
function tryRefreshJWT(label, done) {
  const token = localStorage.getItem('tmd_jwt_token');
  if (!token) { done(false); return; }
  const expiry = localStorage.getItem('tmd_jwt_expiry');
  if (!expiry || new Date(expiry) - new Date() >= 2 * 60 * 1000) { done(false); return; }
  api._tryRefreshJWT().then(refreshed => { done(refreshed); });
}
```

**认证对话框提交**（符号位置：`internal/api/web/web1/app.js` 顶层函数 `submitAuthKey`）：
```javascript
const res = await fetch('/api/v1/auth/login', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer ' + key }
});
const json = await res.json();
if (!res.ok || !json.success || !json.data || !json.data.token) {
  throw new Error(json.error || '认证失败');
}
localStorage.setItem('tmd_jwt_token', json.data.token);
if (json.data.expires_at) localStorage.setItem('tmd_jwt_expiry', json.data.expires_at);
else localStorage.removeItem('tmd_jwt_expiry');
setTimeout(() => { window.location.reload(); }, 300);
```

**配置保存 JWT 清理**（符号位置：顶层函数 `clearStoredAuth`，在配置保存流程中调用）：
```javascript
if (fields['api_key'] && fields['api_key'] !== '__KEEP_OLD__') {
  // API Key 变更 → 旧 JWT 已失效 → 清除
  clearStoredAuth();   // 移除 tmd_jwt_token / tmd_jwt_expiry
}
```

**初始化定时刷新**（符号位置：`startJWTRefreshLoop` 与 `refreshJWTIfNeeded`）：
```javascript
function refreshJWTIfNeeded() {
  const jwt = localStorage.getItem('tmd_jwt_token');
  if (!jwt) return;
  // 仅在 JWT 剩余不足 30 分钟时才刷新，避免无谓的网络请求
  const expiry = localStorage.getItem('tmd_jwt_expiry');
  if (expiry && new Date(expiry) - new Date() > 30 * 60 * 1000) return;
  api._tryRefreshJWT();
}

function startJWTRefreshLoop() {
  _jwtRefreshInterval = setInterval(refreshJWTIfNeeded, 45 * 60 * 1000);
}
```

### web2 主题实现（精简主题）

**文件**：`internal/api/web/web2/app.js`

#### API 客户端（`API._fetch`）

**符号位置**：`internal/api/web/web2/app.js` 中对象 `API` 的方法 `API._fetch`

```javascript
async _fetch(url, options) {
  const jwt = localStorage.getItem('tmd_jwt_token');
  if (jwt) {
    if (!options) options = {};
    if (!options.headers) options.headers = {};
    options.headers['Authorization'] = 'Bearer ' + jwt;
  }
  try {
    const r = await fetchWithTimeout(url, { ...options });  // 30s 超时内置
    if (r.status === 401) {
      if (jwt) {
        const refreshed = await API._tryRefreshJWT();
        if (refreshed) {
          const newToken = localStorage.getItem('tmd_jwt_token');
          const retryOpts = { ...options };
          if (retryOpts.headers) retryOpts.headers['Authorization'] = 'Bearer ' + newToken;
          const r2 = await fetchWithTimeout(url, retryOpts);
          if (r2.status !== 401) return r2;
        }
        // 刷新失败：用 auth/check 区分「会话失效（401 → 清 token 弹框）」与「网络抖动（保留 token）」
        const probe = await fetchWithTimeout(apiBase() + '/api/v1/auth/check',
          { headers: { 'Authorization': 'Bearer ' + jwt } }).catch(() => null);
        if (probe && probe.status === 401) {
          localStorage.removeItem('tmd_jwt_token');
          localStorage.removeItem('tmd_jwt_expiry');
          showAuthDialog('Session expired - please re-authenticate');
        }
      }
      const authErr = new Error('unauthorized');
      authErr.status = 401;
      throw authErr;
    }
    return r;
  } catch(e) { /* ... */ }
}
```

**`_tryRefreshJWT`**（符号位置：`API._tryRefreshJWT` 与 `API._doRefreshJWT`）：
```javascript
async _tryRefreshJWT() {
  // Deduplicate concurrent refresh attempts
  if (this._refreshPromise) return this._refreshPromise;
  this._refreshPromise = this._doRefreshJWT().finally(() => { this._refreshPromise = null; });
  return this._refreshPromise;
},
async _doRefreshJWT() {
  const oldJWT = localStorage.getItem('tmd_jwt_token');
  if (!oldJWT) return false;
  const r = await fetchWithTimeout(apiBase() + '/api/v1/auth/refresh', {  // fetchWithTimeout 自带 30s 超时
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + oldJWT }
  });
  if (!r.ok) return false;
  const j = await r.json();
  if (!j.success || !j.data || !j.data.token) return false;
  localStorage.setItem('tmd_jwt_token', j.data.token);
  if (j.data.expires_at) localStorage.setItem('tmd_jwt_expiry', j.data.expires_at);
  return true;
}
```

### 两主题对比

| 特性 | web1 | web2 |
|------|------|------|
| API 客户端 | `api.request()` 统一 JSON 解析 | `API._fetch()` 各自处理 JSON |
| 401 重试 | 递归调用 `this.request()` | 直接构造新请求 |
| JWT 刷新超时 | `AbortController` 30s ✅ | `fetchWithTimeout` 30s ✅ |
| SSE token | `sseManager._tokenParam()` | `sseJWT()`（`connectSSE` 拼 `?token=` 参数） |
| SSE onerror JWT 刷新 | ✅ `tryRefreshJWT` < 2min 时触发 | ✅ `API._tryRefreshJWT()` + auth/check 探测（`internal/api/web/web2/app.js#connectSSE`） |
| 认证弹窗 | 硬编码 HTML（`index.html`） | 动态 `openModal()` |
| 弹窗提交 | `async/await` | `async/await` ✅ |
| Security 标签 | 独立 `renderSecurityEditor()`（🔐 安全认证） | 独立 `renderSecurityEditor()` |
| 主动 auth 检查 | 无（依赖 401 触发） | `checkAuth()` 函数 |
| 登录后存 API Key | ❌ 不存 | ❌ 不存 |

> **web3 主题**：`internal/api/web/web3/app.js` 同样集成了 JWT（`API.request` 注入 Bearer、`API._tryRefreshJWT`/`API._doRefreshJWT` 刷新、`ENDPOINTS.authLogin/authCheck`、`getJWTStatus`、`secLogin`/`secClear`、SSE `?token=` 与 `auth/check` 探测），行为与 web2 同构，仅实现细节不同（refresh 请求同时带 JSON body `{token}`）。三套主题的默认与切换见 `internal/api/handlers.go`。

---

## 配置持久化与生效机制

### API Key 的存储与生效

| 修改方式 | 生效时机 | 说明 |
|---------|---------|------|
| Web UI 配置编辑 → 简易模式 | **立即生效** | `PUT /api/v1/config/fields` → 更新内存 `*s.config` + 写入 `conf.yaml` |
| Web UI 配置编辑 → YAML 模式 | **立即生效** | `PUT /api/v1/config/raw` → 同上路径 |
| 直接编辑 `conf.yaml` | 需重启 | 程序不监听文件变化 |
| 环境变量 `TMD_API_KEY` | 需重启 | 只在启动时读取 |

### JWT 的生命周期

JWT 不持久化到任何服务端存储——它是**无状态**的：

```
API Key (conf.yaml)
  │
  ├─ deriveJWTSecret(apiKey)
  │    └─ HMAC-SHA256("tmd-jwt-v1", api_key) → jwt_secret
  │
  ├─ generateSessionToken(apiKey)
  │    └─ jwt.NewWithClaims(HS256, claims) + jwt_secret → JWT String
  │
  ├─ validateSessionToken(token, apiKey)
  │    └─ deriveJWTSecret(apiKey) → 验证 JWT 签名
  │         └─ 签名匹配 + 未过期 + iss/sub 正确 → 通过 ✅
  │
  └─ API Key 变更:
       └─ deriveJWTSecret(newKey) 产生不同的 jwt_secret
            └─ 所有旧 JWT 签名验证失败 → 自动失效 ✅
```

**关键结论**：
- JWT 验证**不依赖数据库**，纯计算验证
- JWT 无法单独撤销，但**变更 API Key 可以使所有 JWT 立即失效**
- JWT 过期时间 1 小时，clock skew 容忍 30 秒
- refresh 续期窗口最长 24 小时（`jwtMaxRefreshAge`，按 `IssuedAt` 计）：超过该窗口的令牌即使签名有效也不能再续期，这限制了被盗令牌的存活上限

---

## 环境变量覆盖

### TMD_API_KEY

| 属性 | 值 |
|------|-----|
| 环境变量名 | `TMD_API_KEY` |
| 覆盖目标 | `Config.APIKey` |
| 优先级 | 环境变量 > `conf.yaml` |
| 生效时机 | 仅启动时（需重启） |

```bash
# Linux/Mac
export TMD_API_KEY="env-key-456"
./tmd -server

# Windows (CMD)
set TMD_API_KEY=env-key-456
tmd.exe -server

# Windows (PowerShell)
$env:TMD_API_KEY="env-key-456"
.\tmd.exe -server

# Docker
docker run -e TMD_API_KEY="env-key-456" ...
```

**使用场景**：
- Docker 容器部署时通过 `-e TMD_API_KEY=xxx` 注入
- CI/CD 流水线中通过环境变量管理密钥
- 不想将 Key 写入配置文件的情况

---

## 安全注意事项

### 1. API Key 强度

- **最小长度建议**：16 个字符以上
- **推荐格式**：使用随机字符串（字母+数字+特殊字符）
- **生成示例**：
  ```bash
  # Linux/Mac
  openssl rand -base64 32
  
  # Windows (PowerShell)
  [Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
  ```

### 2. 传输安全

- ⚠️ **API Key 通过 HTTP Header 明文传输**。公网部署**必须使用 HTTPS**，否则 Key 可被中间人截获
- **反向代理方案**（推荐）：Nginx/Caddy 反向代理终止 TLS，将请求转发到 TMD 本机
- **同机使用**：localhost 使用时流量不出本机，HTTP 风险可控

### 3. JWT vs API Key 安全对比

| 方面 | 原始 API Key | JWT Session Token |
|------|-------------|-------------------|
| 传输频率 | 每次请求携带完整 Key | 每次请求携带 JWT（1h 有效） |
| 泄露影响 | Key 永久有效，需修改 `conf.yaml` | 1 小时后自动失效，且最多续期 24 小时 |
| 撤销方式 | 修改 `conf.yaml`（影响所有客户端） | 等待过期/超出续期窗口，或修改 API Key |
| 签名密钥 | 不适用 | `HMAC("tmd-jwt-v1", api_key)` 派生 |
| 前端存储 | 不存 localStorage | 存 `tmd_jwt_token` + `tmd_jwt_expiry` |

### 4. Key 轮换

- 定期更换 API Key（如每 90 天）
- 更换后 JWT 全部自动失效（派生密钥已变）
- 用户需重新 login 获取新 JWT
- Web UI 配置编辑保存时，前端自动清除本地过期 JWT

### 5. 日志安全

API Key 和 JWT **不会**出现在 TMD 的请求日志中：

```go
// loggingMiddleware 只记录：方法、日志安全化的请求目标、状态码、耗时、IP
log.StandardLogger().Logf(apiAccessLogLevel(r.Method, rr.statusCode),
    "[api] %s %s status=%d dur=%s ip=%s",
    r.Method, logging.RequestTarget(r), rr.statusCode, time.Since(start), clientIP(r.RemoteAddr))
```

**不记录**：请求头、请求体。

**查询参数会被记录但先脱敏**：`logging.RequestTarget` → `logging.SanitizeURL` 会对敏感查询参数（如 `?token=`）做掩码后再写入日志，并非整段丢弃（`internal/logging/sanitize.go#RequestTarget`）。SSE 的 `?token=<jwt>` 因此不会明文落盘。

### 6. 登录速率限制

**代码位置**：`internal/api/auth_jwt.go#authRateLimiter`（`Allow`/`Fail`/`cleanupExpired`/`startCleanupLoop`）

```go
type authRateLimiter struct {
    mu       sync.Mutex
    attempts map[string]*rateLimitEntry  // key: 纯 IP（不含端口）
}

const (
    maxLoginAttempts = 5               // 同一 IP 最多 5 次失败
    loginWindow      = 1 * time.Minute // 计数窗口
)
```

| 属性 | 值 |
|------|-----|
| 限制粒度 | 纯 IP（`clientIP` 用 `net.SplitHostPort` 提取，排除端口） |
| 失败次数 | 同一 IP 最多 5 次/分钟（`Allow` 返回 false → 429） |
| 成功不计 | 只有登录失败调用 `Fail()` 累加计数 |
| 窗口语义 | **固定窗口**：距 `windowStart` 超过 `loginWindow` 后重置计数（非滑动窗口） |
| 生效端点 | login、refresh、check 都会先调用 `Allow`；但只有 login 会 `Fail` |
| 过期清理 | `startCleanupLoop()` 每 5 分钟调用 `cleanupExpired()` 删除过期条目 |
| 数据存储 | 内存 `map[string]*rateLimitEntry`（服务重启重置） |
| 生命周期 | `Stop()` 可重复调用（关闭 `stopCh`），Server 关闭时停止清理协程 |

### 7. 不适用于 CLI 模式

认证层仅影响 HTTP API Server 模式（`-server` 参数）。CLI 模式不走 HTTP，不受影响。

### 8. 已知限制

| 限制 | 说明 |
|------|------|
| 仅 Bearer 方案 | HTTP Basic Auth、Digest Auth 不支持 |
| 无多用户/角色 | 所有认证用户拥有相同完全访问权限 |
| 无 JWT 撤销列表 | 不实现 CRL（Certificate Revocation List），通过 API Key 变更间接撤销；另有 `jwtMaxRefreshAge`（24h）限制续期链长度 |
| Web UI 原始 API Key 不持久 | 前端不存储 Key，登录弹窗每次需重新输入（JWT 有效期内无需重复登录） |

---

## 实现参考

### 核心文件

| 文件 | 说明 | 关键符号 |
|------|------|--------|
| `internal/api/middleware.go` | `authMiddleware()` 双模式认证、`isPublicPath()` 白名单、`extractBearerToken()` token提取、`writeAuth401()` 401响应、`isAuthManagementPath()` 特殊路径 | `Server.authMiddleware`、`isPublicPath`、`publicPathPrefixes`、`extractBearerToken`、`writeAuth401`、`isAuthManagementPath`、`loggingMiddleware`、`securityHeadersMiddleware` |
| `internal/api/auth_jwt.go` | `deriveJWTSecret()` 密钥派生、`generateSessionToken()` 签发、`validateSessionToken()` 验证、`enforceMaxRefreshAge()` 续期窗口、`handleAuthLogin/Refresh/Check` 三个 handler、`authRateLimiter` 登录速率限制 | `deriveJWTSecret`、`generateSessionToken`、`validateSessionToken`、`enforceMaxRefreshAge`、`Server.handleAuthLogin`、`Server.handleAuthRefresh`、`Server.handleAuthCheck`、`authRateLimiter`、`clientIP`、`isJWTExpiredError`、`tokenResponsePayload` |
| `internal/api/server.go` | `Server` 结构体、`buildHandler()` 路由注册和中间件链注入、`shutdownMutationMiddleware()`、`GracefulShutdown()` | `Server`、`buildHandler`、`shutdownMutationMiddleware`、`Server.RegisterBotCallback`、`Server.GracefulShutdown`、`defaultShutdownDrainTimeout` |
| `internal/config/config.go` | `Config.APIKey` 字段、`GetFieldDefs()` 注册 api_key（含最短 8 字符校验）、`NormalizeLoadedConf()` 清理空白 | `Config`、`GetFieldDefs`、`NormalizeLoadedConf` |
| `internal/api/config_handlers.go` | `buildConfigFieldMeta()` api_key UI 映射、`__KEEP_OLD__`/`__CLEAR__` sentinel、`isMaskedValue()` 掩码值拒绝、api_key 变更立即生效提示 | `buildConfigFieldMeta`、`handleSaveConfigFields`、`isMaskedValue`、`maskSensitive` |
| `internal/api/handlers.go` | `TMD_DEV=1` 本地 web 目录开发模式、主题列表 | `devWebRoot`、`listThemes`、`Server.handleGetThemes` |
| `internal/api/web/web1/app.js` | web1 JWT 集成：`api.request`/`api._tryRefreshJWT`/`api._doRefreshJWT`/`sseManager._tokenParam`/`tryRefreshJWT`/`submitAuthKey`/`clearStoredAuth`/`startJWTRefreshLoop` | 同左 |
| `internal/api/web/web2/app.js` | web2 JWT 集成：`API._fetch`/`API._tryRefreshJWT`/`API._doRefreshJWT`/`sseJWT`/`connectSSE`/`renderSecurityEditor`/`submitAuthKey`/`checkAuth` | 同左 |
| `internal/api/web/web3/app.js` | web3 JWT 集成：`API.request`/`API._tryRefreshJWT`/`ENDPOINTS.authLogin`/`getJWTStatus`/`secLogin`/`secClear`/`connectSSE` | 同左 |
| `internal/logging/sanitize.go` | `MaskSecret()` 指纹掩码、`RequestTarget()` 日志安全 URL | `MaskSecret`、`RequestTarget`、`SanitizeURL` |
| `go.mod` | `github.com/golang-jwt/jwt/v5 v5.3.1`（15k+ 项目依赖） | `require` 块 |

### 单元测试

主要测试文件：`internal/api/middleware_test.go`（1226 行）；另有 `internal/api/auth_refresh_age_test.go`、`internal/api/middleware_bot_auth_test.go`。

#### API Key 基础认证测试（10 个）

| 测试函数 | 覆盖内容 |
|---------|---------|
| `TestIsPublicPath` | 25 个路径的公开/非公开判断（含 `/api/v1/auth/login` 公开） |
| `TestExtractBearerToken` | 7 种 Authorization 头格式（标准/缺失/小写/空/复杂） |
| `TestAuthMiddleware_NoKey_PassesThrough` | `api_key == ""` 时全放行 |
| `TestAuthMiddleware_CorrectBearerToken_Succeeds` | 正确 API Key → 200 |
| `TestAuthMiddleware_WrongBearerToken_Returns401` | 4 种错误 token → 401 + JSON + header |
| `TestAuthMiddleware_SSEQueryParam_Succeeds` | `?token=` → 200 |
| `TestAuthMiddleware_PublicPaths_BypassAuth` | 13 个公开路径绕过认证 |
| `TestAuthMiddleware_ProtectedPaths_RequireAuth` | 8 个受保护路径要求认证 |
| `TestAuthMiddleware_BuildHandlerIntegration` | 完整中间件链集成（公开/API/无 token/带 token） |
| `TestAuthMiddleware_OPTIONS_PreflightPasses` | OPTIONS 预检绕过 auth |

#### JWT 认证测试（13 个）

| 测试函数 | 覆盖内容 |
|---------|---------|
| `TestGenerateAndValidateJWT` | JWT 签发 → 正确验证 → 错误 Key 验证 → 无效字符串 |
| `TestAuthMiddleware_JWT_Succeeds` | 有效 JWT 通过 middleware |
| `TestAuthMiddleware_JWT_SSEQueryParam_Succeeds` | JWT 通过 `?token=` 通过 middleware |
| `TestAuthMiddleware_JWT_WrongKey_Returns401` | 错误 Key 签发的 JWT → 401 |
| `TestAuthMiddleware_DualMode_OldKeyStillWorks` | 原始 API Key 仍然可用（向后兼容） |
| `TestIsJWTExpiredError` | `nil` 和 `fmt.Errorf` 都不是过期错误 |
| `TestAuthLogin_Success` | login 端点返回 JWT + expires |
| `TestAuthLogin_WrongKey_Returns401` | login 错误 Key → 401 |
| `TestAuthLogin_NoKey_Returns401` | login 无 token → 401 |
| `TestAuthRefresh_ValidJWT_Succeeds` | refresh 端点返回新 JWT |
| `TestAuthCheck_ValidJWT_ReturnsAuthenticated` | check 端点返回认证状态 |
| `TestAuthCheck_NoToken_ReturnsUnauthenticated` | check 端点无 token → unauthenticated |
| `TestAuthMiddleware_BuildHandler_JWT_Integration` | 集成：JWT 认证/过期检测/X-Token-Type/双模式 |

> 早期文档中的 `TestIsJWTFormat` 已不存在（对应的 `isJWTFormat` 辅助函数已从实现中移除），已从本表删除。

#### 续期窗口与 bot 回调豁免测试

| 测试函数 | 文件 | 覆盖内容 |
|---------|------|---------|
| `TestRefreshRejectsAncientExpiredToken` | `auth_refresh_age_test.go` | 签发远超 `jwtMaxRefreshAge` 的过期 JWT → refresh 被拒 |
| `TestRefreshAcceptsFreshExpiredToken` | `auth_refresh_age_test.go` | 刚过期（窗口内）的 JWT 仍可 refresh |
| `TestBotCallbackBypassesAuthWhenRegistered` | `middleware_bot_auth_test.go` | 已注册 bot 回调免认证；未注册 `/api/v1/bot/` 路径仍 401 |

---

## 变更历史

| 版本 | 日期 | 变更内容 |
|------|------|---------|
| 2.2 | 2026-09 | 文档纠偏：全部 `文件:行号` 锚点改为符号锚点；补记 `jwtMaxRefreshAge`（24h 续期窗口）与 `enforceMaxRefreshAge`；补记 `X-Token-Type: too-old`；补记 bot 回调精确路径免认证；补记 `isMaskedValue` 掩码值拒绝与 `api_key` 最短 8 字符；补记 web3 主题 JWT 集成；修正日志安全（查询参数脱敏而非丢弃）、限流窗口语义（固定窗口）、refresh/check 也走限流；更新测试清单 |
| 2.1 | 2026-06 | 文档与代码同步：refresh/check 不再完全公开（改为 middleware 内特殊处理）；rate limiter 改用纯 IP；web1 SSE onerror JWT 刷新；web2 submitAuthKey async/await；handleAuthCheck 加 ok 断言；web1 _tryRefreshJWT 超时 |
| 2.0 | 2026-06 | 文档全面重写：新增 JWT Session Token 章节、双模式认证详解、前端 JWT 集成对比、登录速率限制说明 |
| 1.0 | 2026-06 | 初始版本：API Key Bearer Token 认证 |
