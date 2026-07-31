package logging

import (
	"github.com/natefinch/lumberjack"
	log "github.com/sirupsen/logrus"
)

// NewRotatingWriter 创建 lumberjack 轮转日志写入器。
// 主日志（tmd2.log）与 HTTP 客户端日志（client.log）共用同一套参数：
// 单文件 2MB、保留 2 份备份、14 天、gzip 压缩。两个文件各自独立轮转。
func NewRotatingWriter(path string) *lumberjack.Logger {
	return &lumberjack.Logger{
		Filename:   path,
		MaxSize:    2,
		MaxBackups: 2,
		MaxAge:     14,
		Compress:   true,
	}
}

// NewTextFormatter 返回 logrus 文本格式化的共享基础配置。
// 调用方可按输出端需求覆盖差异字段：
//   - 主日志终端输出：ForceColors = true（文件端由 LumberjackHook 剥离 ANSI）
//   - HTTP 客户端日志：DisableQuote = true（resty 多行请求/响应文本不做转义）
func NewTextFormatter() *log.TextFormatter {
	return &log.TextFormatter{
		FullTimestamp:  true,
		DisableSorting: true,
		PadLevelText:   false,
	}
}
