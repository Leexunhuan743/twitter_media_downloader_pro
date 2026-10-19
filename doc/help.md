# 获取 Cookie、list_id 与 screen_name

## 获取 Cookie

1. 用 Chrome 打开 <https://x.com> 并登录。
2. 按 `F12` 打开开发者工具，切到 **Application（应用）** → **Cookies** → `https://x.com`。
3. 复制 `auth_token` 与 `ct0` 两个值。
4. 填入配置，三种入口任选：
   - 交互式向导：`tmdp -conf`
   - 直接编辑 `conf.yaml` 的 cookie 字段
   - Web 控制台 **系统** 页的 Cookie 编辑器（支持多账号）

> Cookie 等同于账号凭据，不要提交到仓库、粘贴到公开渠道或分享给他人。账号被限制访问时，先确认 Cookie 未过期。

## 获取 list_id

打开要下载的列表页，URL 形如 `https://x.com/i/lists/1234567890`，其中 `1234567890` 就是 list_id。

## 获取 screen_name

screen_name 是用户名（不含 `@`）。个人主页 URL 形如 `https://x.com/elonmusk`，路径最后一段即 screen_name；命令行也可直接写 `@elonmusk`。

Web 控制台的下载页支持直接粘贴个人主页、推文或列表链接，由页面解析出 screen_name 或 list_id，无需手工提取。
