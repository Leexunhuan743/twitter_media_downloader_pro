package entity

import (
	"fmt"
	"os"
)

// Sync 同步实体路径和名称
// 如果实体未创建，则创建它
// 如果实体名称与预期不符，则重命名
// 如果名称相同，则确保目录存在
func Sync(e Entity, expectedName string) error {
	if e == nil {
		return fmt.Errorf("entity is nil")
	}
	if err := ValidateName(expectedName); err != nil {
		return err
	}
	if !e.Recorded() {
		if err := e.Create(expectedName); err != nil {
			return fmt.Errorf("create entity %q: %w", expectedName, err)
		}
		return nil
	}

	name, err := e.Name()
	if err != nil {
		return fmt.Errorf("get entity name: %w", err)
	}
	if name != expectedName {
		if err := e.Rename(expectedName); err != nil {
			return fmt.Errorf("rename entity from %q to %q: %w", name, expectedName, err)
		}
		return nil
	}

	p, err := e.Path()
	if err != nil {
		return fmt.Errorf("get entity path: %w", err)
	}

	if err := os.MkdirAll(p, 0755); err != nil {
		return fmt.Errorf("ensure entity directory %q: %w", p, err)
	}
	return nil
}
