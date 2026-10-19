package bot

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
)

// Kind 是 /dl 命令的目标类型。
type Kind string

const (
	KindUser      Kind = "user"
	KindList      Kind = "list"
	KindFollowing Kind = "foll"
)

// Request 是解析完成的 /dl 命令参数。
type Request struct {
	Kind   Kind
	Target string
	ListID uint64
	Flags  DownloadOptions
}

// 命令解析错误。
var (
	ErrEmptyTarget   = errors.New("empty download target")
	ErrInvalidKind   = errors.New("invalid download kind")
	ErrInvalidListID = errors.New("invalid list id")
)

// KindFromString 把命令里的类型词转换为 Kind。
// 接受 user、list、foll/following；空字符串视为 user。
func KindFromString(raw string) (Kind, bool) {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "", "user":
		return KindUser, true
	case "list":
		return KindList, true
	case "foll", "following":
		return KindFollowing, true
	}
	return "", false
}

// ParseDownloadArgs 解析 /dl 的首个类型词与目标。
// 支持 "user <name>"、"list <id>"、"foll|following <name>" 或裸 <name>（按用户处理）。
// 与旧实现不同，这里用 strings.Fields 切分，因此 tab 与连续空格不会破坏解析。
func ParseDownloadArgs(raw string) (Kind, string) {
	fields := strings.Fields(raw)
	if len(fields) == 0 {
		return KindUser, ""
	}
	kind, ok := KindFromString(fields[0])
	if !ok || len(fields) == 1 {
		// 未知类型词或只有类型词时，按用户处理并保留原始输入。
		return KindUser, strings.TrimSpace(raw)
	}
	return kind, strings.Join(fields[1:], " ")
}

// ParseDownloadCommand 解析完整的 /dl 参数：类型 + 目标 + 末尾的 key=value 选项。
func ParseDownloadCommand(raw string) (Request, error) {
	clean, flags := ParseDownloadOptions(raw)
	kind, target := ParseDownloadArgs(clean)
	return NewDownloadRequest(kind, target, flags)
}

// NewDownloadRequest 校验目标并生成 Request。列表类型要求十进制数字 ID。
func NewDownloadRequest(kind Kind, target string, flags DownloadOptions) (Request, error) {
	target = strings.TrimSpace(target)
	if target == "" {
		return Request{}, ErrEmptyTarget
	}
	req := Request{Kind: kind, Target: target, Flags: flags}
	switch kind {
	case KindList:
		id, err := strconv.ParseUint(target, 10, 64)
		if err != nil || id == 0 {
			return Request{}, ErrInvalidListID
		}
		req.ListID = id
	case KindUser, KindFollowing:
	default:
		return Request{}, ErrInvalidKind
	}
	return req, nil
}

// 命令回复文案。所有平台共用，避免同样的提示在各适配器里各写一份。
const (
	UsageDownload      = "Usage: /dl [user|list|foll] <target> [opt=val ...]\nOptions: auto_follow/af, skip_profile/sp, no_retry/nr, follow_members/fm"
	UsageDownloadShort = "Usage: /dl [user|list|foll] <target>"
	UsageStatus        = "Usage: /status <task_id>"
	UsageCancel        = "Usage: /cancel <task_id>"

	TaskNotFound       = "Task not found."
	TaskNotCancellable = "Task already in terminal state."
	NoTasks            = "No tasks."
	EnqueueFailed      = "Failed to enqueue download task."
	InvalidListIDText  = "Invalid list ID. Must be a number."
	UnauthorizedText   = "⛔ Unauthorized"

	HelpText = "TMD Bot running.\n" +
		"/dl [user|list|foll] <target> [opt=val ...] - download\n" +
		"  Options: af, sp, nr, fm (auto_follow, skip_profile, no_retry, follow_members)\n" +
		"/status <id> - task status\n" +
		"/cancel <id> - cancel task\n" +
		"/tasks - list recent tasks\n" +
		"/stats - task statistics\n" +
		"/help - this message"
)

// DownloadStartedMessage 生成任务已提交的回复。markdown=true 时任务 ID 用反引号包裹。
func DownloadStartedMessage(target, taskID string, markdown bool) string {
	if markdown {
		return fmt.Sprintf("📥 Download started for %s\nTask: %s", target, "\x60"+taskID+"\x60")
	}
	return fmt.Sprintf("📥 Download started for %s\nTask: %s", target, taskID)
}
