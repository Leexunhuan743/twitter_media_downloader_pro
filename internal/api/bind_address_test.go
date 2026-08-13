package api

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/unkmonster/tmd/internal/config"
)

// P1-5 修复回归：支持显式 bind 地址（默认空=所有网卡保持兼容）；当绑定
// 非 loopback 且未配置 API Key 时，必须发出安全警告（默认安装下无认证的
// 远程删除/关停面）。
func TestResolveBindAddress(t *testing.T) {
	cases := []struct {
		name string
		bind string
		port int
		want string
	}{
		{"default all interfaces", "", 25556, ":25556"},
		{"loopback", "127.0.0.1", 25556, "127.0.0.1:25556"},
		{"lan", "192.168.1.10", 9000, "192.168.1.10:9000"},
		{"ipv6 all", "::", 25556, "[::]:25556"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := serverListenAddr(c.bind, c.port)
			assert.Equal(t, c.want, got)
		})
	}
}

func TestWarnsWhenBindingNonLoopbackWithoutAPIKey(t *testing.T) {
	cases := []struct {
		name    string
		bind    string
		apiKey  string
		wantWarn bool
	}{
		{"default empty bind + no key", "", "", true},
		{"loopback + no key", "127.0.0.1", "", false},
		{"loopback ipv6 + no key", "::1", "", false},
		{"lan + key", "192.168.1.10", "secretkey123", false},
		{"lan + no key", "0.0.0.0", "", true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := shouldWarnUnsafeBind(c.bind, c.apiKey)
			assert.Equal(t, c.wantWarn, got)
		})
	}
}

var _ = config.Config{}
