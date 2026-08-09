package config

import (
	_ "embed"
)

//go:embed default_bot_config.yaml
var defaultBotConfig []byte

// WriteDefaultBotConfig writes the commented starter configuration used on first server startup.
func WriteDefaultBotConfig(path string) error {
	return writeFileAtomic(path, defaultBotConfig, 0600)
}
