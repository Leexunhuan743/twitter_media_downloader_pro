# API Response Observations

记录 TMD 实际运行时观察到的 Twitter/X GraphQL API 返回，用于排查 429 `error code: 1015` 等问题。

## 最近一次真实触发

- 时间：2026-08-15 11:07 ~ 11:09（+08:00）
- 命令：`go run . -dbg -list 2033597792896069633`
- Debug 日志：`%TEMP%\tmd-list-2033597792896069633-debug.log`
- 结果：List `116 fljj(2033597792896069633)` 获取到 543 个成员；下载过程中大量 UserMedia 请求返回 429。

## 观察到的 API 返回汇总

| API / 端点 | 状态 | 次数 | 响应特征 |
|---|---|---|---|
| `ListByRestId` | 200 | 1 | JSON，约 2320 bytes；带 `errors[].code=214` |
| `ListMembers` | 200 | 7 | JSON，每页约 200-217 KB |
| `UserMedia` | 200 | 179 | JSON timeline 数据 |
| `UserMedia` | 429 | 3187 | body 为 `error code: 1015`，`Retry-After` 55-60s |

本次运行中没有观察到 400、401、403、404、500 等其他 HTTP 状态。

### 200 但带 errors 的响应

`ListByRestId` 返回 HTTP 200，`data` 正常存在，但 JSON 同时包含：

```json
{
  "code": 214,
  "extensions": {
    "code": 214,
    "kind": "Validation",
    "name": "BadRequestError",
    "source": "Client"
  },
  "message": "BadRequest: com.twitter.strato.serialization.DecodeException",
  "path": ["list", "default_banner_media_results", "result"]
}
```

TMD 的 `CheckApiResp` 对“有 `data` 且 code=214”的响应返回 nil，所以这个错误被容忍，不影响 List 信息解析。但它说明 X 的响应里存在反序列化/校验异常字段，值得持续观察。

## 已保存的 JSON 样本

使用 `tools/xapi-probe -save-dir` 抓取并保存到 `tools/xapi-probe/saved-api-json/`：

| 文件 | 来源 API | 大小 |
|---|---|---|
| `UserByScreenName_default.json` | `UserByScreenName` | 约 2.4 KB |
| `UserByScreenName_browser.json` | `UserByScreenName` | 约 2.4 KB |
| `UserMedia_default.json` | `UserMedia` | 约 34 KB |
| `UserMedia_browser.json` | `UserMedia` | 约 34 KB |
| `ListByRestId_save.json` | `ListByRestId` | 约 2.3 KB |
| `ListMembers_save_page1.json` | `ListMembers` | 约 202 KB |

## 429 `error code: 1015` 详情

- 出现端点：仅 `UserMedia`
- 响应体：`error code: 1015\n`
- `Retry-After`：55 ~ 60 秒
- 响应头 Server：`cloudflare envoy` / `envoy`
- 按账号分布：

| 账号 | 429 次数 | 备注 |
|---|---|---|
| `@Sdfdff4L` | 2792 | 主要触发账号 |
| `@Leee848653E` | 395 | 次要触发账号 |

- 同一次运行中 `@Sdfdff4L` 也有 24 次 UserMedia 成功，说明它不是永久失效，而是在并发压力下被 Cloudflare 临时限流/风控。

## 成功响应示例

```text
[twitter] List response ok list_id=2033597792896069633 account=@V4268045 bytes=2320
[twitter] Timeline response ok endpoint=x.com/i/api/graphql/3dQPyRyAj6Lslp4e0ClXzg/ListMembers account=@V4268045 bytes=201652
[twitter] Timeline response ok endpoint=x.com/i/api/graphql/MOLbHrtk8Ovu7DUNOLcXiA/UserMedia account=@Sdfdff4L bytes=...
```

## 429 响应示例

```text
[twitter] Response error endpoint=x.com/i/api/graphql/MOLbHrtk8Ovu7DUNOLcXiA/UserMedia account=@Sdfdff4L status=429 retry_after=55 body="error code: 1015\n"
[twitter] Timeline response error endpoint=x.com/i/api/graphql/MOLbHrtk8Ovu7DUNOLcXiA/UserMedia account=@Sdfdff4L error="HTTP Error: 429 error code: 1015"
[twitter] UserMedia page failed user=... account=@Sdfdff4L error="HTTP Error: 429 error code: 1015"
[batch] User media fetch error user=... account=@Sdfdff4L error="HTTP Error: 429 error code: 1015"
```

## 其他工具观察

`tools/xapi-probe` 单次探测时：

- `UserByScreenName`：200
- `UserMedia`：200
- 主账号 + 6 个附加账号单次请求：全部 200
- 100/242 并发 UserMedia：全部 200

说明 1015 不是在单次请求或单纯高并发下必然出现，而是在真实长时间/多账号并发下载场景中触发，且集中在特定附加账号。

## 压力测试结果

使用 `tools/xapi-probe -stress` 对 List `2033597792896069633`（544 个成员）逐步加压，账号为主账号 + 6 个附加账号，请求为 `UserMedia`，每次请求 `count=5`。

| 并发 | 200 | 429 | 429 类型 | 首次触发账号 |
|---|---|---|---|---|
| 1 | 1 | 0 | - | - |
| 5 | 4 | 1 | `Rate limit exceeded` | additional#4 |
| 10 | 9 | 1 | `Rate limit exceeded` | additional#4 |
| 20 | 17 | 3 | `Rate limit exceeded` | additional#4 |
| 50 | 43 | 7 | `Rate limit exceeded` | additional#4 |
| 100 | 86 | 14 | `Rate limit exceeded` | additional#4 |
| 150 | 0 | 150 | `error code: 1015` | additional#5 |

结论：

- **普通 Twitter 429（`Rate limit exceeded`）**：从并发 5 开始出现，集中在 `additional#4`。
- **Cloudflare 1015**：在本次压力测试中首次出现在 **并发 150**，由 `additional#5` 触发，`Retry-After=60`。
- 100 并发时尚未出现 1015，150 并发时全部 1015，因此 1015 的触发阈值在 **100 ~ 150 并发之间**（本次阶梯未细分到 110~140）。

`additional#N` 是按 `additional_cookies.yaml` 顺序编号的标签，不代表 Twitter 屏幕名。

## 结论

当前观察到的 API 返回主要是：

- 正常：`200` + JSON
- Twitter 自身限流：`429` + `Rate limit exceeded`
- Cloudflare 限流/风控：`429` + `error code: 1015` + `Retry-After`

未发现 API 端点失效、参数变更或认证错误导致的返回变化。
