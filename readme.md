# Twitter Media Downloader Pro

> **版本**: 3.7.2 | **状态**: 活跃维护 | **许可证**: GPL-3.0

Twitter Media Downloader Pro（简称 `tmdp`）的代码基于 [unkmonster/tmd](https://github.com/unkmonster/tmd) 项目，修改了部分代码，添加了新的功能特性。新增的功能见 [CHANGELOG.md文件](CHANGELOG.md)

## 目录

- [功能特性](#功能特性)

- [安装与配置](#安装与配置)

- [安全说明](#安全说明)

- [使用场景与示例](#使用场景与示例)

- [命令行参数详解](#命令行参数详解)

- [参数兼容性速查表](#参数兼容性速查表)

- [API Server 模式](#api-server-模式)

- [定时任务调度器](#定时任务调度器)

- [Bot 集成](#bot-集成)

- [Profile 下载功能](#profile-下载功能)

- [推文 JSON 保存](#推文-json-保存)

- [文件存储结构](#文件存储结构)

- [高级设置](#高级设置)

- [日志系统详解](#日志系统详解)

- [项目架构](#项目架构)

- [常见问题](#常见问题)

- [输出结果格式](#输出结果格式)

- [性能参考](#性能参考)

- [故障排除进阶](#故障排除进阶)

***

## 功能特性

- **多源下载**：支持按用户、列表、关注、混合批量、Profile 五种下载入口

- **增量拉取**：基于 `latest_release_time` 时间戳，只拉取新推文

- **失败重试**：失败项记录到 `.data/errors.json`（403/404 除外），支持自动重试

- **多账号分流**：支持附加 Cookie 多账号分摊 API 请求压力

- **JSON 导入**：支持第三方导出 JSON（`-jsonfile`）和 tmdp 元数据文件夹（`-jsonfolder`）补下载

- **文件写入**：小文件 Buffer / 大文件流式(≥10MB)，原子写入，MD5 跳过未变化文件，版本备份

- **标记已下载**：`-mark-downloaded` 指定时间戳，跳过历史推文

- **Web 管理界面**：内置 HTTP API + SSE 实时推送 + 任务队列 + 定时调度 + 数据库管理

- **API Key 认证**：内置 Bearer Token 认证层，支持 conf.yaml/环境变量/Web UI 三种配置方式，Web UI 免认证访问（详见[安全章节](#api-server-安全)）

- **调度自动化**：支持 `interval` / `daily` 两种模式，`user` / `list` / `following` / `mixed` 四种目标

- **Bot 平台通知**：支持 Telegram、Discord、WeChat、Feishu（命令控制 + 通知）与 Gotify、Pushover（仅通知）六平台，任务完成/失败实时推送（详见[Bot 集成](#bot-集成)）



***

## 安装与配置

### 1. 环境要求

- **Go**: >= 1.25.0（从源码编译时需要）

- **操作系统**: Windows 10+, macOS 10.15+, Ubuntu 18.04+

- **编译器**: 支持 `CGO_ENABLED=0` 纯 Go 构建

- **内存**: 建议 >= 512MB

- **磁盘空间**: 根据下载数量而定

- **权限**: Windows 需要管理员权限（创建符号链接）；开启 Windows 开发者模式亦可创建符号链接

### 2. 下载/编译

**2.1 直接下载（推荐）**

前往 [Release](https://github.com/Leexunhuan743/twitter_media_downloader_pro/releases/latest) 下载对应平台的单文件可执行程序：

| 平台      | 文件名                      |
| ------- | ------------------------ |
| Windows | `tmdp-windows-amd64.exe` |
| Linux   | `tmdp-linux-amd64`       |
| macOS   | `tmdp-darwin-amd64`      |

> **单文件，无依赖**：下载后即可直接运行，无需安装任何运行时或依赖库。放桌面就能用，放到 `PATH` 目录下更方便全局调用。

**首次运行与配置**

```bash
# Windows（cmd / PowerShell）
tmdp-windows-amd64.exe

# Linux / macOS
./tmdp-linux-amd64
```

> 注意：Twitter Media Downloader Pro 是命令行程序，当前可执行文件/命令名仍为 `tmdp`，请在终端中运行，**不要直接双击 exe 文件**（会一闪而过）。

首次运行会自动检测配置文件，不存在时进入**交互式配置向导**，依次填写：

1. 下载根目录 storage dir（必填）
2. `auth_token`
3. `ct0`
4. max download routine（最大并发下载数）
5. max file name len（最大文件名长度）
6. proxy_url（可留空）
7. api_key（可留空，设置后开启 HTTP 认证）

配置完成后即可正常使用。

> 注意：若设置了任一 `TMD_*` 环境变量（且未加 `-conf`），首次运行将跳过向导，直接使用环境变量配置。

如需重新配置或修改参数，Windows 当前目录下运行 `.\tmdp-windows-amd64.exe -conf`（或重命名后运行 `.\tmdp.exe -conf`）可再次进入配置向导。若已加入 `PATH`，也可以直接运行 `tmdp -conf`。各配置项说明如下：

| 配置项                  | 说明                              | 默认值                 | 示例                      |
| -------------------- | ------------------------------- | ------------------- | ----------------------- |
| storage dir          | 文件存储目录                          | 无（必填）               | `D:\twitter_downloads`  |
| auth_token          | Twitter Cookie 中的 auth_token   | 无（必填）               | `a1b2c3d4e5f6...`       |
| ct0                  | Twitter Cookie 中的 ct0           | 无（必填）               | `x1y2z3...`             |
| max download routine | 最大并发下载数（范围 1-100）               | `min(100, CPU×10)`¹ | `35`                    |
| max file name len    | 最大文件名长度（50-245）                 | `158`               | `158`                   |
| proxy_url           | 代理服务器 URL（支持 http/https/socks5） | 空（使用 HTTP_PROXY/HTTPS_PROXY 环境变量代理；均未设置则直连） | `http://127.0.0.1:7890` |
| api_key             | 可选：API Key 认证（设置后开启 HTTP 认证，至少 8 字符） | 空（不启用）                | `your-api-key`         |

> ¹ `max download routine` 默认值为 `min(100, runtime.GOMAXPROCS(0)*10)`，即 CPU 核数的 10 倍且不超过 100。

**快速上手示例**

```bash
# CLI 下载模式：下载某用户的所有媒体
./tmdp-windows-amd64.exe -user elonmusk

# Server 模式：启动 Web 管理界面（默认端口 25556）
./tmdp-windows-amd64.exe -server
# 打开浏览器访问 http://localhost:25556

# 查看全部命令
./tmdp-windows-amd64.exe -help
```

**2.2 自行编译**

```bash
# 克隆项目
git clone https://github.com/Leexunhuan743/twitter_media_downloader_pro.git
cd twitter_media_downloader_pro

# 编译 Windows 版本
go build -o tmdp.exe .

# 交叉编译 Linux 版本
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -o tmdp-linux .

# 交叉编译 macOS 版本
GOOS=darwin GOARCH=amd64 CGO_ENABLED=0 go build -o tmdp-macos .
```

> **说明**: SQLite 使用 `modernc.org/sqlite` 纯 Go driver，源码构建不再需要 GCC/MingW 等 C 编译器。

### 3. Docker

项目通过 GitHub Actions 自动发布 Docker 镜像到 **Docker Hub** 和 **GHCR** 双仓库，两者镜像内容完全一致，任选其一即可：

| 镜像源                | 地址                                                         |
| ------------------ | ---------------------------------------------------------- |
| **Docker Hub**（推荐） | `docker.io/leeexx00/tmdp:<tag>`                            |
| **GHCR**           | `ghcr.io/leexunhuan743/twitter_media_downloader_pro:<tag>` |

```bash
# Docker Hub
docker pull leeexx00/tmdp:latest

# GHCR
docker pull ghcr.io/leexunhuan743/twitter_media_downloader_pro:latest
```

**推荐方式：使用 docker compose**

1. 创建目录：

```bash
mkdir -p config data
```

2. 创建 `.env` 文件或者直接修改yml文件中对应项：

```env
TMD_AUTH_TOKEN=your_auth_token
TMD_CT0=your_ct0
TMD_API_KEY=your-api-key          # 可选：开启 API Key 认证
TMD_PROXY_URL=
TMD_MAX_DOWNLOAD_ROUTINE=8
TMD_MAX_FILE_NAME_LEN=158
TZ=Asia/Shanghai
```

3. 使用 `docker-compose.yml` 启动：

```bash
docker compose up -d
```

4. 查看状态：

```bash
docker compose ps
docker compose logs -f
```

README 中的 compose 示例与仓库根目录的 [docker-compose.yml](./docker-compose.yml) 保持一致（默认使用 Docker Hub 镜像源）：

```yaml
services:
  tmdp:
    image: leeexx00/tmdp:latest
    container_name: tmdp
    restart: unless-stopped
    ports:
      - "25556:25556"
    environment:
      TMD_HOME: /config
      TMD_ROOT_PATH: /data
      TMD_AUTH_TOKEN: ${TMD_AUTH_TOKEN}
      TMD_CT0: ${TMD_CT0}
      TMD_PORT: 25556
      TMD_API_KEY: ${TMD_API_KEY:-}
      TMD_PROXY_URL: ${TMD_PROXY_URL:-}
      TMD_MAX_DOWNLOAD_ROUTINE: ${TMD_MAX_DOWNLOAD_ROUTINE:-8}
      TMD_MAX_FILE_NAME_LEN: ${TMD_MAX_FILE_NAME_LEN:-158}
      TZ: ${TZ:-Asia/Shanghai}
    volumes:
      - ./config:/config
      - ./data:/data
    stop_grace_period: 30s
```

如需切换为 GHCR 镜像源，将上述 `image` 改为：

```yaml
image: ghcr.io/leexunhuan743/twitter_media_downloader_pro:latest
```

**单容器最小运行示例**

```bash
# Docker Hub
docker run -d \
  --name tmdp \
  -p 25556:25556 \
  -v /path/to/config:/config \
  -v /path/to/data:/data \
  -e TMD_HOME=/config \
  -e TMD_ROOT_PATH=/data \
  -e TMD_AUTH_TOKEN=your_auth_token \
  -e TMD_CT0=your_ct0 \
  -e TMD_PORT=25556 \
  -e TMD_API_KEY=your-api-key \
  -e TMD_PROXY_URL= \
  -e TMD_MAX_DOWNLOAD_ROUTINE=8 \
  -e TMD_MAX_FILE_NAME_LEN=158 \
  -e TZ=Asia/Shanghai \
  leeexx00/tmdp:latest -server

# 或使用 GHCR（将最后一行镜像地址替换即可）
# ghcr.io/leexunhuan743/twitter_media_downloader_pro:latest -server
```

启动后可访问：

```text
http://localhost:25556/
http://localhost:25556/api/v1/health
```

**部署说明**

- `/config`：配置、额外 cookies、调度文件、日志目录

- `/data`：下载数据目录，包含 `users/` 和 `.data/foo.db`

- `TMD_AUTH_TOKEN`、`TMD_CT0`：必填

- `TMD_API_KEY`：可选，开启 API Key 认证（详见[API Server 安全](#api-server-安全)）

- `TMD_PROXY_URL`：可选，使用代理时设置，例如 `http://host.docker.internal:7897`

- `TMD_MAX_DOWNLOAD_ROUTINE`：可选，默认 `8`

- `TMD_MAX_FILE_NAME_LEN`：可选，默认 `158`

- `TZ`：可选，默认 `Asia/Shanghai`

- 同一个 `/data` 卷只建议同时运行一个 tmdp 实例

- 如果宿主机端口 `25556` 被占用，可改 compose 里的左侧端口，例如 `"8080:25556"`

- 如果不想把数据放在当前目录，可把 `./config`、`./data` 改成宿主机绝对路径

### 4. 配置参考

**配置文件位置**

| 系统          | 路径                          |
| ----------- | --------------------------- |
| Windows     | `%APPDATA%\.tmd2\conf.yaml` |
| macOS/Linux | `~/.tmd2/conf.yaml`         |

**其他配置文件**

| 文件        | 位置                                    | 说明                                               |
| --------- | ------------------------------------- | ------------------------------------------------ |
| 备用 Cookie | `$HOME/.tmd2/additional_cookies.yaml` | 多账号 Cookie                                       |
| 定时任务      | `$HOME/.tmd2/schedules.yaml`          | 调度器配置                                            |
| Bot 配置    | `$HOME/.tmd2/bot_config.yaml`         | 六平台 Bot 配置：Telegram/Discord/WeChat/Feishu（命令控制）+ Gotify/Pushover（仅推送）。仅 Server 模式启动时自动生成（文件不存在时），CLI 模式不生成 |
| 日志文件      | `$HOME/.tmd2/tmd2.log`                | 主日志（全量：所有域的 logrus 日志，级别随 `-dbg`）          |
| HTTP 客户端日志 | `$HOME/.tmd2/client.log`              | Twitter API 客户端的全量请求/响应日志（方法、URL、状态码、耗时、headers、body） |

**获取 Cookie**

1. 登录 [Twitter/X](https://x.com)
2. 打开浏览器开发者工具 (F12)
3. 进入 Application → Cookies → x.com
4. 复制 `auth_token` 和 `ct0` 的值

> 详细获取方式请参考 [doc/help.md](doc/help.md#获取-cookie)

***

## 安全说明

### Cookie 安全 ⚠️

`auth_token` 和 `ct0` 相当于你的 **Twitter 登录凭证**，请务必妥善保管！

**Cookie 存储位置：**

| 平台          | 路径                          | 权限         |
| ----------- | --------------------------- | ---------- |
| Windows     | `%APPDATA%\.tmd2\conf.yaml` | 当前用户       |
| macOS/Linux | `~/.tmd2/conf.yaml`         | 当前用户 (600) |

### 权限要求

| 操作系统            | 特殊权限     | 原因                                     |
| --------------- | -------- | -------------------------------------- |
| **Windows**     | 管理员权限    | 创建符号链接需要 SeCreateSymbolicLinkPrivilege |
| **Linux/macOS** | 文件系统写入权限 | 写入存储目录和数据库文件                           |

> 💡 **提示**: Windows 用户可以在管理员 PowerShell/cmd 中执行。

### 数据隐私

所有下载的数据**仅存储在本地**，不会上传到任何第三方服务器：

```
{存储目录}/
├── users/              # 推文媒体文件（图片/视频/GIF）
│   └── {用户名}/
│       ├── .loongtweet/   # 推文元数据（JSON/TXT）
│       │   └── .profile/ # 用户资料（头像/横幅/简介）
│       └── {日期}/        # 按日期组织的媒体文件
├── .data/
│   ├── foo.db          # SQLite 数据库（用户/列表/实体关系）
│   └── errors.json     # 失败推文记录
└── ...
```

**数据保护建议：**

- 定期备份 `{存储目录}` 和 `.data/foo.db`

- 敏感数据（如受保护用户的推文）注意访问控制

### API Server 安全

tmdp Server 模式内置 **Bearer Token 认证**，通过 `api_key` 配置项控制。开启后所有 API 请求需要携带 `Authorization: Bearer <key>` 头，Web UI 页面本身不受影响（公开路径免认证）。

#### 快速开启

```yaml
# conf.yaml
api_key: "your-secret-api-key"
```

或通过环境变量设置（优先级更高）：

```bash
# Docker
docker run -e TMD_API_KEY="your-secret-api-key" ...

# 本地
export TMD_API_KEY="your-secret-api-key"
tmdp -server
```

`api_key` 为空时认证层完全跳过，向后兼容。

#### 认证流程

```
客户端                                 tmdp Server
  │                                          │
  │ GET /api/v1/tasks                        │
  │ Authorization: Bearer <jwt or key>       │
  │─────────────────────────────────────────►│  authMiddleware 校验 token
  │                                          │  ① 先尝试 JWT 验证
  │                                          │  ② 回退到原始 Key 比较
  │ HTTP 200 + JSON                          │
  │◄─────────────────────────────────────────│
```

- **双模式认证**：支持 JWT 会话令牌（首选）和原始 API Key（向后兼容）。通过 `POST /api/v1/auth/login` 用 API Key 换取 1 小时有效的 JWT

- **认证失败**：返回 `HTTP 401` + `{"success":false,"error":"unauthorized"}` + `WWW-Authenticate` 头，附带 `X-Token-Type` 区分过期/无效

- **SSE 端点**：`EventSource` 无法设置自定义头，通过 `?token=` 查询参数认证

- **公开路径**：健康检查、Web UI 页面、静态文件、主题切换免认证

- **Web UI 自动弹窗**：浏览器遇到 401 时自动弹出认证对话框，输入 Key 后保存并刷新页面

#### Web UI 配置

进入系统设置 → **Security** 标签页，支持输入/保存/测试/清除 API Key。

#### 生产环境加固

开启内置认证后，建议配合以下措施使用：

1. **默认监听所有网卡**：绑定 0.0.0.0，局域网内可直接访问；如需仅本地访问，请用防火墙/反向代理限制来源
2. **HTTPS 加密**：使用 Nginx/Caddy 反向代理终止 TLS
3. **速率限制**：外层 Nginx 配置 `limit_req`
4. **IP 白名单**：防火墙限制访问来源

**Nginx 反向代理 + HTTPS 示例（仅供参考）：**

```nginx
server {
    listen 443 ssl;
    server_name tmdp.example.com;

    ssl_certificate /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:25556;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        # 可选：外层再加一层速率限制
        limit_req zone=api burst=20 nodelay;
    }
}
```

> 详细设计文档见 [`doc/tmd-api-auth-layer.md`](doc/tmd-api-auth-layer.md)，完整 API 文档见 [`doc/API_DOCUMENTATION.md`](doc/API_DOCUMENTATION.md)。

***

## 使用场景与示例

> 下方示例中的 `tmdp` 表示已将程序重命名为 `tmdp.exe` 或已加入 `PATH` 后的命令名。Windows 用户在当前目录直接运行 Release 文件时，请使用 `.\tmdp-windows-amd64.exe`；若已重命名，则使用 `.\tmdp.exe`。

### 场景1：首次使用

```powershell
# Windows 当前目录直接运行 Release 文件
.\tmdp-windows-amd64.exe -conf
.\tmdp-windows-amd64.exe -user elonmusk -dbg
```

```bash
# 已加入 PATH，或 Linux/macOS 使用同名可执行文件时
tmdp -conf
tmdp -user elonmusk -dbg
```

### 场景2：下载单个用户

```bash
# 下载推文 + Profile（默认行为）
tmdp -user elonmusk

# 仅下载推文，不下载 Profile
tmdp -user elonmusk -noprofile

# 使用数字用户名（如纯数字的 screen_name）
tmdp -user 44196397

# 使用 @ 前缀
tmdp -user @elonmusk
```

### 场景3：批量下载多个用户

```bash
# 下载多个用户的推文 + Profile
tmdp -user elonmusk -user NASA -user SpaceX

# 下载多个用户的推文，不下载 Profile
tmdp -user elonmusk -user NASA -user SpaceX -noprofile

# 仅下载多个用户的 Profile
tmdp -profile-user elonmusk -profile-user NASA -profile-user SpaceX
```

### 场景4：下载列表

```bash
# 下载列表成员推文 + Profile
tmdp -list 1234567890123

# 下载列表成员推文，不下载 Profile
tmdp -list 1234567890123 -noprofile

# 仅下载列表成员 Profile
tmdp -profile-list 1234567890123

# 多个列表
tmdp -list 111111 -list 222222
```

### 场景5：下载关注列表

```bash
# 下载某用户关注的所有人
tmdp -foll myusername
```

### 场景6：混合下载

```bash
# 用户 + 列表 + 关注列表
tmdp -user elonmusk -list 123456 -foll myusername

# Profile 专用下载，只下载 profile
tmdp -profile-user elonmusk -profile-list 123456
```

### 场景7：处理受保护用户

```bash
# 自动发送关注请求
tmdp -user protected_user -auto-follow
```

### 场景8：标记已下载

```bash
# 标记为当前时间
tmdp -user elonmusk -mark-downloaded

# 标记为指定时间
tmdp -user elonmusk -mark-downloaded -mark-time "2024-01-01T00:00:00"

# 批量标记
tmdp -user a -user b -user c -mark-downloaded
```

### 场景9：从 JSON 文件/文件夹下载

```bash
# 从第三方工具导出的推文搜索结果 JSON 下载推文媒体（图片/视频/txt/json）
tmdp -jsonfile ./twitter-search-results-123.json

# 从多个 JSON 文件下载
tmdp -jsonfile ./search1.json -jsonfile ./search2.json -jsonfile ./followers.json

# 从 tmdp 生成的 .loongtweet 文件夹下载推文媒体（仅媒体，无元数据）
tmdp -jsonfolder ./path/to/.loongtweet

# 从多个 .loongtweet 文件夹下载
tmdp -jsonfolder ./folder1/.loongtweet -jsonfolder ./folder2/.loongtweet

# 注意：-jsonfile 和 -jsonfolder 是独占参数，优先级最高
# 以下命令只会执行 -jsonfile，-user 被忽略
tmdp -jsonfile ./search.json -user elonmusk
```

**`-jsonfile`** **输出示例**：

```
[task] Result summary="main(downloaded=2, Failedtweet=0)"
```

> 通过 `-dbg` 模式可查看每条推文的处理详情。

**`-jsonfolder`** **输出示例**：

```
[task] Result summary="main(downloaded=8, Failedtweet=2)"
```

> 💡 **推荐搭配**：使用 [twitter-web-exporter](https://github.com/prinsss/twitter-web-exporter) 浏览器脚本导出推文或用户列表为 JSON 格式，然后用 `-jsonfile` 或 `-jsonfolder` 参数下载。

### 场景10：调试与排错

```bash
# 调试模式
tmdp -user elonmusk -dbg

# 快速退出（不重试）
tmdp -user elonmusk -no-retry
```

***

## 命令行参数详解

### 基础参数

| 参数        | 类型   | 默认值   | 说明                                 |
| --------- | ---- | ----- | ---------------------------------- |
| `-conf`   | bool | false | 进入交互式向导，7 项全量重填；括号内显示各项默认值而非当前值；直接回车=使用默认值/清空字符串字段，storage dir 不可为空            |
| `-dbg`    | bool | false | 显示调试信息，包括请求计数等                     |
| `-server` | bool | false | 启动 API Server 模式                   |
| `-port`   | int  | 25556 | API Server 监听端口（仅与 `-server` 一起使用） |

### 推文下载参数

| 参数      | 类型     | 可重复 | 说明                                        |
| ------- | ------ | --- | ----------------------------------------- |
| `-user` | string | ✅   | 指定下载用户名（可带@前缀，如 `elonmusk` 或 `@elonmusk`） |
| `-list` | uint64 | ✅   | 指定下载列表ID                                  |
| `-foll` | string | ✅   | 指定用户，下载其关注的所有用户                           |

### JSON 下载参数

| 参数            | 类型     | 可重复 | 说明                                                       |
| ------------- | ------ | --- | -------------------------------------------------------- |
| `-jsonfile`   | string | ✅   | 从第三方工具导出的 JSON 文件下载推文媒体（图片/视频/txt/json）                  |
| `-jsonfolder` | string | ✅   | 从 tmdp 生成的 `.loongtweet` 文件夹下载推文媒体（用于媒体文件丢失或第一次媒体文件下载失败） |

> 💡 **推荐搭配**：使用 [twitter-web-exporter](https://github.com/prinsss/twitter-web-exporter) 浏览器脚本导出推文或用户列表为 JSON 格式，然后用 `-jsonfile` 参数下载。

### 下载行为参数

| 参数                | 类型   | 默认值   | 说明                                           |
| ----------------- | ---- | ----- | -------------------------------------------- |
| `-auto-follow`    | bool | false | 自动向受保护用户发送关注请求（需显式开启，默认关闭）                    |
| `-follow-members` | bool | false | 下载时关注目标/成员（用户/列表成员/关注列表成员），失败仅 warning 不阻塞下载 |
| `-no-retry`       | bool | false | 快速退出，不重试失败的推文                                |

> 语义区别：
>
> - `-auto-follow`：仅在下载过程中遇到 **受保护且未关注** 用户时发送关注请求。
>
> - `-follow-members`：对下载目标/成员中 **未关注** 的用户尝试关注（不限是否受保护），并避免与 `-auto-follow` 重复请求。

> **忽略用户**：程序默认会忽略被静音或被屏蔽的用户，所以当你想要下载的列表中包含你不想包含的用户，可以在推特将他们屏蔽或静音。

### 标记参数

| 参数                 | 类型     | 默认值   | 说明                                      |
| ------------------ | ------ | ----- | --------------------------------------- |
| `-mark-downloaded` | bool   | false | 仅标记用户为已下载，不下载内容（常见使用场景：指定下载某用户某时间之后的推文） |
| `-mark-time`       | string | 空（=当前时间）  | 指定标记时间戳，格式：`2006-01-02T15:04:05`，或 `null`/`nil` 表示全量标记 |

> **关于** **`-mark-time`** **格式**：示例中的 `2006-01-02T15:04:05` 是 Go 语言的参考时间格式，表示"年-月-日T时:分:秒"。实际使用时填入具体时间，例如 `2024-01-01T00:00:00` 表示 2024 年 1 月 1 日零时。
>
> - 省略 `-mark-time`：以**当前时间**为标记点（默认）
> - 传 `null` 或 `nil`（不区分大小写）：**全量标记**，清除已记录的最新推文时间，下次下载将重新拉取全部历史推文
> - 传具体时间：标记为指定时间，仅拉取该时间之后的推文

### Profile 下载参数

| 参数              | 类型     | 可重复 | 说明                                                         |
| --------------- | ------ | --- | ---------------------------------------------------------- |
| `-noprofile`    | bool   | -   | 跳过 Profile 下载（默认在使用 `-user`/`-list`/`-foll` 时自动下载 Profile） |
| `-profile-user` | string | ✅   | 单独指定下载 profile 的用户（无需同时下载推文）                               |
| `-profile-list` | uint64 | ✅   | 单独指定下载 profile 的列表ID（无需同时下载推文）                             |

> **注意**：使用 `-user`、`-list`、`-foll` 下载推文时，Profile 下载默认启用。使用 `-noprofile` 可跳过。使用 `-profile-user`/`-profile-list` 可仅下载 Profile 而不下载推文。

***

## 参数兼容性速查表

| 组合                                               |  兼容 | 说明                                       |
| ------------------------------------------------ | :-: | ---------------------------------------- |
| `-user` + `-list` + `-foll`                      |  ✅  | 多种来源可叠加                                  |
| `-user` + `-list` + `-foll` + `-jsonfile`        |  ⚠️ | **仅执行** **`-jsonfile`**（高优先级独占）          |
| `-user` + `-list` + `-foll` + `-jsonfolder`      |  ⚠️ | **仅执行** **`-jsonfolder`**（高优先级独占）        |
| `-jsonfile` + `-noprofile`                       |  ⚠️ | **仅执行** **`-jsonfile`**（高优先级独占）          |
| `-jsonfolder` + `-noprofile`                     |  ⚠️ | **仅执行** **`-jsonfolder`**（高优先级独占）        |
| `-user` + Profile 自动下载                           |  ✅  | 下载推文时自动下载 Profile                        |
| `-list` + Profile 自动下载                           |  ✅  | 下载列表成员推文时自动下载 Profile                    |
| `-foll` + Profile 自动下载                           |  ✅  | 下载关注用户推文时自动下载 Profile                    |
| `-profile-user` + `-profile-list`                |  ✅  | 仅下载资料，不下载推文                              |
| `-user` + `-profile-user`                        |  ✅  | 推文下载 + 额外用户资料                            |
| `-dbg` + 任意参数                                    |  ✅  | 启用调试输出                                   |
| `-auto-follow` + 推文下载                            |  ✅  | 自动关注受保护用户                                |
| `-no-retry` + 推文下载                               |  ✅  | 失败不重试                                    |
| `-mark-downloaded` + `-mark-time`                |  ✅  | 指定标记时间                                   |
| `-mark-downloaded` + 推文下载                        |  ⚠️ | **仅执行标记，不下载推文**                  |
| `-jsonfile` + `-mark-downloaded`                 |  ⚠️ | **仅执行** **`-jsonfile`**（高优先级独占）          |
| `-jsonfolder` + `-mark-downloaded`               |  ⚠️ | **仅执行** **`-jsonfolder`**（高优先级独占）        |
| `-conf` + 其他参数                                   |  ⚠️ | 配置后立即退出（写入 conf.yaml），其余参数（含 `-server`）均被忽略 |
| `-noprofile` + 推文下载参数                            |  ✅  | 下载推文但跳过 Profile                          |
| `-follow-members` + 推文下载                         |  ✅  | 下载时关注目标/成员（失败仅 warning）                  |
| `-mark-downloaded` + `-user` + `-list` + `-foll` |  ✅  | 批量标记多种来源                                 |
| `-server` + `-port`                              |  ✅  | 指定 API Server 端口                         |
| `-server` + 下载参数                                 |  ⚠️ | Server 模式下忽略下载参数                         |
| `-server` + `-conf`                              |  ⚠️ | 仅执行配置向导后退出，不会启动 Server             |

***

## API Server 模式

tmdp 支持以 API Server 模式运行，提供 HTTP REST API 和 Web 管理界面，便于远程控制、自动化集成和实时监控。

### 启动 API Server

```bash
# 使用默认端口 25556 启动
tmdp -server

# 指定端口启动
tmdp -server -port 8080
```

### 功能特性

| 功能            | 说明                                      |
| ------------- | --------------------------------------- |
| **REST API**  | 完整的 HTTP API，支持下载任务管理、状态查询、任务取消         |
| **Web 管理界面**  | 内置可视化界面，支持浏览器访问和操作                      |
| **实时任务监控**    | SSE 推送任务状态更新，无需刷新页面                     |
| **数据库浏览**     | 查看已下载的用户、列表、用户实体信息                      |
| **跨域支持**      | 默认启用 CORS，支持 Web 前端直接调用                 |
| **配置管理**      | 双模式配置编辑器：结构化表单 + 原始 YAML 编辑             |
| **Cookie 管理** | 独立管理主 Cookie 和备用 Cookie，支持表单和原始 YAML 编辑 |
| **日志查看**      | 实时日志流（SSE）+ 历史日志查看，支持按级别筛选、搜索、分页        |
| **定时任务**      | 可视化调度器管理，支持创建/编辑/启禁/手动触发                |
| **失败推文管理**    | 查看失败推文摘要、一键重试所有失败推文、清除错误记录              |
| **服务器控制**     | 支持通过 API/Web 优雅关闭服务器                    |

### API 端点速查

> 🔓 = 公开（免认证） | 🔒 = 需要 Bearer Token（详见[API Server 安全](#api-server-安全)）

| 方法         | 端点                                               | 说明                            |  认证 |
| ---------- | ------------------------------------------------ | ----------------------------- | :-: |
| **GET**    | `/api/v1/health`                                 | 健康检查                          |  🔓 |
| **POST**   | `/api/v1/auth/login`                             | API Key 换取 JWT 会话令牌           |  🔓 |
| **POST**   | `/api/v1/auth/refresh`                           | 刷新 JWT 令牌                     |  🔒 |
| **GET**    | `/api/v1/auth/check`                             | 检查 JWT 有效性                    |  🔒 |
| **POST**   | `/api/v1/users/{screen_name}/download`           | 下载用户推文                        |  🔒 |
| **POST**   | `/api/v1/users/{screen_name}/profile`            | 下载用户 Profile                  |  🔒 |
| **POST**   | `/api/v1/users/{screen_name}/following/download` | 下载关注列表                        |  🔒 |
| **POST**   | `/api/v1/users/{screen_name}/following/mark`     | 标记关注列表已下载                     |  🔒 |
| **POST**   | `/api/v1/users/{screen_name}/mark`               | 标记用户已下载                       |  🔒 |
| **POST**   | `/api/v1/lists/{list_id}/download`               | 下载列表推文                        |  🔒 |
| **POST**   | `/api/v1/lists/{list_id}/profile`                | 下载列表 Profile                  |  🔒 |
| **POST**   | `/api/v1/lists/{list_id}/mark`                   | 标记列表已下载                       |  🔒 |
| **POST**   | `/api/v1/json/file/download`                     | JSON 文件导入下载（支持路径列表/文件上传）      |  🔒 |
| **POST**   | `/api/v1/json/folder/download`                   | LoongTweet 文件夹下载（支持路径列表/文件上传） |  🔒 |
| **POST**   | `/api/v1/batch/download`                         | 批量下载（多用户/列表）                  |  🔒 |
| **POST**   | `/api/v1/batch/mark`                             | 批量标记下载（多用户/列表/关注）             |  🔒 |
| **GET**    | `/api/v1/tasks`                                  | 任务列表                          |  🔒 |
| **GET**    | `/api/v1/tasks/stats`                            | 任务统计（按状态计数）                   |  🔒 |
| **GET**    | `/api/v1/tasks/{task_id}`                        | 任务详情                          |  🔒 |
| **POST**   | `/api/v1/tasks/{task_id}/cancel`                 | 取消任务                          |  🔒 |
| **POST**   | `/api/v1/tasks/cancel-queued`                    | 取消所有排队中的任务                    |  🔒 |
| **POST**   | `/api/v1/tasks/{task_id}/retry`                  | 重试失败/取消的任务                    |  🔒 |
| **DELETE** | `/api/v1/tasks/{task_id}`                        | 删除终端状态任务                      |  🔒 |
| **GET**    | `/api/v1/sse/tasks`                              | SSE 实时任务推送                    |  🔒 |
| **GET**    | `/api/v1/db/users`                               | 用户列表（分页）                      |  🔒 |
| **GET**    | `/api/v1/db/users/{id}`                          | 用户详情                          |  🔒 |
| **PATCH**  | `/api/v1/db/users/{id}`                          | 部分更新用户                        |  🔒 |
| **DELETE** | `/api/v1/db/users/{id}`                          | 删除用户                          |  🔒 |
| **GET**    | `/api/v1/db/users/{id}/previous-names`           | 用户历史名称                        |  🔒 |
| **GET**    | `/api/v1/db/users/{id}/entities`                 | 获取用户的所有实体                     |  🔒 |
| **GET**    | `/api/v1/db/users/{id}/links`                    | 获取用户的所有链接                     |  🔒 |
| **GET**    | `/api/v1/db/user-previous-names`                 | 全局历史名称查询（含当前名称）               |  🔒 |
| **GET**    | `/api/v1/db/lists`                               | 列表列表（分页）                      |  🔒 |
| **GET**    | `/api/v1/db/lists/{id}`                          | 列表详情                          |  🔒 |
| **PATCH**  | `/api/v1/db/lists/{id}`                          | 部分更新列表                        |  🔒 |
| **DELETE** | `/api/v1/db/lists/{id}`                          | 删除列表                          |  🔒 |
| **GET**    | `/api/v1/db/lists/{id}/entities`                 | 获取列表的所有实体                     |  🔒 |
| **GET**    | `/api/v1/db/user-entities`                       | 用户实体列表（分页）                    |  🔒 |
| **GET**    | `/api/v1/db/user-entities/{id}`                  | 用户实体详情                        |  🔒 |
| **PATCH**  | `/api/v1/db/user-entities/{id}`                  | 部分更新用户实体                      |  🔒 |
| **DELETE** | `/api/v1/db/user-entities/{id}`                  | 删除用户实体                        |  🔒 |
| **GET**    | `/api/v1/db/list-entities`                       | 列表实体列表（分页）                    |  🔒 |
| **GET**    | `/api/v1/db/list-entities/{id}`                  | 列表实体详情                        |  🔒 |
| **PATCH**  | `/api/v1/db/list-entities/{id}`                  | 部分更新列表实体                      |  🔒 |
| **DELETE** | `/api/v1/db/list-entities/{id}`                  | 删除列表实体                        |  🔒 |
| **GET**    | `/api/v1/db/user-links`                          | 用户链接查询                        |  🔒 |
| **GET**    | `/api/v1/db/user-links/{id}`                     | 用户链接详情                        |  🔒 |
| **PATCH**  | `/api/v1/db/user-links/{id}`                     | 部分更新用户链接                      |  🔒 |
| **DELETE** | `/api/v1/db/user-links/{id}`                     | 删除用户链接                        |  🔒 |
| **GET**    | `/api/v1/db/stats`                               | 数据库各表记录数统计                    |  🔒 |
| **GET**    | `/api/v1/config`                                 | 系统配置（脱敏）                      |  🔒 |
| **GET**    | `/api/v1/config/raw`                             | 获取原始配置文件内容                    |  🔒 |
| **PUT**    | `/api/v1/config/raw`                             | 更新原始配置文件 (YAML)               |  🔒 |
| **GET**    | `/api/v1/config/fields`                          | 获取结构化配置字段列表                   |  🔒 |
| **PUT**    | `/api/v1/config/fields`                          | 保存结构化配置字段                     |  🔒 |
| **GET**    | `/api/v1/config/theme`                           | 获取当前前端主题                      |  🔓 |
| **POST**   | `/api/v1/config/theme`                           | 切换前端主题                        |  🔓 |
| **GET**    | `/api/v1/config/themes`                          | 获取可用主题列表                      |  🔓 |
| **GET**    | `/api/v1/cookies`                                | 获取备用 Cookie 列表（脱敏）            |  🔒 |
| **PUT**    | `/api/v1/cookies`                                | 保存备用 Cookie（表单）               |  🔒 |
| **GET**    | `/api/v1/cookies/raw`                            | 获取原始 Cookie 文件内容              |  🔒 |
| **PUT**    | `/api/v1/cookies/raw`                            | 更新原始 Cookie 文件 (YAML)         |  🔒 |
| **POST**   | `/api/v1/server/shutdown`                        | 优雅关闭服务器                       |  🔒 |
| **GET**    | `/api/v1/logs`                                   | 获取系统日志（支持筛选/分页）               |  🔒 |
| **GET**    | `/api/v1/logs/stream`                            | SSE 实时日志流                     |  🔒 |
| **GET**    | `/api/v1/logs/stats`                             | 日志级别统计计数                      |  🔒 |
| **GET**    | `/api/v1/logs/export`                            | 导出完整日志文件                      |  🔒 |
| **GET**    | `/api/v1/schedules`                              | 定时任务管理（详见[调度器API](#调度器-api)）  |  🔒 |
| **GET**    | `/api/v1/errors`                                 | 失败推文摘要（含常规+JSON来源）            |  🔒 |
| **POST**   | `/api/v1/errors/retry`                           | 重试所有历史失败推文                    |  🔒 |
| **DELETE** | `/api/v1/errors`                                 | 清除所有失败推文记录                    |  🔒 |
| **GET**    | `/api/v1/queue/status`                           | 下载队列状态（待处理/活跃/分离）             |  🔒 |
| **GET**    | `/`                                              | Web 管理界面 - 仪表盘                |  🔓 |
| **GET**    | `/favicon.ico`                                   | 浏览器图标（SPA 入口时自动请求）            |  🔓 |
| **GET**    | `/tasks`                                         | Web 管理界面 - 任务                 |  🔓 |
| **GET**    | `/data`                                          | Web 管理界面 - 数据                 |  🔓 |
| **GET**    | `/schedules`                                     | Web 管理界面 - 调度                 |  🔓 |
| **GET**    | `/system`                                        | Web 管理界面 - 系统                 |  🔓 |
| **GET**    | `/logs`                                          | Web 管理界面 - 日志                 |  🔓 |
| **GET**    | `/static/{$}`                                    | 静态资源文件（精确匹配）                  |  🔓 |
| **GET**    | `/static/{path...}`                              | 静态资源文件（路径匹配）                  |  🔓 |

> API JSON 中的 Twitter list ID 使用十进制字符串传输（例如 `"2033436439346905439"`），避免 JavaScript Number 对 64 位 ID 产生精度丢失；URL 路径参数仍直接使用同一个十进制 ID。

> ⚠️ **认证说明**: 上表中 🔓 标为公开的路径始终免认证（用于 Web UI 加载、健康检查和主题切换）；🔒 标为需要认证的路径在 `api_key` 配置为空时同样免认证（向后兼容），设置 `api_key` 后必须携带 `Authorization: Bearer <key>` 头。详见 [API Server 安全](#api-server-安全)。

### JSON 导入 API 详细说明

JSON 导入端点（`/api/v1/json/file/download` 和 `/api/v1/json/folder/download`）支持**两种请求格式**，根据 `Content-Type` 自动分发：

- **multipart/form-data**（推荐）：适用于 Web UI 和远程调用，直接上传 JSON 文件，无需服务端路径

- **application/json**：用于 CLI 和高级用法，提供服务端文件/文件夹路径列表

> 📖 **完整文档**：详细的请求/响应格式、参数说明、curl 示例和上传限制请参考 [API_DOCUMENTATION.md - 第8节](doc/API_DOCUMENTATION.md#8-从-json-文件下载)

### API 通用参数

**分页参数**（适用于所有 `GET /api/v1/db/*` 端点）：

| 参数          | 默认值  | 说明             |
| ----------- | ---- | -------------- |
| `page`      | 1    | 页码             |
| `pageSize`  | 20   | 每页数量（最大 200）   |
| `sortBy`    | id   | 排序字段（白名单限制）    |
| `sortOrder` | desc | 排序方向（asc/desc） |
| `q`         | -    | 搜索关键词          |

**筛选参数**（按端点不同）：

| 参数           | 适用端点                                  | 说明        |
| ------------ | ------------------------------------- | --------- |
| `accessible` | `/db/users`                           | 用户可访问状态筛选 |
| `protected`  | `/db/users`                           | 用户保护状态筛选  |
| `userId`     | `/db/user-entities`, `/db/user-links` | 按用户ID筛选   |
| `listId`     | `/db/list-entities`                   | 按列表ID筛选   |
| `ownerId`    | `/db/lists`                           | 按所有者ID筛选  |

### SSE 实时推送

**任务状态推送** - `GET /api/v1/sse/tasks`：

- 任务状态变更时通过事件总线实时推送（全量推送，非增量），心跳间隔 25 秒

- 客户端断开时服务端通过 `context.Done()` 自动感知

- 开启 API Key 认证后需通过 `?token=` 查询参数传递 Key（`EventSource` 无法设置自定义 HTTP 头）：`/api/v1/sse/tasks?token=your-key`

**实时日志流** - `GET /api/v1/logs/stream`：

- 基于控制台日志捕获（`consolelog.Hub`），实时推送新日志行

- 支持 `level`、`q`、`domain` 查询参数进行服务端筛选；历史日志接口 `GET /api/v1/logs` 额外支持 `start_time`/`end_time` 时间范围筛选

- 客户端断开时自动取消订阅

- 开启 API Key 认证后同样需通过 `?token=` 查询参数：`/api/v1/logs/stream?token=your-key`

### 任务自动清理

- 已完成/失败/取消的任务在 **24 小时**后自动清理

- 清理每 **1 小时**执行一次

- 运行中的任务不会被清理

### 服务器优雅关闭

Server 支持优雅关闭，确保所有资源正确释放：

- **信号触发**：收到 SIGINT/SIGTERM 信号时自动执行

- **API 触发**：`POST /api/v1/server/shutdown`

- **关闭顺序**：取消所有运行中的任务 → 等待下载队列 15 秒 → 停止调度器 → 停止 Bot → 关闭 SSE 与日志捕获器 → 关闭 HTTP Server（超时 30 秒） → 关闭数据库（日志文件写入器在进程退出时关闭）

- **超时保护**：HTTP Server 关闭超时 30 秒，下载队列等待 15 秒

- **幂等性**：使用 `sync.Once` 确保关闭只执行一次

### Web 管理界面

启动 Server 后，打开浏览器访问：

```
http://localhost:25556/
```

**三主题界面**：内置三套无构建步骤的原生前端，页面左下角的 🎨 浮动按钮可随时切换（`web1` 经典主题功能最全，`web2` 精简主题更轻量，`web3` 深色玻璃拟态主题 v3.7.2 新增，hash 路由）：

| 主题   | 说明                    | 位置                             |
| ---- | --------------------- | ------------------------------ |
| web1 | 经典主题（默认），功能最全 | `internal/api/web/web1/`        |
| web2 | 精简主题                  | `internal/api/web/web2/`        |
| web3 | 深色玻璃拟态主题（v3.7.2 新增） | `internal/api/web/web3/`        |

主题通过公开 API 切换：`GET /api/v1/config/themes`（可用主题+当前值）、`POST /api/v1/config/theme`（切换）。设置 `TMD_DEV=1` 启动时前端走本地目录文件而非嵌入资源，修改任意主题下的 HTML/JS/CSS 后刷新浏览器即可生效，无需重新编译。

界面功能：

- **仪表盘**：系统状态、任务统计、快速操作

- **新建任务**：创建用户/列表/批量/JSON 下载任务

- **任务列表**：实时显示任务状态、进度条、取消操作

- **数据管理**：完整的数据库 CRUD 操作

  - **Users**：查看、搜索、排序、编辑、删除用户

  - **Lists**：查看、搜索、排序、编辑、删除列表

  - **User Entities**：查看、搜索、排序、编辑、删除用户实体

  - **List Entities**：查看、搜索、排序、编辑、删除列表实体

  - **User Links**：查看、搜索、排序、编辑、删除用户链接

  - **User Previous Names**：查看用户历史名称变更记录

- **定时任务**：调度器管理

  - 创建任务：支持 interval 和 daily 两种调度模式

  - 任务类型：支持 list/user/following/mixed 四种下载类型

  - 任务控制：启用/禁用、手动触发、删除

  - 原始编辑：支持 YAML 格式批量编辑

- **系统管理**

  - **配置编辑**（双模式）：

    - 📝 **简易模式**：结构化表单，按分组显示字段（基础设置/Cookie认证/安全认证/高级选项）

    - 🔧 **高级模式**：原始 YAML 编辑器，适合高级用户

    - 自动备份、实时验证、敏感信息脱敏显示

  - **Cookie 管理**：

    - 📝 **表单模式**：结构化编辑备用 Cookie

    - 🔧 **原始模式**：YAML 格式编辑

    - 敏感信息脱敏显示

  - **日志查看器**：

    - 实时日志流（SSE 推送，无需轮询）

    - 按级别筛选（DEBUG/INFO/WARN/ERROR），显示各级别日志计数

    - 关键词搜索（300ms 防抖，减少请求频率）

    - 分页浏览

    - **日志导出**：一键下载完整日志文件

  - **服务器控制**：优雅关闭服务器

### API 文档

详细的 API 文档请参考 [API_DOCUMENTATION.md](doc/API_DOCUMENTATION.md)，包含：

- 所有 API 端点说明

- 请求/响应格式

- 错误处理

- 使用示例

- **数据库管理 API**：完整的 CRUD 操作文档

  - 用户管理（Users）

  - 列表管理（Lists）

  - 用户实体管理（User Entities）

  - 列表实体管理（List Entities）

  - 用户链接查询（User Links）

  - 用户历史名称查询（User Previous Names）

### 快速示例

> 以下示例默认不携带认证头。如果启用了 API Key 认证（`api_key` 非空），建议先获取 JWT 再调用 API。详见[API Server 安全](#api-server-安全)。

```bash
# 1. 启动 Server
tmdp -server

# (可选) 如已启用 API Key，先获取 JWT 会话令牌，后续请求用 $TOKEN 替代 API Key
#   TOKEN=$(curl -s -X POST -H "Authorization: Bearer your-key" \
#     http://localhost:25556/api/v1/auth/login | jq -r '.data.token')

# 2. 创建下载任务
curl -X POST http://localhost:25556/api/v1/users/elonmusk/download

# 3. 查询任务列表
curl http://localhost:25556/api/v1/tasks

# 4. 取消任务
curl -X POST http://localhost:25556/api/v1/tasks/task_xxx/cancel

# 5. 查看任务统计
curl http://localhost:25556/api/v1/tasks/stats

# 6. 批量标记已下载
curl -X POST http://localhost:25556/api/v1/batch/mark \
  -H "Content-Type: application/json" \
  -d '{"users": ["elonmusk", "twitter"]}'

# 7. 重试所有失败推文
curl -X POST http://localhost:25556/api/v1/errors/retry

# 8. 查看失败推文摘要
curl http://localhost:25556/api/v1/errors

# 9. 清除失败推文记录
curl -X DELETE http://localhost:25556/api/v1/errors
```

***

## 定时任务调度器

tmdp Server 内置定时任务调度器，支持按时间间隔或每天固定时间自动执行下载任务。

### 调度模式

| 模式           | 格式                    | 示例                  | 说明         |
| ------------ | --------------------- | ------------------- | ---------- |
| **interval** | `interval:<duration>` | `interval:2h`       | 每隔指定时间执行一次 |
| **daily**    | `daily:<times>`       | `daily:07:00,21:00` | 每天在指定时间执行  |

> interval 最小值为 `1m`（1 分钟）。daily 模式时间点最多 **96 个**，必须使用 `HH:MM` 24 小时制，逗号分隔。

### 任务类型

| 类型          | target 格式       | 说明       |
| ----------- | --------------- | -------- |
| `list`      | 列表 ID（正整数）      | 下载列表成员推文 |
| `user`      | 用户 screen_name | 下载用户推文   |
| `following` | 用户 screen_name | 下载关注列表推文 |
| `mixed`     | 不使用 `target`，改用 `users` / `lists` / `following_names` 字段 | 混合多用户/列表/关注下载 |

### 配置文件

调度器配置文件位于 `$HOME/.tmd2/schedules.yaml`（Windows: `%APPDATA%\.tmd2\schedules.yaml`）：

```yaml
schedules:
  - id: daily_tech_list
    type: list
    target: "1234567890123"
    name: "科技圈每日同步"
    schedule: "daily:07:00,21:00"
    enabled: true
    run_on_start: false
    auto_follow: false
    follow_members: false
    skip_profile: false
    no_retry: false
  - id: hourly_elon
    type: user
    target: elonmusk
    name: "Elon 每小时同步"
    schedule: "interval:1h"
    enabled: true
    run_on_start: true
    auto_follow: false
    follow_members: false
    skip_profile: false
    no_retry: false
  - id: mixed_tech
    type: mixed
    users: [elonmusk, NASA]
    lists: ["1234567890123"]
    following_names: [myusername]
    name: "混合批量同步"
    schedule: "daily:06:30"
    enabled: true
```

`mixed` 类型至少需要 `users`、`lists`、`following_names` 中的一项；`lists` 中的列表 ID 必须为正整数。

### ScheduleEntry 字段说明

| 字段               | 类型     | 必填 | 说明                                 |
| ---------------- | ------ | -- | ---------------------------------- |
| `id`             | string | 否  | 唯一标识：留空自动生成（`sch_` + 12 位十六进制），也可手动指定（仅限字母/数字/`_`/`-`） |
| `type`           | string | 是  | 任务类型：`list` / `user` / `following` / `mixed` |
| `target`         | string | 条件 | 目标（列表 ID 或用户名）；`mixed` 类型不使用，改用 `users` / `lists` / `following_names` |
| `users`          | []string | 否  | 仅 `mixed` 类型：下载的用户列表 |
| `lists`          | []string | 否  | 仅 `mixed` 类型：下载的列表 ID 列表（字符串形式，避免 64 位 ID 精度丢失） |
| `following_names` | []string | 否  | 仅 `mixed` 类型：下载关注列表的目标用户名列表 |
| `name`           | string | 否  | 任务显示名称                             |
| `schedule`       | string | 是  | 调度规则（`interval:` 或 `daily:`）       |
| `enabled`        | bool   | 否  | 是否启用（默认 false）                     |
| `run_on_start`   | bool   | 否  | 系统首次启动时是否立即执行一次（interval 与 daily 模式均支持） |
| `auto_follow`    | bool   | 否  | 自动关注受保护用户                          |
| `follow_members` | bool   | 否  | 下载时关注目标/成员（失败仅 warning，不阻塞下载）      |
| `skip_profile`   | bool   | 否  | 跳过 Profile 下载                      |
| `no_retry`       | bool   | 否  | 不重试失败推文                            |

### 调度器 API

| 方法         | 端点                               | 说明              |
| ---------- | -------------------------------- | --------------- |
| **GET**    | `/api/v1/schedules`              | 获取调度器状态和任务列表    |
| **PUT**    | `/api/v1/schedules`              | 替换全部调度配置        |
| **POST**   | `/api/v1/schedules`              | 创建定时任务          |
| **GET**    | `/api/v1/schedules/raw`          | 获取原始调度配置        |
| **PUT**    | `/api/v1/schedules/raw`          | 更新原始调度配置 (YAML) |
| **POST**   | `/api/v1/schedules/reload`       | 重载调度配置          |
| **POST**   | `/api/v1/schedules/validate`     | 验证调度配置          |
| **POST**   | `/api/v1/schedules/trigger-all`  | 批量触发所有已启用调度     |
| **GET**    | `/api/v1/schedules/stats`        | 调度概览统计          |
| **PUT**    | `/api/v1/schedules/{id}`         | 更新定时任务          |
| **DELETE** | `/api/v1/schedules/{id}`         | 删除定时任务          |
| **PATCH**  | `/api/v1/schedules/{id}/enabled` | 启用/禁用定时任务       |
| **POST**   | `/api/v1/schedules/{id}/trigger` | 手动触发定时任务        |
| **GET**    | `/api/v1/queue/status`           | 下载队列状态          |

### 调度器状态

`GET /api/v1/schedules` 返回每个任务的状态信息：

| 字段                               | 说明                                  |
| -------------------------------- | ----------------------------------- |
| `exists`                         | 调度配置文件是否存在                          |
| `scheduler_running`              | 调度器是否运行中                            |
| `active`                         | 启用中的调度数量                            |
| `total`                          | 调度总数                                |
| `entries[].last_run_at`          | 上次执行时间                              |
| `entries[].next_run_at`          | 下次执行时间                              |
| `entries[].schedule_display`     | 调度时间格式化显示（如 "每天 08:00"）             |
| `entries[].run_count`            | 累计执行次数                              |
| `entries[].last_task_id`         | 上次执行的任务 ID                          |
| `entries[].last_error`           | 上次执行的错误信息                           |
| `entries[].consecutive_failures` | 连续失败次数                              |
| `entries[].triggering`           | 是否正在触发该调度规则；仅表示正在创建任务，不代表后台下载任务仍在运行 |

创建、更新、启用或重载定时任务后，如果存在启用中的规则且调度器未运行，服务端会自动启动调度器。

***

## Bot 集成

tmdp Server 模式支持接入 6 种 Bot 平台，用于远程命令控制、任务结果通知和错误日志告警。仅在 Server 模式下启用；修改 `bot_config.yaml` 后需要重启服务生效。

### 平台矩阵

| 平台      | 传输方式                                        | 命令控制 | 通知范围              | 配置要求                    |
| ------- | ------------------------------------------- | ---- | ----------------- | ----------------------- |
| Telegram | 长轮询（`getUpdates`，60s timeout）               | `/dl` `/status` `/cancel` `/tasks` `/help` | 任务发起者的聊天；日志告警推送给 allowed_users | `token`（必填）             |
| Discord  | WebSocket Gateway + 全局 Slash 命令             | 同上（原生布尔选项）      | 任务发起者的频道；日志告警 DM 给 allowed_users | `token`（必填）             |
| WeChat   | wechat-robot-go iLink 协议（首次登录需扫码）          | 同上               | 任务发起者；日志告警给本次运行中出现过的用户     | `credential_path`（必填）   |
| Feishu   | HTTP 回调（默认 `/api/v1/bot/feishu/callback`）  | 同上               | 任务发起者；日志告警给本次运行中出现过的用户     | `app_id` + `app_secret`（必填） |
| Gotify   | Gotify HTTP 推送 API                          | 无（仅推送）          | 每个终止任务推送一次；错误日志告警         | `server_url` + `token`（必填） |
| Pushover | Pushover HTTP 推送 API                       | 无（仅推送）          | 每个终止任务推送一次；错误日志告警         | `user` + `token`（必填）     |

### 命令说明

Telegram / WeChat / Feishu 使用文本命令，Discord 使用 Slash 命令（选项为原生布尔值）：

```
/dl [user|list|foll] <target> [opt=val ...]   # 下载：user 用户 / list 列表ID / foll 关注列表；省略类型时默认 user
/status <task_id>                              # 查询任务状态
/cancel <task_id>                              # 取消任务
/tasks                                         # 列出近期任务
/help                                          # 帮助信息
```

示例：

```
/dl elonmusk
/dl user elonmusk
/dl list 1234567890123
/dl foll elonmusk auto_follow=true skip_profile=true
```

`/dl` 支持的命令选项（可简写）：

| 选项               | 简写 | 说明                          | 适用命令   |
| ---------------- | -- | --------------------------- | ------ |
| `auto_follow`    | `af` | 自动关注受保护用户                  | user/list/foll |
| `follow_members` | `fm` | 下载时关注目标/成员                  | user/list/foll |
| `skip_profile`   | `sp` | 跳过 Profile 下载               | user/list/foll |
| `no_retry`       | `nr` | 不重试失败推文                     | user/list/foll |

> Bot 命令走与 HTTP/调度器相同的任务队列路径：`/dl` 创建任务后必须经 `Server.EnqueueTask` 入队才会执行；`/cancel` 通过 `TaskManager.CancelTask` 取消，保证任务状态、上下文和 SSE 推送一致。

### 通知机制

- **任务结果**：命令类平台只通知**发起该任务的聊天/用户/频道**（每平台维护任务归属表）；Gotify/Pushover 对每个终止任务广播一次（内部去重，避免重复推送）。
- **日志告警**：所有平台订阅日志流，仅推送 `ERRO`/`FATA` 级别日志行，且每个平台限速 1 行/秒。

### bot_config.yaml 字段

配置文件位于 `$HOME/.tmd2/bot_config.yaml`（Windows: `%APPDATA%\.tmd2\bot_config.yaml`），首次运行 Server 模式时自动生成含完整注释的模板。只填写需要启用的平台，其余留空即可：

```yaml
# Telegram: https://t.me/BotFather 创建机器人，token 格式 123456789:ABC-xxx
# 获取自己的 user id：向机器人发消息后访问 https://api.telegram.org/bot<token>/getUpdates
telegram:
  token: "123456789:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
  allowed_users: [123456789]

# Discord: https://discord.com/developers/applications 创建应用 → Bot → Reset Token
# 开发者模式 → 右键用户 → Copy User ID
discord:
  token: "MTE5ODk4MjQ2NzE4NTMyMTI5OQ.GnO2X.xxx"
  allowed_users: ["123456789012345678"]

# WeChat iLink：个人微信接入，首次登录扫码。credential_path 相对工作目录，登录后自动生成
wechat:
  credential_path: ".weixin-token.json"
  allowed_users: ["friend@im.wechat"]

# Feishu/Lark：https://open.feishu.cn/app 创建应用，开启机器人能力并订阅"接收消息 v2.0"事件
# 回调地址填 https://your-domain/api/v1/bot/feishu/callback
feishu:
  app_id: "cli_xxxxxxxxxxxx"
  app_secret: "xxxxxxxxxxxxxxxxxxxxxxxxxx"
  verify_token: "xxxxxxxxxxxx"
  encrypt_key: ""
  allowed_users: ["ou_xxxxxxxxxxxxx"]

# Gotify（仅推送）：自建推送服务 https://github.com/gotify/server
gotify:
  server_url: "http://gotify.lan:8080"
  token: "S3cr3tT0k3n"
  priority: 5

# Pushover（仅推送）：https://pushover.net 注册获取 User Key 并创建 Application Token
pushover:
  user: "uKey123..."
  token: "appToken456..."
  device: "iphone"
  sound: "gamelan"
```

> ⚠️ **安全提示**：`allowed_users` 为空表示接受该平台能识别的任何用户发来的命令，本地测试方便，但暴露到公网的 Bot 建议务必配置白名单。日志中的 Bot 相关输出不会打印任何 token/密钥。

***

## Profile 下载功能

### 功能说明

Profile 下载功能可以保存用户的完整个人资料：

| 文件                        | 说明             | 格式   |
| ------------------------- | -------------- | ---- |
| `avatar.jpg/png/gif/webp` | 高清头像 (400x400) | 图片   |
| `banner.jpg`              | 个人主页横幅（固定 .jpg 扩展名） | 图片   |
| `description.txt`         | 用户简介           | 纯文本  |
| `profile.json`            | 完整资料信息         | JSON |

### Profile JSON 结构

```json
{
  "ID": 123456789,
  "Name": "用户名称",
  "ScreenName": "username",
  "URL": "https://example.com",
  "Location": "地点",
  "Verified": true,
  "Protected": false,
  "CreatedAt": "Wed Oct 01 00:00:00 +0000 2014"
}
```

> **注意**: `AvatarURL`、`BannerURL`、`Description` 不会写入 `profile.json`，它们分别保存为独立的图片文件和 `description.txt`。

### 版本管理

当资料变更时，旧文件自动备份：

```
.loongtweet/.profile/.versions/
├── avatar_20240115_103045_123.jpg
├── banner_20240115_103045_123.jpg
├── description_20240115_103045_123.txt
└── profile_20240115_103045_123.json
```

版本命名格式：`{类型}_{日期}_{时间}_{毫秒}.{扩展名}`（毫秒 0-999）

***

## 推文 JSON 保存

每次下载推文媒体时，会同时保存推文的完整信息到 `.loongtweet/` 子目录。

### 保存内容

| 文件                | 格式   | 说明               |
| ----------------- | ---- | ---------------- |
| `{推文文本}_{tweet_id}.json` | JSON | 推文完整信息（格式化 JSON） |
| `{推文文本}_{tweet_id}.txt`  | TXT  | 人类可读的文本格式        |

### JSON 内容

- 推文文本、时间戳、URL

- 用户信息（头像已清理为高清 URL）

- 媒体信息（已清理冗余字段，图片追加 `?name=4096x4096` 高清参数）

- 完整的原始数据

- **`-jsonfile`** **模式额外处理**：第三方新格式自动转换为 tmdp 兼容旧格式（嵌套对象扁平化）

### 用途

- 即使下载失败也能记录推文信息，便于调试

- 可用于数据备份和迁移

- 便于第三方工具读取推文数据

### TXT 格式示例

```
time:2024-01-15T10:30:00
url:https://x.com/username/status/1234567890
media:2

这是推文的文本内容...
```

***

## 文件存储结构

```
{存储目录}/
├── users/                          # 用户目录
│   ├── Elon Musk(elonmusk)/        # 用户文件夹
│   │   ├── 推文媒体文件...         # -user/-jsonfile/-jsonfolder 媒体文件均在此
│   │   └── .loongtweet/           # 仅 -user 和 -jsonfile 创建
│   │       ├── {推文文本}_{tweetID}.json    # 推文 JSON（均已清理：-user cleanTweetJson / -jsonfile 格式转换+清理）
│   │       ├── {推文文本}_{tweetID}.txt     # 推文文本
│   │       └── .profile/            # 仅 -user 创建
│   │           ├── avatar.jpg
│   │           ├── banner.jpg
│   │           ├── description.txt
│   │           ├── profile.json
│   │           └── .versions/      # 历史版本
│   └── NASA(NASA)/
│       └── ...
├── .data/                          # 数据目录
    ├── foo.db                      # SQLite 数据库
    │                                 # 包含以下数据表：
    │                                 # - users: 用户信息（含 is_accessible 状态）
    │                                 # - lsts: 列表信息
    │                                 # - user_entities: 用户下载实体（含 media_count）
    │                                 # - lst_entities: 列表下载实体
    │                                 # - user_links: 用户链接关联
    │                                 # - user_previous_names: 用户历史名称（含 record_date）
    ├── errors.json                 # 失败推文记录
    └── json_errors.json            # JSON 导入失败的推文记录（-jsonfile/-jsonfolder）
```

***

## 高级设置

### 设置代理

支持三种代理方式：

**方式一：配置文件设置（推荐）**

在 `tmdp -conf` 配置时输入 `proxy_url`，或直接编辑 `conf.yaml`：

```yaml
proxy_url: http://127.0.0.1:7890
```

支持的协议：`http://`、`https://`、`socks5://`

**方式二：环境变量设置**

运行前通过环境变量指定代理服务器（TUN 模式跳过这一步）

**Windows CMD:**

```bash
set HTTP_PROXY=http://127.0.0.1:7890
set HTTPS_PROXY=http://127.0.0.1:7890
tmdp -user elonmusk
```

**Windows PowerShell:**

```powershell
$Env:HTTP_PROXY="http://127.0.0.1:7890"
$Env:HTTPS_PROXY="http://127.0.0.1:7890"
tmdp -user elonmusk
```

**Linux/macOS:**

```bash
export HTTP_PROXY=http://127.0.0.1:7890
export HTTPS_PROXY=http://127.0.0.1:7890
tmdp -user elonmusk
```

### 添加额外 Cookie

程序动态从所有可用 cookie 中选择一个不会被速率限制的 cookie 请求用户推文，以避免因单一 cookie 的速率限制导致程序被阻塞。

按如下格式创建 `$HOME/.tmd2/additional_cookies.yaml` 或 `%appdata%/.tmd2/additional_cookies.yaml`：

```yaml
- auth_token: xxxxxxxxx1
  ct0: xxxxxxxxxxxxxxxxxxxxxxx
- auth_token: xxxxxxxxx2
  ct0: xxxxxxxxxxxxxxxx2
- auth_token: xxxxxxxxxxxxxxxx3
  ct0: xxxxxxxxxxxxxxxxxxxxx3
```

> 这些添加的备用 cookie，仅用来提升获取推文的速率和总量。判断是否忽略用户和自动关注受保护的用户依然使用主账号。

### 关于速率限制

Twitter API 限制一段时间内过快的请求（例如某端点每15分钟仅允许请求500次，超出这个次数会以429响应）。当某一端点将要达到速率限制程序会打印一条通知并阻塞尝试请求这个端点的协程直到余量刷新（这最多是15分钟），但并不会阻塞所有协程，所以其余协程打印的消息可能将这条休眠通知覆盖让人认为程序无响应了，等待余量刷新程序会继续工作。

### 启动脚本

项目提供 Server 模式的启动脚本：

**Windows (`start-server.bat`)**：

```bash
# 直接运行
start-server.bat

# 指定额外参数
start-server.bat -port 8080
```

> 脚本行为：自动查找同目录下的可执行文件并以 `-server` 模式启动，额外参数会透传给 tmdp。查找顺序：`tmdp-Windows-amd64.exe` → `tmdp.exe` → `tmdp` → `tmd-Windows-amd64.exe` → `tmd.exe` → `tmd`；若均不存在但本机装有 Go，会自动编译 `tmdp-test.exe` 后启动。设置 `TMD_DEV=1` 时直接 `go run . -server`，前端走本地文件（`internal/api/web/web1/`、`web2/`）支持热刷新。

***

## 日志系统详解

### 日志位置

程序维护两个独立的日志文件，均位于 app root 下（默认 `%APPDATA%\.tmd2`（Windows）/ `~/.tmd2`（macOS/Linux），可用 `TMD_HOME` 环境变量覆盖）：

| 平台              | 主日志（全量）                  | HTTP 客户端日志                    |
| --------------- | -------------------------- | ---------------------------- |
| **Windows**     | `%APPDATA%\.tmd2\tmd2.log` | `%APPDATA%\.tmd2\client.log` |
| **macOS/Linux** | `~/.tmd2/tmd2.log`         | `~/.tmd2/client.log`         |

- **`tmd2.log`（主日志）**：logrus 全量日志（所有 `[api]`/`[download]`/`[twitter]` 等域，级别随 `-dbg` 在 Info/Debug 间切换），同时是 Web UI 日志查看与 SSE 日志流的数据源
- **`client.log`（HTTP 客户端日志）**：Twitter API 客户端的全量请求/响应记录——每个请求输出方法、URL、状态码、耗时、请求/响应 headers 与 body，**与 `-dbg` 无关，始终全量记录**；媒体下载客户端（`internal/downloader`）不走此文件，其日志在主日志中

### 日志轮转配置

两个日志文件均使用同一套 [lumberjack](https://github.com/natefinch/lumberjack) 配置（`main.go` 中两个 `lumberjack.Logger` 参数一致），各自独立轮转（任一文件达到上限时仅滚动自身）：

| 配置项   | 当前值      | 说明             |
| ----- | -------- | -------------- |
| 单文件最大 | **2 MB** | 防止单个日志文件过大     |
| 保留份数  | **2**    | 最多保留 2 个历史日志文件 |
| 保留天数  | **14 天** | 自动清理 14 天前的日志  |
| 压缩    | ✅ 开启     | 历史日志自动 gzip 压缩（lumberjack `Compress: true`） |

> **client.log 脱敏说明**：全量请求/响应日志中的敏感头（`Authorization`、`Cookie`、`X-Csrf-Token`、`Set-Cookie` 等）不会明文落盘，值被替换为稳定指纹（如 `[redacted:xxxx]`）；单个请求/响应 body 超过 **256 KB** 的部分截断不写入（resty 的截断检查发生在 JSON 美化之前：256 KB 原始响应经 indent 美化后约 700 KB，为 lumberjack 2 MB 单次写入上限留出余量）。查询参数保持原样——Twitter GraphQL URL 不携带凭据参数。

### 日志级别

```bash
# 默认级别：Info（显示重要信息）
tmdp -user elonmusk

# 调试级别：Debug（显示所有请求详情）
tmdp -user elonmusk -dbg
```

**Debug 模式额外输出：**

- 各 Twitter 端点的请求计数（`twitter.ReportRequestCount()`，退出时输出 `[rate-limit] Request count endpoint=... count=...`）

- 限流细节（`[rate-limit] Would block/Updated/Reset ...`）

- 文件原子写入日志（`[downloader] Atomic write complete path=... bytes=...`）

另两项诊断为 **Warn 级（默认级别即输出，无需 `-dbg`）**：

- 限流等待（`[rate-limit] Sleeping endpoint=... wake_at=... remaining=... limit=...`）

- 哈希校验失败（`[downloader] Hash check failed path=... error=...`）



## 常见问题

### Q: 如何查看失败的下载？

失败的任务保存在 `{存储目录}/.data/errors.json`，下次运行会自动重试。详见[故障排除](#常见错误码速查)。

### Q: Profile 文件存在时还会重新下载吗？

如果文件内容未变更（MD5 校验），会自动跳过。详见[性能优化特性](#3-md5-去重)。

### Q: 如何更新已下载用户的 Profile？

重新运行相同的命令即可，只会下载变更的文件。

### Q: 下载中断后怎么办？

直接重新运行相同命令，程序会自动恢复。详见[典型问题场景](#典型问题场景与解决方案)。

### Q: Windows 上需要管理员权限吗？

创建符号链接需要管理员权限。详见[权限要求](#权限要求)。

### Q: 如何获取列表ID？不知道啥是 user_id/list_id/screen_name?

在 Twitter 网页版打开列表，URL `https://x.com/i/lists/1234567890123` 中的数字就是列表ID。
更多信息请参考 [doc/help.md](doc/help.md)。

### Q: 推文 JSON 文件有什么用？

即使媒体下载失败，推文信息也会保存到 `.loongtweet/` 目录，可用于数据分析或备份。详见[推文 JSON 保存](#推文-json-保存)。

***

## 输出结果格式

> CLI 模式下所有结果通过日志输出（logrus TextFormatter）。推文/Profile/JSON 导入完成时输出 `[task] Result summary=...`；标记、重试等无媒体统计的操作输出 `[task] Result message=...`。阶段进度（`syncing`/`marking`）输出为 `[task] Progress stage=...`（`syncing` 仅列表类任务输出；`preparing` 无实际代码路径），而 `downloading`/`retrying`/`profile` 高频阶段不会刷日志（仅进 SSE/任务状态）。

### 推文下载结果

CLI 模式下，下载完成后的输出示例：

CLI 单用户下载不输出阶段进度行（`syncing` 仅列表类任务输出，真实格式为 `[task] Progress stage=syncing current="list:123"`），完成后直接输出最终结果：

```
[task] Result summary="main(downloaded=164, Failedtweet=2), profile(downloaded=3, failed=0, versionedfile=0)"
```

字段说明：

- `main(downloaded, Failedtweet)` — 推文媒体统计：成功下载数、失败推文数（注意 `Failedtweet` 首字母大写）

- `profile(downloaded, failed, versionedfile)` — Profile 统计：成功数、失败数、版本备份数

### Profile 下载结果

CLI 模式下，Profile 下载结果通过日志输出，例如：

```
[task] Result summary="profile(downloaded=2, failed=1, versionedfile=3)"
```

当没有 Profile 任务执行时输出：

```
[task] Result message="No profile downloads performed"
```

API 模式下，Profile 结果可通过任务详情查看（`GET /api/v1/tasks/{task_id}`），包含 `profile.downloaded`、`profile.failed`、`profile.versioned` 字段。

状态说明：

- 用户级 `downloaded` — 下载成功

- 用户级 `failed` — 下载失败

- 文件级 `versioned` — 旧文件已备份到 `.versions/`

### JSON 导入结果

CLI 模式下，JSON 文件/文件夹导入的完成输出（summary 优先，message 不重复输出）：

```
[task] Result summary="main(downloaded=8, Failedtweet=2)"
```

服务端日志（logrus）中另有 `[jsonfile]` / `[jsonfolder]` 域的阶段汇总（推文/媒体数、失败数、耗时）。

### 标记结果

CLI 模式下，标记结果通过日志输出，例如：

```
[task] Result message="Marked 3 users as downloaded"
```

API 模式下，标记结果可以通过任务详情查看（`GET /api/v1/tasks/{task_id}`），包含 `message` 和统计信息。

### 重试结果

重试过程不输出逐条进度日志（`retrying` 阶段被抑制）；失败推文会持久化到 `errors.json`/`json_errors.json`。

重试完成后输出（无剩余失败项）：

```
[task] Result message="completed"
```

无待重试项时（服务端日志）：

```
[download] Retry all skipped reason=no_pending_errors dur=...
```

### 任务失败

任务失败时输出（错误信息经脱敏处理）：

```
[task] Failed task_id=task_xxx type=... dur=... error="..."
```

### 调试模式输出

使用 `-dbg` 模式时可看到详细的下载进度：

```
[download] Skip non-retriable media tweet_id=1234567890 url=https://... error="403 Forbidden"
[downloader] Download failed with non-2xx status status_code=403 url=https://...
[downloader] Download failed, retrying... attempt=1 max_retries=2 url=https://... error="connection reset"
[batch] Protected users skipped count=1 users=["Name(@screen_name)"]
[batch] User depth exceeds limit entity="user" depth=1500
[rate-limit] Sleeping endpoint=... wake_at=... remaining=... limit=...
[rate-limit] Request count endpoint=... count=...
[twitter] Account unavailable account=... error=...
```

***

## 项目架构

> 完整的架构分层图、Service 层接口设计、开发指南（项目结构/测试/CI/CD/设计模式）已移至 [doc/architecture.md](doc/architecture.md)，面向开发者，普通用户无需阅读。

tmdp 采用"入口层 → 服务层 → 业务层 → 基础设施层"的四层结构，CLI 和 API Server 统一通过 `internal/service.DownloadService` 编排下载流程。

***

## 性能参考

### 下载速度调优

| 并发数       | 适用场景             | 带宽占用            | 推荐度          |
| --------- | ---------------- | --------------- | ------------ |
| **10-20** | 家庭网络 / 共享网络      | 低 (5-20 Mbps)   | ⭐⭐⭐ 稳定首选     |
| **20-35** | 企业网络 / 独享带宽      | 中 (20-50 Mbps)  | ⭐⭐⭐⭐ **推荐值** |
| **35-50** | 服务器 / VPS / 高速宽带 | 高 (50-100 Mbps) | ⭐⭐ 需要优质网络    |

**配置方法：**

```bash
# 方式1: 首次配置时设置
tmdp -conf
# 输入 max download routine: 35

# 方式2: 修改配置文件后更新
tmdp -conf
# 仅修改需要调整的字段，其他留空保持原值
```

### 性能优化特性

tmdp 内置多项性能优化机制：

#### 1. 流式下载（v2.12.3+）

自动根据文件大小选择最优策略：

```
文件大小 < 10MB → Buffer 模式（内存缓冲，支持 MD5 去重）
文件大小 ≥ 10MB → 流式模式（分块写入，节省内存）
```

**优势：**

- 大视频文件不再占用大量内存

- 任务级进度经 SSE 推送(完成文件数/总数),无逐文件字节级进度

- 失败时整文件重试(最多 2 次,间隔递增),最后一次尝试自动回退 Buffer 模式;不支持断点续传

#### 2. 增量下载

基于 `user_entities.latest_release_time` 时间戳的智能增量拉取（逻辑示意，实际由实体时间戳控制，非 SQL 查询）：

```text
首次运行：无 latest_release_time → 全量拉取
后续运行：仅拉取发布时间晚于 latest_release_time 的推文，完成后更新时间戳
```

**效果：**

- 首次运行：全量下载用户所有推文

- 后续运行：仅下载新增推文（通常几分钟完成）

- 节省 API 配额和网络带宽

#### 3. MD5 去重

相同内容的文件自动跳过。写入时开启 `SkipUnchanged` 选项：先比对目标文件的大小 + MD5（大小不同直接写入，大小相同再比 MD5），内容未变更则静默跳过，不产生日志：

```go
// fileWriter 写入时比对大小 + MD5，内容一致则跳过
if req.Options.SkipUnchanged && sameSize && sameMD5 {
    return nil // 跳过重复下载
}
```

**适用场景：**

- 重试失败任务时跳过已成功的文件

- 多列表包含同一用户时避免重复保存

- Profile 未变更时自动跳过

#### 4. 符号链接去重

多列表包含同一用户时使用符号链接：

```
lists/科技圈/users/ -> ../../users/Elon Musk(elonmusk)/
lists/新闻/users/   -> ../../users/Elon Musk(elonmusk)/
```

**节省空间：**

- 无论多少列表包含同一用户，本地仅保留一份存档

- 显著减少磁盘空间占用（尤其对于热门用户）

### 性能瓶颈与解决方案

| 瓶颈                   | 表现                   | 解决方案                                   |
| -------------------- | -------------------- | -------------------------------------- |
| **Twitter API 速率限制** | 日志显示 `rate limit` 提示 | 添加备用 Cookie（`additional_cookies.yaml`） |
| **磁盘 I/O 瓶颈**        | 下载速度远低于带宽            | 使用 SSD 存储，或降低并发数                       |
| **网络延迟高**            | 单个文件下载时间长            | 检查代理设置，或启用调试模式 (`-dbg`) 查看请求耗时         |
| **内存不足**             | 系统卡顿或 OOM            | 降低 `max_download_routine` 到 10-20      |

### 监控与诊断

```bash
# 启用调试模式查看详细请求统计（-dbg 退出时输出各端点请求计数）
tmdp -user elonmusk -dbg

# 输出示例（真实日志行）：
# [download] Media batch start task_id=cli users=1 lists=0 workers=35
# [batch] Preprocess start users=1 workers=35 auto_follow=false
# [rate-limit] Request count endpoint=... count=150
```

***

## 故障排除进阶

### 常见错误码速查

| HTTP 状态码             | 错误类型                  | 原因                  | 解决方案                                           |
| -------------------- | --------------------- | ------------------- | ---------------------------------------------- |
| **429**              | Too Many Requests     | 触发 Twitter API 速率限制 | 等待 15 分钟自动恢复；或添加备用 Cookie                      |
| **401**              | Unauthorized          | Cookie 失效或过期        | 运行 `tmdp -conf` 更新 Cookie                      |
| **403**              | Forbidden（不可重试）     | 用户受保护且未关注           | 使用 `-auto-follow` / `-follow-members` 或手动关注后重试 |
| **404**              | Not Found（不可重试）     | 用户不存在/已注销/被封禁       | 检查用户名是否正确；用户可能已被封禁                             |
| **500**              | Internal Server Error | Twitter 服务器内部错误     | 稍后自动重试；检查网络连接                                  |
| **503**              | Service Unavailable   | Twitter 服务暂时不可用     | 等待服务恢复后重试                                      |
| **connection reset** | 网络连接中断                | 代理不稳定或网络波动          | 检查代理设置；启用 `-no-retry` 快速测试                     |

> **403/404 均为不可重试错误**：对应媒体立即失败并跳过（`[download] Skip non-retriable media ...`），不再自动重试（`isNonRetriableStatusError` 仅匹配 403/404）；仅 500/503 等错误才触发自动重试。

### 调试技巧集锦

#### 基础调试

```bash
# 1. 启用调试模式（查看请求计数和详细日志）
tmdp -user elonmusk -dbg

# 2. 快速退出模式（不重试失败项，快速验证配置）
tmdp -user elonmusk -no-retry

# 3. 仅标记不下载（测试同步逻辑，不实际下载文件）
tmdp -user elonmusk -mark-downloaded

# 4. 指定标记时间（回溯到特定时间点）
tmdp -user elonmusk -mark-downloaded -mark-time "2024-01-01T00:00:00"
```

#### 高级诊断

```bash
# 5. 测试单用户下载（最小化变量）
tmdp -user elonmusk -noprofile -dbg

# 6. 检查 API Server 是否正常
tmdp -server
# 然后在浏览器访问 http://localhost:25556/api/v1/health

# 7. 查看数据库内容（确认同步状态；需在 conf.yaml 的 root_path 下执行）
# latest_release_time 位于 user_entities 表（users 表无此列），需 JOIN：
sqlite3 .data/foo.db "SELECT u.screen_name, e.latest_release_time FROM users u LEFT JOIN user_entities e ON e.user_id = u.id;"

# 8. 检查失败记录
cat .data/errors.json | head -20
```

#### 网络问题排查

```bash
# 9. 测试代理连通性（Windows PowerShell）
$Env:HTTP_PROXY="http://127.0.0.1:7890"
$Env:HTTPS_PROXY="http://127.0.0.1:7890"
tmdp -user elonmusk -dbg

# 10. 绕过代理直连（TUN 模式下不需要设置代理）
# 直接运行 tmdp，不设置 HTTP_PROXY/HTTPS_PROXY
```



### 典型问题场景与解决方案

#### 场景 1：首次使用完全无法下载

**症状：**

```
[startup] Login failed error="..."
```

**排查步骤：**

1. ✅ 确认 Cookie 正确性（重新从浏览器复制）
2. ✅ 检查 Cookie 是否过期（Twitter 会定期刷新）
3. ✅ 尝试重新配置：`tmdp -conf`
4. ✅ 确认网络可以访问 Twitter（非墙内环境）

***

#### 场景 2：下载一段时间后停止

**症状：**

```
[rate-limit] Sleeping endpoint=... wake_at=... remaining=... limit=...
[rate-limit] Would block endpoint=... remaining=... limit=...
```

**原因：** 触发 Twitter API 速率限制（窗口与配额以响应头 `X-Rate-Limit-*` 为准，程序自动按剩余额度调度请求）

**解决方案：**

- **短期**：等待 15 分钟自动恢复

- **长期**：添加备用 Cookie 到 `additional_cookies.yaml`

- **优化**：降低并发数到 10-20

***

#### 场景 3：符号链接创建失败（Windows）

**症状：**

```
[batch] Symlink permission denied suppressed=5 hint=run_as_admin
[batch] Symlink create failed user="..." reason=permission_denied suppressing=true
```

**原因：** Windows 需要管理员权限才能创建符号链接

**解决方案：**

1. 右键点击 `tmdp.exe` → **"以管理员身份运行"**
2. 或在管理员 PowerShell 中执行：

   ```powershell
   Start-Process tmdp.exe -Verb RunAs -ArgumentList "-user elonmusk"
   ```

***

#### 场景 4：大文件下载失败

**症状：**

```
[downloader] Download failed, retrying... attempt=1 max_retries=2 url=https://... error="context deadline exceeded"
[download] Retry remaining tweet_id=1234567890 media=3
```

**原因：** 大视频文件下载超时或网络不稳定

**解决方案：**

1. 启用调试模式查看具体耗时：`-dbg`
2. 降低并发数减少带宽竞争
3. 检查磁盘空间是否充足
4. 使用 `-no-retry` 快速定位问题文件
