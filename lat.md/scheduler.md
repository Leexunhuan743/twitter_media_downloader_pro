# Scheduler

Cron-like plan task system that triggers downloads on a schedule. Only active in Server mode. Configuration stored in `schedules.yaml`.

## Schedule Types

Four schedule types determine what content gets downloaded when a trigger fires.

| Type | Purpose |
|------|---------|
| `list` | Download all media in a Twitter List |
| `user` | Download all media from a specific user |
| `following` | Download media from a target user's followings |
| `mixed` | Combined multi-user/list/following download |

## Schedule Modes

Two modes control how often a schedule fires: fixed interval or daily time windows.

| Mode | Format | Example |
|------|--------|---------|
| `interval` | Go duration string | `1h30m` |
| `daily` | Comma-separated times | `08:00,20:00` |

## Configuration (schedules.yaml)

Schedules are defined in a YAML file at the app root directory.

```yaml
schedules:
  - type: user
    target: elonmusk
    name: "Elon Musk"
    schedule: "daily:08:00,20:00"
    enabled: true
    run_on_start: false
    auto_follow: true
    skip_profile: false
  - type: list
    target: "1234567890"
    schedule: "interval:4h"
    enabled: true
```

Optional download option fields: `auto_follow`, `follow_members`, `skip_profile`, `no_retry`. `mixed` type uses `users`, `lists`, `following_names` instead of `target`.

## Execution

A background goroutine checks the schedule periodically and triggers downloads.

- Background goroutine with periodic ticker
- On schedule match → calls `DownloadFunc` (bound to `server.scheduledDownload`)
- Creates a task → enqueues to [[task-management|DownloadQueue]] → normal task flow
- Tracks: run state, consecutive failure count, next execution time
- API endpoints to CRUD schedules, validate expressions, trigger immediately

Scheduler logs use [[logging#Peripheral Logs]] for start/stop/reload and trigger outcomes. User-visible trigger logs include schedule type, target, name, and `task_id`; stale generation details remain debug/warn diagnostics.
