# Twitter API

Encapsulates Twitter/X private API access. This is the highest-risk layer — changes here break the core functionality.

## Client Configuration
Resty HTTP client with Twitter auth headers and rate limiting.

- **Resty** HTTP client with Twitter auth headers
- **Bearer Token** fetched at login
- **Rate limiting** via `EnableRateLimit(client)` — blocks or errors on trigger
- **Account-level errors** → `SetClientError()` marks account unavailable
- **Logs**: account and rate-limit logs follow [[logging#Twitter API Logs]]

## GraphQL Endpoints
Six GraphQL endpoints are used for user resolution, timeline fetching, and list operations.

| Endpoint | Function | File |
|----------|----------|------|
| UserByScreenName | Resolve user by handle | `user.go` |
| UserMedia timeline | Paginated tweet media fetch | `timeline.go` |
| Single tweet | Tweet detail lookup | `tweet.go` |
| List timeline | List-scoped media fetch | `list.go` |
| List by rest ID | List metadata lookup | `list.go` |
| List members | List member enumeration | `list.go` |
| User following | Paginated following list fetch | `list.go` |

## Multi-Account Mechanism
TMD supports one master account plus multiple additional accounts for rate limit distribution.

- **Master account**: `auth_token` + `ct0` from `conf.yaml`
- **Additional accounts**: list from `additional_cookies.yaml`
- **Account selection**: `SelectClientMFQ()`
  - Protected user → master account only (must be following)
  - Non-protected → prefer additional accounts (spread rate limit)
- **List operations** (`GetLst`, `GetMembers`): master account only — lists are user-private
- **User lookup**: `GetUserByScreenName` uses SelectClientMFQ with nil user (user isn't known yet)

Client selection logs use endpoint and account summaries only. They never log `auth_token`, `ct0`, Authorization headers, or raw response bodies.

## Error Types
Typed errors and error codes returned by the Twitter API layer, each with distinct handling semantics.

- `TwitterApiError` — API responded with error (wraps numeric code from `errors.go`)
- `ErrWouldBlock` — rate limit backoff, caller should retry later
- `ErrAccountLocked` (code 326) — account temp-locked, requires manual recovery
- `ErrOverCapacity` (code 130) — Twitter service overloaded
- **UserUnavailable** — suspended or deleted account (detected via `__typename` field, not a named error type)

The database layer also defines `ErrUserNotFound` (`database/user.go`) for user lookup failures.

## Protected Users

Protected (private) users require special handling since only followers can see their content.

1. Master account must follow the user
2. `AutoFollow=true` option for automatic follow-before-download
3. They are prioritized in the producer queue (only master can fetch)
4. Accessing a protected user without following returns `__typename == "UserUnavailable"` — the same signal used for suspended/deleted accounts. The caller must check the user's known `IsProtected` status before concluding the account is unavailable.
