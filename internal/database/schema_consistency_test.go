package database

import (
	"regexp"
	"sort"
	"strings"
	"testing"
)

// TestSchemaColumnsMatchRequiredSchema 守护列清单单一事实源：schema.go 的
// CREATE TABLE 文本与 sqlite_schema.go 的 requiredSchema 必须一致，否则
// 加列/改列时漏改任一处都会让 validateDatabase 校验与真实建表分叉。
func TestSchemaColumnsMatchRequiredSchema(t *testing.T) {
	createColumns := parseCreateTableColumns(schema)

	for table, required := range requiredSchema {
		got, ok := createColumns[table]
		if !ok {
			t.Errorf("schema const is missing CREATE TABLE for required table %q", table)
			continue
		}
		want := append([]string(nil), required...)
		sort.Strings(got)
		sort.Strings(want)
		if strings.Join(got, ",") != strings.Join(want, ",") {
			t.Errorf("table %q columns diverge:\n  CREATE TABLE: %v\n  requiredSchema: %v", table, got, want)
		}
	}
}

// TestRequiredSchemaCoversSchemaTables 反向校验：schema 中出现的表若不在
// requiredSchema 中，必须显式声明（如 entity_removal_journal 仅由建表创建、
// validateDatabase 不校验），防止新增表漏掉校验。
func TestRequiredSchemaCoversSchemaTables(t *testing.T) {
	createTables := parseCreateTableColumns(schema)
	declared := map[string]bool{"entity_removal_journal": true}
	for table := range createTables {
		if _, ok := requiredSchema[table]; !ok && !declared[table] {
			t.Errorf("table %q exists in CREATE TABLE but has no requiredSchema entry", table)
		}
	}
}

var createTableRe = regexp.MustCompile(`(?s)CREATE TABLE IF NOT EXISTS (\w+)\s*\((.*?)\);`)

// parseCreateTableColumns 从 schema 常量文本提取每张表的列名清单。
func parseCreateTableColumns(schemaText string) map[string][]string {
	out := make(map[string][]string)
	for _, m := range createTableRe.FindAllStringSubmatch(schemaText, -1) {
		table := m[1]
		var columns []string
		for _, line := range strings.Split(m[2], "\n") {
			line = strings.TrimSpace(line)
			if line == "" || strings.HasPrefix(line, "PRIMARY KEY") ||
				strings.HasPrefix(line, "UNIQUE") || strings.HasPrefix(line, "FOREIGN KEY") ||
				strings.HasPrefix(line, "CONSTRAINT") {
				continue
			}
			name := strings.TrimSuffix(line, ",")
			if idx := strings.IndexByte(name, ' '); idx != -1 {
				name = name[:idx]
			}
			if name != "" {
				columns = append(columns, name)
			}
		}
		out[table] = columns
	}
	return out
}
