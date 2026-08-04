package config

import (
	_ "embed"
	"os"
)

//go:embed default_bot_config.yaml
var defaultBotConfig []byte

// WriteDefaultBotConfig writes the commented starter configuration used on first server startup.
func WriteDefaultBotConfig(path string) error {
	return os.WriteFile(path, defaultBotConfig, 0644)
}
