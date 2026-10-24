# Twitter Media Downloader Pro

> **版本**: 3.8.2 | **状态**: 活跃维护 | **许可证**: GPL-3.0

Twitter Media Downloader Pro（简称 `tmdp`）基于 [unkmonster/tmd](https://github.com/unkmonster/tmd) 修改并扩展，新增功能与版本变更见 [Releases](https://github.com/Leexunhuan743/twitter_media_downloader_pro/releases)。

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

- [常见问题](#常见问题)

- [项目架构](#项目架构)

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

- **Go**: >= 1.26.0（从源码编译时需要）

- **操作系统**: Windows 10+, macOS 10.15+, Ubuntu 18.04+

- **编译器**: 支持 `CGO_ENABLED=0` 纯 Go 构建

- **内存**: 建议 >= 512MB

- **磁盘空间**: 根据下载数量而定

- **权限**: Windows 需要管理员权限（创建符号链接）；开启 Windows 开发者模式亦可创建符号链接

### 2. 下载/编译

**2.1 直接下载（推荐）**

前往 [Release](https://github.com/Leexunhuan743/twitter_media_downloader_pro/releases/latest) 下载对应平台的单文件可执行程序（每个平台提供 amd64 与 arm64 版本）：

| 平台 | 文件名 |
| --- | --- |
| Windows | `tmdp-windows-amd64.exe` / `tmdp-windows-arm64.exe` |
| Linux | `tmdp-linux-amd64` / `tmdp-linux-arm64` |
| macOS | `tmdp-darwin-amd64` / `tmdp-darwin-arm64` |
| 校验文件 | `checksums.txt` |

> **单文件，无依赖**：下载后即可直接运行，无需安装任何运行时或依赖库。放桌面就能用，放到 `PATH` 目录下更方便全局调用。

**首次运行与配置**

```bash
# Windows（cmd / PowerShell）
tmdp-windows-amd64.exe

# Linux / macOS
./tmdp-linux-amd64
```

> 注意：Twitter Media Downloader Pro 是命令行程序，当前可执行文件/命令名仍为 `tmdp`，请在终端中运行，**不要直接双击 exe 文件**（会一闪而过）。

首次运行会自动检测配置文件，不存在时进入**交互式配置向导**，依次填写 8 项：

1. 下载根目录 storage dir（必填）
2. `auth_token`
3. `ct0`
4. max download routine（最大并发下载数，1-100）
5. max user media fetch concurrent（UserMedia 抓取并发，0-35，0=使用默认值）
6. max file name len（最大文件名长度，50-245）
7. proxy_url（可留空）
8. api_key（可留空，设置后开启 HTTP 认证）

配置完成后即可正常使用。

> 注意：若设置了任一 `TMD_*` 环境变量（且未加 `-conf`），首次运行将跳过向导，直接使用环境变量配置。
>
> ⚠️ `-conf` 是**全量重填**：括号内显示的是各项默认值而不是当前值，直接回车会写入默认值或清空字符串字段，需要保留的旧值必须手动重新输入。

如需重新配置或修改参数，Windows 当前目录下运行 `.\tmdp-windows-amd64.exe -conf`（或重命名后运行 `.\tmdp.exe -conf`）可再次进入配置向导。若已加入 `PATH`，也可以直接运行 `tmdp -conf`。各配置项说明如下：

| 配置项 | 说明 | 默认值 | 示例 |
| --- | --- | --- | --- |
| storage dir | 文件存储目录 | 无（必填） | `D:\twitter_downloads` |
| auth_token | Twitter Cookie 中的 auth_token | 无（必填） | `a1b2c3d4e5f6...` |
| ct0 | Twitter Cookie 中的 ct0 | 无（必填） | `x1y2z3...` |
| max download routine | 最大并发下载数（1-100） | `min(50, CPU×10)`¹ | `35` |
| max user media fetch concurrent | UserMedia 抓取并发（0-35，0=默认） | `3` | `3` |
| max file name len | 最大文件名长度（50-245） | `158` | `158` |
| proxy_url | 代理 URL（http/https/socks5/socks5h） | 空（用 HTTP_PROXY/HTTPS_PROXY；均未设置则直连） | `http://127.0.0.1:7890` |
| api_key | 可选：API Key 认证（设置后开启 HTTP 认证，至少 8 字符） | 空（不启用） | `your-api-key` |

> ¹ `max download routine` 默认值为 `min(50, runtime.GOMAXPROCS(0)*10)`，即 CPU 核数的 10 倍且不超过 50。

`bind_address` 不在向导中询问，只能编辑 `conf.yaml`：它是 API Server 的监听地址（仅 `-server` 生效），留空监听所有网卡；仅本机访问时设为 `127.0.0.1:25556`。

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

项目通过 GitHub Actions 在推送 `v*` 标签时发布 Docker 镜像到 **Docker Hub** 和 **GHCR** 双仓库，两者镜像内容完全一致，任选其一即可：

| 镜像源 | 地址 |
| --- | --- |
| **Docker Hub**（推荐） | `docker.io/leeexx00/tmdp:<tag>` |
| **GHCR** | `ghcr.io/leexunhuan743/twitter_media_downloader_pro:<tag>` |

推送 `v*` tag 会跑完整发布流水线（校验 → 各平台二进制 → 镜像 → GitHub Release）。同一个版本会推送多个镜像标签：

| 标签 | 例子 | 含义 |
| --- | --- | --- |
| 版本号 | `3.8.2` | 精确版本，生产环境推荐固定用它 |
| 小版本 | `3.8` | 跟随 `3.8.x` 的最新补丁 |
| tag 同名 | `v3.8.2` | 与 git tag 一致的历史兼容别名 |
| `latest` | `latest` | 最近一个正式版本；预发布 tag（如 `v3.7.3-pre.1`）不会移动它 |

预发布 tag（名称含 `-`）只发布 GitHub pre-release 和对应版本号镜像，不更新 `latest` 与小版本别名：

```bash
# Docker Hub
docker pull leeexx00/tmdp:3.8.2

# GHCR
docker pull ghcr.io/leexunhuan743/twitter_media_downloader_pro:3.8.2
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
TMD_MAX_USER_FETCH_CONCURRENT=3
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

README 中的 compose 示例与仓库根目录的 [docker-compose.yml](./docker-compose.yml) 保持一致（默认使用 Docker Hub 镜像源）。需要可复现部署时，把示例里的 `:latest` 换成具体版本标签；`:latest` 只在手动触发的发布中刷新，可能落后于最新 tag。

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
      TMD_MAX_USER_FETCH_CONCURRENT: ${TMD_MAX_USER_FETCH_CONCURRENT:-3}
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
  -e TMD_MAX_USER_FETCH_CONCURRENT=3 \
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

- `TMD_MAX_DOWNLOAD_ROUTINE`：可选，默认由程序按 `min(50, CPU×10)` 计算；示例中设为 `8`

- `TMD_MAX_USER_FETCH_CONCURRENT`：可选，默认 `3`，范围 `0-35`（0=默认），控制 UserMedia 抓取并发

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

**环境变量（覆盖 `conf.yaml` 对应项）**

| 变量 | 说明 |
| --- | --- |
| `TMD_HOME` | 应用配置目录（默认 `%APPDATA%\.tmd2` / `~/.tmd2`），决定 `conf.yaml`、日志与 `bot_config.yaml` 的位置 |
| `TMD_PORT` | API Server 端口（仅 `-server` 生效，默认 `25556`） |
| `TMD_ROOT_PATH` | 存储根目录（覆盖 `root_path`） |
| `TMD_AUTH_TOKEN` / `TMD_CT0` | Twitter Cookie |
| `TMD_API_KEY` | API Key 认证 |
| `TMD_PROXY_URL` | 代理地址 |
| `TMD_MAX_DOWNLOAD_ROUTINE` / `TMD_MAX_USER_FETCH_CONCURRENT` / `TMD_MAX_FILE_NAME_LEN` | 并发与文件名长度 |

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

所有下载的数据**仅存储在本地**，不会上传到任何第三方服务器；完整目录布局见[文件存储结构](#文件存储结构)。


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

> 完整 API 文档见 [doc/API_DOCUMENTATION.md](doc/API_DOCUMENTATION.md)。

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

```

> 💡 **推荐搭配**：使用 [twitter-web-exporter](https://github.com/prinsss/twitter-web-exporter) 浏览器脚本导出推文或用户列表为 JSON 格式，然后用 `-jsonfile` 参数下载（`-jsonfolder` 只接受 tmdp 自己生成的 `.loongtweet` 目录）。

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
| `-conf`   | bool | false | 进入交互式向导，8 项全量重填；括号内显示各项默认值而非当前值；直接回车=使用默认值/清空字符串字段（不保留旧值），storage dir 不可为空 |
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

完整端点清单（下载、数据库管理、调度器、日志、配置、认证等）见 [API_DOCUMENTATION.md](doc/API_DOCUMENTATION.md)；常用调用的 curl 示例见[快速示例](#快速示例)。

> ⚠️ **认证**：`api_key` 为空时所有 `/api/v1` 路径免认证；设置 `api_key` 后，除公开路径（`/api/v1/health`、`/api/v1/auth/login`、`/api/v1/config/theme`、`/static/`、Web UI 页面）外必须携带 `Authorization: Bearer <key>`，也可先调用 `POST /api/v1/auth/login` 换取 1 小时有效的 JWT。401 响应含 `WWW-Authenticate` 与 `X-Token-Type`（`expired`/`invalid`）。详见[API Server 安全](#api-server-安全)。
>
> API JSON 中的 Twitter list ID 使用十进制字符串传输（如 `"2033436439346905439"`），避免 JavaScript Number 的 64 位精度丢失；URL 路径参数仍直接使用同一个十进制 ID。

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
| `pageSize`  | 20   | 每页数量（1-200，非法或超出范围回退 20） |
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

- **关闭协调**：立即拒绝新写请求并取消运行中任务，随后并行收敛已准入请求、下载队列、调度器、Bot 和 HTTP Server；任务 SSE 写出关停事件后主动退出，最后关闭数据库

- **超时保护**：所有关停阶段共享一个 45 秒总截止时间，不串行叠加多个超时窗口；空闲服务器不会因固定休眠被拖慢

- **幂等性**：使用 `sync.Once` 确保关闭只执行一次

### Web 管理界面

启动 Server 后，打开浏览器访问：

```
http://localhost:25556/
```

**单主题六视图界面（下载台 / download desk）**：内置一套无构建步骤的原生前端，唯一主题为 `download`（现代极简 SaaS 风格：中性灰底 + 圆角卡片 + 单一蓝色强调），真实路径路由的零构建 SPA，六个页面共用同一外壳；源码位于 `internal/api/web/download/`。

主题 API 保留：`GET /api/v1/config/themes`（可用主题+当前值）、`POST /api/v1/config/theme`（切换）。设置 `TMD_DEV=1` 启动时前端走本地目录文件而非嵌入资源，修改主题下的 HTML/JS/CSS 后刷新浏览器即可生效，无需重新编译。

页面（顶栏六个标签）：`/` 总览、`/tasks` 下载、`/data` 数据、`/schedules` 计划、`/logs` 日志、`/system` 系统。

- **总览（`/`）**：快速下载输入框（回车/按钮入队，支持剪贴板粘贴、多目标与链接解析）、队列与失败摘要、最近任务（阶段、进度、行内取消/重试/详情）、系统概况（版本、根目录、调度/日志统计）、失败记录面板（全部重试/清除），以及直达各页面的快捷入口；关键请求失败时显示可重试的错误条

- **下载（`/tasks`）**：左主区「新建下载」+「台账」，右侧固定「进行中」队列与「失败记录」；窄屏单列，顺序为 表单 → 进行中 → 台账

  - 目标框支持 `@handle`、`x.com/twitter.com` 链接、数字 list id、JSON 文件/文件夹路径，可多行粘贴；文件路径每行一个、可含空格与逗号；URL 取首段路径并排除 `i/status/home` 等保留段
  - 目标文本与标记时间作为草稿保存在本地（提交成功即清除），刷新或误关页面后不丢；台账的状态/类型/阶段/关键词筛选与页码同样跨刷新保留
  - 目标链接由前端解析成裸 screen name（后端只接受裸 handle），并实时显示识别结果（用户/列表/JSON/混合）
  - 七种方式：用户、关注、补档（profile）、列表、JSON、批量，以及「标记已下载」（可填时间）；补档同时支持用户与列表；可手动切换，未手动选择时按目标类型自动推断
  - 批量方式额外提供「关注源」输入：与上方用户/列表是两个独立目标，提交时作为 `following_names` 一并发送；只接受用户（数字会被当作列表而拒绝），逗号/空白分隔并自动去重，识别失败会直接指出无法识别的条目
  - 选项即后端四个 `DownloadFlags`：自动关注、含关注者、跳过 profile、失败不重试；JSON 方式还能直接上传 `.json` 文件（multipart，上传的任务不可重试）
  - `Enter` 或 `⌘/Ctrl + Enter` 提交；单次最多 20 个目标；总览页快速下载输入为空时自动读取剪贴板填入（环境不支持或拒绝读取时提示手动粘贴）
  - 台账走服务端分页（默认每页 50 条），支持状态/类型过滤、关键词搜索、页码与跳页（`/` 聚焦搜索）、新任务到达高亮、行选择与批量取消/重试/删除；点行任意空白处或按 Enter 直接打开任务详情；批量操作单次最多 200 条，超出部分跳过并提示；单任务取消与批量取消/重试前都弹确认，避免误点中断下载；失败行内直接显示原因摘要（悬停看全文）
  - 支持深链 `/tasks?status=failed&type=user&q=nasa&errors=1`，直接在外部入口打开已过滤的台账并展开失败记录
  - 进行中任务以卡片显示阶段、计数与细进度条，运行中可直接取消；进度变化只更新卡片内的文本与进度条，不重建节点，按钮焦点与按下状态不会被 SSE 刷新打断；任务详情用原生 `<dialog>` 展示阶段、数据、错误、原始 JSON 与同套操作按钮
  - 失败记录面板的账号行显示实体名、@handle 与类型徽标（数据来自 `/api/v1/errors` 的 `regular_details`）；实体已从库中删除时保留实体 ID，复制按钮始终复制 ID；JSON 来源行可一键复制完整路径，便于去磁盘处理

- **数据（`/data`）**：库统计 + 六个子标签（用户、列表、用户媒体、列表媒体、用户链接、改名历史），服务端搜索/排序/分页，支持页码按钮与跳页；子标签写入 `/data#user-links` 一类哈希，刷新与分享可回到同一张表
  - 过滤上下文条固定显示当前筛选与命中数，可一键清除；表格有骨架、空态、错误重试
  - 详情与编辑先 `GET` 单条记录取服务端最新值，再以差量 `PATCH` 保存；编辑框固定展示 ID、user_id、owner、parent_dir 等只读字段，与服务端字段错误回填；编辑有未保存改动时，按 Esc、点取消或离开页面都会先确认
  - 关联记录加载失败时显示错误与「重试」，重试只重新拉取关联面板，不关闭详情
  - 关联面板：用户 → 媒体/链接/改名历史；列表 → 列表媒体；列表媒体 → 成员链接；用户媒体 → 链接与改名历史；用户链接 → 所属媒体与父列表实体；改名历史 → 当前用户的媒体与链接
  - 删除走原生确认框并按类型给出影响说明；窄屏下表格重排为「标签: 值」卡片

- **计划（`/schedules`）**：计划条目增删改查、启停、立即触发（成功后立即回读状态）、全部触发（先确认）、重载配置；新建/编辑保存前先调 `/schedules/validate` 校验表达式，编辑时输入 600ms 防抖做服务端异步校验并回填字段错误；另有原始 `schedules.yaml` 编辑器
  - 删除后 20 秒内可撤销（按原条目重建计划）；计划名称可留空（列表里以 ID 显示），仅清空原有名称时才拦截
  - 运行状态横幅提示「调度器未运行」；编辑器、原始 YAML 与页面离开都有脏检查确认，避免误丢修改；保存原始 YAML 前若编辑器有未保存修改会先提示会被覆盖

- **日志（`/logs`）**：按级别、来源/域名、关键词、起止时间过滤，级别统计徽章（无筛选时一次 `/logs/stats` 取全量计数）；每页 50/100/200 条，上一页/下一页/回到最新；可订阅 `/logs/stream` 实时流（断线指数退避重连、自动滚底、新日志提示、回退时暂停跟随），DOM 缓存上限 3000 行；下载日志行内出现 16-20 位推文 ID 时显示 `ID` 徽标，点击在 X 打开该推文；支持每行复制与整份日志导出

- **系统（`/system`）**：结构化配置字段编辑（敏感值脱敏、只提交改动项、显示修改标记、支持清空/重置）、原始 `conf.yaml` 编辑（明文密钥警告，保存会覆盖上方表单未保存修改）、Cookie 账号增删与原始 YAML、运行信息（根路径、并发、队列、库统计）、危险区（清空失败记录、二次确认关闭服务器；关闭成功后整页进入停机态）
  - 「当前会话」卡片显示认证开关、令牌到期时间与状态徽章，可登录、测试连接、续期、清除会话；Cookie 输入为密码框
  - 配置字段、原始 YAML、Cookies 与登录状态均有脏检查，离开页面前确认
  - 敏感字段会拒绝粘贴进来的脱敏占位文本（`***` / `•••`），提示留空以保留原值；服务端保存错误若点名了字段，会就地把该字段标红并滚动过去；修改 API Key 保存成功后立即清除本机会话，需用新 Key 重新登录

- **实时更新**：使用 `GET /api/v1/sse/tasks` 的全量 `tasks` 快照与 `schedules` 快照，多标签页与断线重连都能保持一致

- **停机态**：服务器关闭后整页进入只读停机态——顶部红色横幅说明服务已停止，SSE 与令牌续期停止，新请求直接拒绝且不再弹网络错误 toast，清空失败记录/全部触发/关闭服务器等会写服务器的按钮禁用；刷新页面即恢复

- **多语言**：中文 / English 双语，右上角切换，选择保存在 `localStorage`（`tmd.lang`），默认跟随浏览器语言；支持 `?lang=en` 预览

- **明暗主题**：浅色 / 跟随系统 / 深色三态切换，保存于 `tmd.theme`，首帧前由内联脚本应用避免闪白，跟随系统时实时响应 `prefers-color-scheme`；支持 `?theme=dark` 预览

- **无障碍与键盘**：导航与弹窗支持键盘操作与焦点管理，toast 以 `aria-live` 播报（错误用 `role="alert"`），动画尊重 `prefers-reduced-motion`

- **认证**：`api_key` 非空时页面自动弹出对话框，输入 Key 换取 JWT（存 `localStorage`）；令牌到期前 5 分钟主动续期，401 时先 `/auth/refresh` 再重试一次；SSE 用查询参数携带令牌；页脚显示根目录、库统计、版本

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

> interval 最小值为 `1m`（1 分钟），支持带秒（如 `interval:90s`，展示为「每 1 分钟 30 秒」）。daily 模式时间点最多 **96 个**，必须使用 `HH:MM` 24 小时制，逗号分隔；重复的时间点会归并为一次。

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
| `entries[].schedule_display`     | 调度时间格式化显示（如 "每天 08:00"、"每 1 分钟 30 秒"） |
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
| Telegram | 长轮询（`getUpdates`，60s timeout）               | `/dl` `/status` `/cancel` `/tasks` `/stats` `/help` | 任务发起者的聊天；日志告警推送给 allowed_users | `token`（必填）             |
| Discord  | WebSocket Gateway + 全局 Slash 命令             | 同上（原生布尔选项）      | 任务发起者的频道；日志告警 DM 给 allowed_users | `token`（必填）             |
| WeChat   | wechat-robot-go iLink 协议（首次登录需扫码）          | 同上               | 任务发起者；日志告警给本次运行中出现过的用户     | `credential_path`（必填）   |
| Feishu   | HTTP 回调（默认 `/api/v1/bot/feishu/callback`）  | 同上               | 任务发起者；日志告警给本次运行中出现过的用户     | `app_id` + `app_secret`（必填） |
| Gotify   | Gotify HTTP 推送 API                          | 无（仅推送）          | 每个终止任务推送一次；错误日志告警         | `server_url` + `token`（必填） |
| Pushover | Pushover HTTP 推送 API                       | 无（仅推送）          | 每个终止任务推送一次；错误日志告警         | `user` + `token`（必填）     |

### 命令说明

Telegram / WeChat / Feishu 使用文本命令，Discord 使用 Slash 命令（选项为原生布尔值）；Telegram 额外支持 `/start`，`/dl` 也可写作 `/download`。文本命令的类型词与目标之间允许空格、连续空格或制表符：

```
/start                                         # 显示欢迎与帮助
/dl [user|list|foll] <target> [opt=val ...]   # 下载：user 用户 / list 列表ID / foll|following 关注列表；省略类型时默认 user
/status <task_id>                              # 查询任务状态
/cancel <task_id>                              # 取消任务
/tasks                                         # 列出近期任务（最近 10 条）
/stats                                         # 任务统计（排队/运行/完成/失败/取消/总数）
/help                                          # 帮助信息
```

示例：

```
/dl elonmusk
/dl user elonmusk
/dl list 1234567890123
/dl foll elonmusk auto_follow=true skip_profile=true
/dl following elonmusk              # following 是 foll 的别名
```

`/dl` 支持的命令选项（可简写）：

| 选项               | 简写 | 说明                          | 适用命令   |
| ---------------- | -- | --------------------------- | ------ |
| `auto_follow`    | `af` | 自动关注受保护用户                  | user/list/foll |
| `follow_members` | `fm` | 下载时关注目标/成员                  | user/list/foll |
| `skip_profile`   | `sp` | 跳过 Profile 下载               | user/list/foll |
| `no_retry`       | `nr` | 不重试失败推文                     | user/list/foll |

> Bot 命令走与 HTTP/调度器相同的任务队列路径：`/dl` 创建任务后必须经 `Server.EnqueueTask` 入队才会执行；`/cancel` 通过 `TaskManager.CancelTask` 取消，保证任务状态、上下文和 SSE 推送一致。入队失败会把任务标记为 failed，不会留下永远 queued 的任务。
>
> 任务在入队后可能瞬间失败，终态事件甚至早于适配器登记归属；各平台在登记后会立即复查任务状态，已终态则马上补发通知。

> 四个命令平台共用同一套解析与渲染：`internal/bot/commands.go` 负责 `/dl` 参数解析（类型词、列表 ID 校验、选项）与回复文案，`internal/bot/tracker.go` 记录“哪个聊天提交了哪些任务”，`internal/api/bot_commands.go` 负责建任务、入队与状态/列表/统计的文本渲染。新增命令时先扩展这两个共享文件，再在各平台接线。

### 通知机制

- **任务结果**：命令类平台只通知**发起该任务的聊天/用户/频道**（共享 `internal/bot/tracker.go` 的 `TaskTracker` 记录归属）；完成/失败会发通知，取消只清理归属不发消息；Gotify/Pushover 对每个终止任务广播一次（内部去重，避免重复推送）。
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

> 可选字段：`feishu.callback_path`（默认 `/api/v1/bot/feishu/callback`）；`gotify.priority` 留空或为 0 时按 5 发送。

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

备份以流式复制写出，不会把大文件整块读进内存。每个文件默认只保留最近 20 份备份，更早的会在新备份写入成功后自动删除；本次刚写好的备份无论文件名排序如何都不会被删（系统时钟回拨时按名字排序可能显得更旧），旧版本毫秒位不补零的备份名同样计入上限。不认识的同名文件（例如手工放进去的备份）不会被清理。

***

## 推文 JSON 保存

每次下载推文媒体（`-user`/`-list`/`-foll`/`-jsonfile`）时，会同时保存推文的完整信息到 `.loongtweet/` 子目录；`-jsonfolder` 与失败重试复用已有元数据，不重复写入。

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
│   │   ├── {推文文本}_{tweetID}.jpg/png/gif/mp4   # 推文媒体，直接位于用户目录（不按日期分目录）
│   │   └── .loongtweet/           # 推文元数据（-user/-list/-foll/-jsonfile 创建）
│   │       ├── {推文文本}_{tweetID}.json    # 推文 JSON（已清理）
│   │       ├── {推文文本}_{tweetID}.txt     # 推文文本
│   │       └── .profile/            # 用户资料（-noprofile 跳过）
│   │           ├── avatar.jpg
│   │           ├── banner.jpg
│   │           ├── description.txt
│   │           ├── profile.json
│   │           └── .versions/      # 历史版本
│   └── NASA(NASA)/
│       └── ...
├── 科技圈/                          # 列表目录（与 users/ 平级），内容为指向 users/… 的符号链接
│   └── Elon Musk(elonmusk) -> D:\...\users\Elon Musk(elonmusk)   # 绝对路径
└── .data/                          # 数据目录
    ├── foo.db                      # SQLite 数据库
    │                                 # 包含以下数据表：
    │                                 # - users: 用户信息（含 is_accessible 状态）
    │                                 # - lsts: 列表信息
    │                                 # - user_entities: 用户下载实体（含 media_count）
    │                                 # - lst_entities: 列表下载实体
    │                                 # - user_links: 用户链接关联
    │                                 # - user_previous_names: 用户历史名称（含 record_date）
    │                                 # - entity_removal_journal: 实体目录删除崩溃恢复日志（内部）
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

支持的协议：`http://`、`https://`、`socks5://`、`socks5h://`

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

> 脚本行为：自动查找同目录下的可执行文件并以 `-server` 模式启动，额外参数会透传给 tmdp。查找顺序：`tmdp-Windows-amd64.exe` → `tmdp.exe` → `tmdp` → `tmd-Windows-amd64.exe` → `tmd.exe` → `tmd`；若均不存在但本机装有 Go，会自动编译 `tmdp-test.exe` 后启动。设置 `TMD_DEV=1` 时直接 `go run . -server`，前端走本地文件（`internal/api/web/download/`）支持热刷新。

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

> **client.log 脱敏说明**：全量请求/响应日志中的敏感头（`Authorization`、`Cookie`、`X-Csrf-Token`、`Set-Cookie` 等）、URL userinfo、敏感查询参数和已知凭据字段不会明文落盘，值被替换为稳定指纹（如 `[redacted:xxxx]`）。单个请求/响应 body 以 **256 KB** 为调试输出上限；Resty 在响应 JSON 美化前检查响应体，在请求体格式化后检查请求体，最终日志块仍为 lumberjack 的 2 MB 单次写入上限保留余量。

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

另：CLI 完成时输出 `[task] Result summary="main(downloaded=N, Failedtweet=N), profile(downloaded=N, failed=N, versionedfile=N)"`（无媒体统计的操作输出 `[task] Result message=...`，如 `"Marked 3 users as downloaded"`）；API 模式在 `GET /api/v1/tasks/{task_id}` 的任务详情中查看同样字段。


## 常见问题

### Q: 如何查看失败的下载？

失败的任务保存在 `{存储目录}/.data/errors.json`，下次运行会自动重试。详见[故障排除](#常见错误码速查)。

### Q: Profile 文件存在时还会重新下载吗？

如果文件内容未变更（MD5 校验），会自动跳过。详见[下载机制要点](#下载机制要点)。

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

> 上表是经验参考，不是硬性限制：`max_download_routine` 可设 1-100，默认 `min(50, CPU×10)`；实际吞吐还受代理带宽、Twitter 限流与磁盘 I/O 影响。

**配置方法：**

```bash
# 方式1：直接编辑 conf.yaml
#   max_download_routine: 35

# 方式2：环境变量临时覆盖
#   TMD_MAX_DOWNLOAD_ROUTINE=35 tmdp -user elonmusk

# 方式3：交互式向导（全量重填，括号内显示默认值而非当前值）
tmdp -conf
```

### 下载机制要点

- **流式下载**：媒体小于 10 MB 走 Buffer（内存缓冲，支持 MD5 去重），大于等于 10 MB 走流式分块写入；失败整文件重试最多 2 次（间隔递增），最后一次不会自动回退 Buffer；不支持断点续传。
- **增量拉取**：按 `user_entities.latest_release_time` 只拉取新推文，完成后更新时间戳。
- **MD5 去重**：写入前比对目标文件大小与 MD5（大小不同直接写，大小相同再比 MD5），内容未变则静默跳过。
- **符号链接去重**：多列表包含同一用户时，列表目录下只放指向 `users/…` 的符号链接，本地仅保留一份存档；Windows 需管理员权限或开发者模式。

### 性能瓶颈与解决方案

| 瓶颈                   | 表现                   | 解决方案                                   |
| -------------------- | -------------------- | -------------------------------------- |
| **Twitter API 速率限制** | 日志显示 `rate limit` 提示 | 添加备用 Cookie（`additional_cookies.yaml`） |
| **UserMedia 抓取并发过高** | 日志出现 429 / `error code: 1015` | 降低 `max_user_fetch_concurrent`（默认 `3`，范围 `0-35`，0=默认） |
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

> **403/404 均为不可重试错误**：对应媒体立即失败并跳过（`[download] Skip non-retriable media ...`），不再自动重试（`IsNonRetriableStatusError` 仅匹配 403/404）；仅 500/503 等错误才触发自动重试。

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
[startup] login failed: <error details>
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

> 符号链接创建失败只会告警/抑制，不影响媒体下载（`internal/downloading/batch_download.go:259-278`）；也可改用 `-jsonfolder` 补下缺失媒体。

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
