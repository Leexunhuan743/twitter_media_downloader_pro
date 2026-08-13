package entity

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/jmoiron/sqlx"
	"github.com/unkmonster/tmd/internal/database"
)

const (
	stagedDirectoryPrefix        = ".tmd-remove-"
	stagedDirectoryVersionPrefix = stagedDirectoryPrefix + "v1-"
	stagedDirectoryHashBytes     = 16
	stagedDirectoryHashLength    = stagedDirectoryHashBytes * 2
)

func entityPath(parentDir, name string) (string, error) {
	if err := ValidateName(name); err != nil {
		return "", err
	}
	return joinEntityPath(parentDir, name)
}

// storedEntityPath resolves names already persisted by older versions. Legacy
// trailing spaces and dots are normalized only on Windows, where Win32 resolves
// them to the same path without the suffix. New names always use ValidateName.
func storedEntityPath(parentDir, name string) (string, error) {
	normalized, err := normalizeStoredName(name)
	if err != nil {
		return "", err
	}
	return joinEntityPath(parentDir, normalized)
}

func joinEntityPath(parentDir, name string) (string, error) {
	if parentDir == "" {
		return "", fmt.Errorf("entity parent directory is empty")
	}
	return filepath.Join(parentDir, name), nil
}

// entityDirectoryOwnedByAnother 检查目标目录是否已被其他实体的记录占用。
// 不同 owner 可能因命名归一化（遗留尾点/尾空格在 Windows 与无尾点记录
// 映射到同一目录）或大小写变体共享同一目录；Create 必须拒绝这种冲突，
// 否则两个实体记录指向同一目录导致媒体混写。
func entityDirectoryOwnedByAnother(db *sqlx.DB, parentDir, path, ownerKind string, ownerID uint64) (bool, error) {
	if db == nil {
		return false, fmt.Errorf("entity database is nil")
	}
	type entityRow struct {
		Kind    string `db:"kind"`
		OwnerID uint64 `db:"owner_id"`
		Name    string `db:"name"`
		Parent  string `db:"parent_dir"`
	}
	var rows []entityRow
	if err := db.Select(&rows, `
		SELECT 'user' AS kind, user_id AS owner_id, name, parent_dir FROM user_entities WHERE parent_dir=?
		UNION ALL
		SELECT 'list' AS kind, lst_id AS owner_id, name, parent_dir FROM lst_entities WHERE parent_dir=?`,
		parentDir, parentDir); err != nil {
		return false, fmt.Errorf("load sibling entity paths: %w", err)
	}
	target := comparablePath(path)
	for _, row := range rows {
		if row.Kind == ownerKind && row.OwnerID == ownerID {
			continue
		}
		sibling, err := storedEntityPath(row.Parent, row.Name)
		if err != nil {
			continue
		}
		if comparablePath(sibling) == target {
			return true, nil
		}
	}
	return false, nil
}

// ValidateName ensures an entity name cannot escape its configured parent directory.
func ValidateName(name string) error {
	if err := validateNameComponent(name); err != nil {
		return err
	}
	if isStagedDirectoryPrefix(name) {
		return fmt.Errorf("%w: name uses an internal reserved prefix: %q", ErrInvalidName, name)
	}
	return validateWindowsCompatibleName(name)
}

// isStagedDirectoryPrefix reports whether name carries the internal staged
// removal prefix, case-insensitively (Windows file systems are
// case-insensitive, so a case variant would otherwise bypass the check).
func isStagedDirectoryPrefix(name string) bool {
	if len(name) < len(stagedDirectoryPrefix) {
		return false
	}
	return strings.EqualFold(name[:len(stagedDirectoryPrefix)], stagedDirectoryPrefix)
}

func normalizeStoredName(name string) (string, error) {
	if err := validateNameComponent(name); err != nil {
		return "", err
	}
	if runtime.GOOS != "windows" {
		return name, nil
	}

	normalized := strings.TrimRight(name, " .")
	if err := validateNameComponent(normalized); err != nil {
		return "", fmt.Errorf("%w: legacy name is not addressable on Windows: %q", ErrInvalidName, name)
	}
	if err := validateWindowsCompatibleName(normalized); err != nil {
		return "", fmt.Errorf("%w: legacy name is not safely addressable on Windows: %q", ErrInvalidName, name)
	}
	return normalized, nil
}

func validateNameComponent(name string) error {
	if name == "" || name == "." || name == ".." {
		return fmt.Errorf("%w: %q", ErrInvalidName, name)
	}
	if strings.ContainsRune(name, 0) || strings.ContainsAny(name, `/\`) || filepath.IsAbs(name) || filepath.Base(name) != name {
		return fmt.Errorf("%w: name must be a single path component: %q", ErrInvalidName, name)
	}
	return nil
}

func validateWindowsCompatibleName(name string) error {
	if strings.TrimRight(name, " .") != name {
		return fmt.Errorf("%w: name cannot end with a space or dot: %q", ErrInvalidName, name)
	}
	if strings.ContainsAny(name, `:*?"<>|`) {
		return fmt.Errorf("%w: name contains a Windows-reserved character: %q", ErrInvalidName, name)
	}
	for _, value := range name {
		if value < 32 {
			return fmt.Errorf("%w: name contains a control character: %q", ErrInvalidName, name)
		}
	}

	base := strings.TrimRight(strings.ToUpper(strings.SplitN(name, ".", 2)[0]), " ")
	reserved := base == "CON" || base == "PRN" || base == "AUX" || base == "NUL" ||
		base == "CLOCK$" || base == "CONIN$" || base == "CONOUT$" ||
		isWindowsReservedPortName(base)
	if reserved {
		return fmt.Errorf("%w: name is reserved on Windows: %q", ErrInvalidName, name)
	}
	return nil
}

func isWindowsReservedPortName(base string) bool {
	if !strings.HasPrefix(base, "COM") && !strings.HasPrefix(base, "LPT") {
		return false
	}
	switch base[3:] {
	case "1", "2", "3", "4", "5", "6", "7", "8", "9", "\u00b9", "\u00b2", "\u00b3":
		return true
	default:
		return false
	}
}

// StagedDirectoryCleanupResult summarizes startup recovery of interrupted
// entity removals.
type StagedDirectoryCleanupResult struct {
	Removed  int
	Restored int
}

// CleanupStagedDirectories reconciles staged removal directories with active
// records. Versioned stages are restored when their record still exists and
// removed after its record is gone. Conflicting recovery targets and ambiguous
// legacy stages are retained for manual inspection. Database parent directories
// are scanned in addition to the configured roots supplied by the caller.
func CleanupStagedDirectories(db *sqlx.DB, parentDirs ...string) (StagedDirectoryCleanupResult, error) {
	var result StagedDirectoryCleanupResult
	if db == nil {
		return result, fmt.Errorf("entity database is nil")
	}
	type storedEntity struct {
		Name      string `db:"name"`
		ParentDir string `db:"parent_dir"`
	}
	var activeEntities []storedEntity
	if err := db.Select(&activeEntities, `
		SELECT name, parent_dir FROM user_entities
		UNION ALL
		SELECT name, parent_dir FROM lst_entities
	`); err != nil {
		return result, fmt.Errorf("load active entity paths before staged cleanup: %w", err)
	}

	scanDirs := append([]string(nil), parentDirs...)
	journals, err := database.ListEntityRemovalJournals(db)
	if err != nil {
		return result, err
	}
	journalByStagedPath := make(map[string]database.EntityRemovalJournal, len(journals))
	var cleanupErr error
	for _, journal := range journals {
		normalized, err := normalizeRemovalJournal(journal)
		if err != nil {
			cleanupErr = errors.Join(cleanupErr, err)
			continue
		}
		scanDirs = append(scanDirs, filepath.Dir(normalized.StagedPath))
		stagedKey := comparablePath(normalized.StagedPath)
		if existing, exists := journalByStagedPath[stagedKey]; exists {
			cleanupErr = errors.Join(cleanupErr, fmt.Errorf("duplicate entity removal journals staged=%q duplicate=%q", existing.StagedPath, normalized.StagedPath))
			continue
		}
		journalByStagedPath[stagedKey] = normalized
	}

	activePaths := make(map[string]struct{}, len(activeEntities))
	activeByParentAndHash := make(map[string]map[string][]string)
	for _, active := range activeEntities {
		scanDirs = append(scanDirs, active.ParentDir)
		parentKey := comparablePath(active.ParentDir)
		activePath, err := storedEntityPath(active.ParentDir, active.Name)
		if err != nil {
			cleanupErr = errors.Join(cleanupErr, fmt.Errorf("resolve active entity path in %q: %w", active.ParentDir, err))
			continue
		}
		activePaths[comparablePath(activePath)] = struct{}{}
		byHash := activeByParentAndHash[parentKey]
		if byHash == nil {
			byHash = make(map[string][]string)
			activeByParentAndHash[parentKey] = byHash
		}
		hash := stagedDirectoryNameHash(filepath.Base(activePath))
		// 归一化可能让不同记录（如遗留 "foo." 与 "foo"）映射到同一目录；
		// 去重后按真实候选数判断歧义，避免假歧义永久阻塞恢复。
		existing := byHash[hash]
		dup := false
		for _, candidate := range existing {
			if comparablePath(candidate) == comparablePath(activePath) {
				dup = true
				break
			}
		}
		if !dup {
			byHash[hash] = append(byHash[hash], activePath)
		}
		if _, err := os.Lstat(activePath); err == nil {
			continue
		} else if !os.IsNotExist(err) {
			cleanupErr = errors.Join(cleanupErr, fmt.Errorf("inspect active entity path %q: %w", activePath, err))
		}

	}

	handledJournals := make(map[string]struct{}, len(journalByStagedPath))
	seen := make(map[string]struct{}, len(scanDirs))
	for _, parentDir := range scanDirs {
		if parentDir == "" {
			cleanupErr = errors.Join(cleanupErr, fmt.Errorf("entity parent directory is empty"))
			continue
		}
		parentDir = filepath.Clean(parentDir)
		parentKey := comparablePath(parentDir)
		if _, ok := seen[parentKey]; ok {
			continue
		}
		seen[parentKey] = struct{}{}

		entries, err := os.ReadDir(parentDir)
		if os.IsNotExist(err) {
			continue
		}
		if err != nil {
			cleanupErr = errors.Join(cleanupErr, fmt.Errorf("scan entity parent directory %q: %w", parentDir, err))
			continue
		}
		for _, entry := range entries {
			if !isStagedDirectoryPrefix(entry.Name()) {
				continue
			}
			stagedPath := filepath.Join(parentDir, entry.Name())
			stagedKey := comparablePath(stagedPath)
			journal, journaled := journalByStagedPath[stagedKey]
			info, err := entry.Info()
			if err != nil {
				cleanupErr = errors.Join(cleanupErr, fmt.Errorf("inspect staged entity path %q: %w", stagedPath, err))
				continue
			}
			if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
				if journaled {
					cleanupErr = errors.Join(cleanupErr, fmt.Errorf("retain journaled staged path %q: path is not a regular directory", stagedPath))
				}
				continue
			}
			_, stagedPathIsActive := activePaths[stagedKey]
			if stagedPathIsActive && journaled {
				cleanupErr = errors.Join(cleanupErr, fmt.Errorf("retain staged entity directory %q: path is both active and journaled", stagedPath))
				continue
			}
			if stagedPathIsActive {
				continue
			}
			if journaled {
				handledJournals[stagedKey] = struct{}{}
				targetKey := comparablePath(journal.OriginalPath)
				_, active := activePaths[targetKey]
				restoreTarget := journal.OriginalPath
				// 尾点/尾空格记录在 Windows 被归一化（storedEntityPath
				// TrimRight），其他平台按原样存储；journal 的 OriginalPath
				// 可能来自任一平台。原样未命中时尝试变体匹配，避免把中断
				// 删除误判为已提交而 RemoveAll 掉媒体。
				if !active {
					base := filepath.Base(journal.OriginalPath)
					trimmed := strings.TrimRight(base, " .")
					if trimmed != base {
						// journal 带尾点（如 "foo."）：active 记录可能是
						// 归一化后的 "foo"（Windows 扫描）。恢复目标用
						// 裁剪名（与 active 记录的磁盘名一致）。
						altKey := comparablePath(filepath.Join(filepath.Dir(journal.OriginalPath), trimmed))
						if _, activeAlt := activePaths[altKey]; activeAlt {
							targetKey = altKey
							restoreTarget = filepath.Join(filepath.Dir(journal.OriginalPath), trimmed)
							active = true
						}
					} else {
						// journal 是裁剪名（Windows 源删除流程经
						// storedEntityPath 归一化）：active 记录可能是
						// 原样尾点名（"foo."，Linux 扫描）。在 activePaths
						// 中找同父目录且裁剪后 base 相等的记录，恢复目标
						// 用记录的实际路径。
						dirKey := comparablePath(filepath.Dir(journal.OriginalPath))
						var matches []string
						for candidate := range activePaths {
							if comparablePath(filepath.Dir(candidate)) != dirKey {
								continue
							}
							if strings.TrimRight(filepath.Base(candidate), " .") == base {
								matches = append(matches, candidate)
							}
						}
						if len(matches) == 1 {
							targetKey = comparablePath(matches[0])
							restoreTarget = matches[0]
							active = true
						} else if len(matches) > 1 {
							// 同名尾点变体并存（如 Linux 上 "foo." 与
							// "foo" 两个真实目录），恢复目标不明：保留。
							cleanupErr = errors.Join(cleanupErr, fmt.Errorf("retain journaled entity directory %q: recovery target is ambiguous", stagedPath))
							continue
						}
					}
				}
				if active {
					if _, err := os.Lstat(restoreTarget); os.IsNotExist(err) {
						if err := os.Rename(stagedPath, restoreTarget); err != nil {
							cleanupErr = errors.Join(cleanupErr, fmt.Errorf("restore journaled entity directory %q to %q: %w", stagedPath, restoreTarget, err))
							continue
						}
						activePaths[targetKey] = struct{}{}
						result.Restored++
					} else if err != nil {
						cleanupErr = errors.Join(cleanupErr, fmt.Errorf("inspect journaled entity recovery target %q: %w", restoreTarget, err))
						continue
					} else {
						cleanupErr = errors.Join(cleanupErr, fmt.Errorf("retain journaled entity directory %q: active recovery target %q already exists", stagedPath, restoreTarget))
						continue
					}
				} else if err := os.RemoveAll(stagedPath); err != nil {
					cleanupErr = errors.Join(cleanupErr, fmt.Errorf("remove committed journaled entity directory %q: %w", stagedPath, err))
					continue
				} else {
					result.Removed++
				}
				if err := database.DeleteEntityRemovalJournal(db, journal.StagedPath); err != nil {
					cleanupErr = errors.Join(cleanupErr, err)
				}
				continue
			}

			if hash, versioned := parseStagedDirectoryHash(entry.Name()); versioned {
				candidates := activeByParentAndHash[parentKey][hash]
				if len(candidates) > 1 {
					cleanupErr = errors.Join(cleanupErr, fmt.Errorf("retain staged entity directory %q: recovery target is ambiguous", stagedPath))
					continue
				}
				if len(candidates) == 1 {
					targetPath := candidates[0]
					if _, err := os.Lstat(targetPath); os.IsNotExist(err) {
						if err := os.Rename(stagedPath, targetPath); err != nil {
							cleanupErr = errors.Join(cleanupErr, fmt.Errorf("restore staged entity directory %q to %q: %w", stagedPath, targetPath, err))
							continue
						}
						activePaths[comparablePath(targetPath)] = struct{}{}
						result.Restored++
						continue
					} else if err != nil {
						cleanupErr = errors.Join(cleanupErr, fmt.Errorf("inspect staged entity recovery target %q: %w", targetPath, err))
						continue
					} else {
						cleanupErr = errors.Join(cleanupErr, fmt.Errorf("retain staged entity directory %q: active recovery target %q already exists", stagedPath, targetPath))
						continue
					}
				}
				// A stage without a journal is not evidence that an entity row was
				// committed as deleted. It can be a user-created directory with the
				// reserved-looking prefix, or an interrupted pre-journal removal.
				// With no unique active target, retain it for inspection rather than
				// risking a recursive deletion of media we cannot prove is orphaned.
				cleanupErr = errors.Join(cleanupErr, fmt.Errorf("retain unjournaled staged entity directory %q: no matching active entity record", stagedPath))
				continue
			}

			// Legacy unversioned stages have no hash or journal to establish
			// ownership, so they are always retained. A warning is preferable to
			// treating a prefix collision as authorization to RemoveAll.
			cleanupErr = errors.Join(cleanupErr, fmt.Errorf("retain unjournaled legacy staged entity directory %q: no removal journal", stagedPath))
		}
	}
	for stagedKey, journal := range journalByStagedPath {
		if _, handled := handledJournals[stagedKey]; handled {
			continue
		}
		if _, err := os.Lstat(journal.StagedPath); os.IsNotExist(err) {
			if err := database.DeleteEntityRemovalJournal(db, journal.StagedPath); err != nil {
				cleanupErr = errors.Join(cleanupErr, err)
			}
		} else if err != nil {
			cleanupErr = errors.Join(cleanupErr, fmt.Errorf("inspect journaled staged path %q: %w", journal.StagedPath, err))
		}
	}
	return result, cleanupErr
}

func normalizeRemovalJournal(journal database.EntityRemovalJournal) (database.EntityRemovalJournal, error) {
	journal.StagedPath = filepath.Clean(journal.StagedPath)
	journal.OriginalPath = filepath.Clean(journal.OriginalPath)
	if !filepath.IsAbs(journal.StagedPath) || !filepath.IsAbs(journal.OriginalPath) {
		return journal, fmt.Errorf("invalid entity removal journal: paths must be absolute staged=%q original=%q", journal.StagedPath, journal.OriginalPath)
	}
	if comparablePath(filepath.Dir(journal.StagedPath)) != comparablePath(filepath.Dir(journal.OriginalPath)) {
		return journal, fmt.Errorf("invalid entity removal journal: paths are not siblings staged=%q original=%q", journal.StagedPath, journal.OriginalPath)
	}
	hash, ok := parseStagedDirectoryHash(filepath.Base(journal.StagedPath))
	if !ok {
		return journal, fmt.Errorf("invalid entity removal journal: staged path has an unsupported name %q", journal.StagedPath)
	}
	expectedHash := stagedDirectoryNameHash(filepath.Base(journal.OriginalPath))
	if hash != expectedHash {
		return journal, fmt.Errorf("invalid entity removal journal: staged path does not match original path staged=%q original=%q", journal.StagedPath, journal.OriginalPath)
	}
	return journal, nil
}

// stagedDirectoryNameHash hashes the normalized base name. Trailing dots and
// spaces are stripped first because Windows resolves them to the same path as
// the trimmed name (storedEntityPath normalizes them); a stage created on one
// platform must match the same record scanned on another, otherwise recovery
// silently degrades to zero candidates and RemoveAll can delete live media.
// Interior dots (extensions) are preserved.
func stagedDirectoryNameHash(name string) string {
	name = strings.TrimRight(name, " .")
	sum := sha256.Sum256([]byte(name))
	return hex.EncodeToString(sum[:stagedDirectoryHashBytes])
}

func stagedDirectoryPattern(path string) string {
	return stagedDirectoryVersionPrefix + stagedDirectoryNameHash(filepath.Base(path)) + "-*"
}

func parseStagedDirectoryHash(name string) (string, bool) {
	if !strings.HasPrefix(name, stagedDirectoryVersionPrefix) {
		return "", false
	}
	remainder := strings.TrimPrefix(name, stagedDirectoryVersionPrefix)
	if len(remainder) <= stagedDirectoryHashLength || remainder[stagedDirectoryHashLength] != '-' {
		return "", false
	}
	hash := remainder[:stagedDirectoryHashLength]
	if _, err := hex.DecodeString(hash); err != nil {
		return "", false
	}
	return hash, true
}

func comparablePath(value string) string {
	value = filepath.Clean(value)
	if runtime.GOOS == "windows" {
		value = strings.ToLower(value)
	}
	return value
}

type directoryChange struct {
	oldPath string
	newPath string
	moved   bool
	created bool
}

func ensureEntityDirectory(path string) (directoryChange, error) {
	change := directoryChange{newPath: path}
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return change, fmt.Errorf("create entity parent directory %q: %w", filepath.Dir(path), err)
	}

	err := os.Mkdir(path, 0755)
	if err == nil {
		change.created = true
		return change, nil
	}
	if !os.IsExist(err) {
		return change, fmt.Errorf("create entity directory %q: %w", path, err)
	}

	info, statErr := os.Lstat(path)
	if statErr != nil {
		return change, fmt.Errorf("inspect existing entity directory %q: %w", path, statErr)
	}
	if !info.IsDir() {
		return change, fmt.Errorf("entity path %q exists and is not a directory", path)
	}
	return change, nil
}

func renameEntityDirectory(parentDir, oldName, newName string) (directoryChange, error) {
	oldPath, err := storedEntityPath(parentDir, oldName)
	if err != nil {
		return directoryChange{}, fmt.Errorf("resolve current entity path: %w", err)
	}
	newPath, err := entityPath(parentDir, newName)
	if err != nil {
		return directoryChange{}, fmt.Errorf("resolve target entity path: %w", err)
	}
	if oldPath == newPath {
		return ensureEntityDirectory(oldPath)
	}

	oldInfo, err := os.Lstat(oldPath)
	if os.IsNotExist(err) {
		newInfo, targetErr := os.Lstat(newPath)
		if targetErr == nil {
			if !newInfo.IsDir() {
				return directoryChange{}, fmt.Errorf("%w: target path %q exists and is not a directory", ErrPathConflict, newPath)
			}
			// 崩溃残留自愈：上次 Rename 已把目录移到目标位置但 DB 记录
			// 未提交（进程在 os.Rename 与 name-only CAS 之间被杀/断电），
			// 或目标目录已存在（用户手工放置）。两者 FS 状态不可区分，
			// 接管该目录并让调用方提交 DB 更新，避免实体永久 ErrPathConflict
			// 卡死。directoryChange 标记为空操作：DB 更新失败时目录本就
			// 不在 oldPath，不能移回，保持现状待下次 Sync 重试。
			return directoryChange{oldPath: oldPath, newPath: newPath}, nil
		} else if !os.IsNotExist(targetErr) {
			return directoryChange{}, fmt.Errorf("inspect target entity path %q: %w", newPath, targetErr)
		}
		return ensureEntityDirectory(newPath)
	}
	if err != nil {
		return directoryChange{}, fmt.Errorf("inspect current entity directory %q: %w", oldPath, err)
	}
	if !oldInfo.IsDir() {
		return directoryChange{}, fmt.Errorf("current entity path %q is not a directory", oldPath)
	}

	newInfo, newErr := os.Lstat(newPath)
	if newErr == nil && !os.SameFile(oldInfo, newInfo) {
		return directoryChange{}, fmt.Errorf("%w: target path %q already exists", ErrPathConflict, newPath)
	}
	if newErr != nil && !os.IsNotExist(newErr) {
		return directoryChange{}, fmt.Errorf("inspect target entity path %q: %w", newPath, newErr)
	}

	if err := os.Rename(oldPath, newPath); err != nil {
		return directoryChange{}, fmt.Errorf("rename entity directory from %q to %q: %w", oldPath, newPath, err)
	}
	return directoryChange{oldPath: oldPath, newPath: newPath, moved: true}, nil
}

// recoverEmptyStoredEntityDirectory creates or adopts a new directory for a
// legacy record whose empty stored name has no safe source path. In particular,
// it never interprets the parent directory itself as the entity directory.
func recoverEmptyStoredEntityDirectory(targetPath string) (directoryChange, error) {
	return ensureEntityDirectory(targetPath)
}

func (c directoryChange) rollback(operationErr error) error {
	var rollbackErr error
	switch {
	case c.moved:
		rollbackErr = os.Rename(c.newPath, c.oldPath)
	case c.created:
		rollbackErr = os.Remove(c.newPath)
	}
	if rollbackErr == nil || os.IsNotExist(rollbackErr) {
		return operationErr
	}
	return errors.Join(operationErr, fmt.Errorf("rollback entity directory change: %w", rollbackErr))
}

type stagedDirectoryRemoval struct {
	originalPath string
	stagedPath   string
}

func stageEntityDirectoryRemoval(db *sqlx.DB, path string) (stagedDirectoryRemoval, error) {
	staged := stagedDirectoryRemoval{originalPath: path}
	info, err := os.Lstat(path)
	if os.IsNotExist(err) {
		return staged, nil
	}
	if err != nil {
		return staged, fmt.Errorf("inspect entity directory %q: %w", path, err)
	}
	if !info.IsDir() {
		return staged, fmt.Errorf("entity path %q is not a directory", path)
	}

	temp, err := os.CreateTemp(filepath.Dir(path), stagedDirectoryPattern(path))
	if err != nil {
		return staged, fmt.Errorf("reserve temporary entity path: %w", err)
	}
	tempPath := temp.Name()
	if closeErr := temp.Close(); closeErr != nil {
		_ = os.Remove(tempPath)
		return staged, fmt.Errorf("close temporary entity path %q: %w", tempPath, closeErr)
	}
	if err := os.Remove(tempPath); err != nil {
		return staged, fmt.Errorf("release temporary entity path %q: %w", tempPath, err)
	}
	if err := os.Rename(path, tempPath); err != nil {
		return staged, fmt.Errorf("stage entity directory %q for removal: %w", path, err)
	}
	staged.stagedPath = tempPath
	journal := database.EntityRemovalJournal{StagedPath: staged.stagedPath, OriginalPath: staged.originalPath}
	if err := database.CreateEntityRemovalJournal(db, journal); err != nil {
		return staged, staged.rollback(db, err)
	}
	return staged, nil
}

func (s stagedDirectoryRemoval) rollback(db *sqlx.DB, operationErr error) error {
	if s.stagedPath == "" {
		return operationErr
	}
	if _, err := os.Lstat(s.originalPath); err == nil {
		return errors.Join(operationErr, fmt.Errorf("restore entity directory: destination %q already exists", s.originalPath))
	} else if !os.IsNotExist(err) {
		return errors.Join(operationErr, fmt.Errorf("inspect entity restore path %q: %w", s.originalPath, err))
	}
	if err := os.Rename(s.stagedPath, s.originalPath); err != nil {
		return errors.Join(operationErr, fmt.Errorf("restore entity directory %q: %w", s.originalPath, err))
	}
	if err := database.DeleteEntityRemovalJournal(db, s.stagedPath); err != nil {
		return errors.Join(operationErr, err)
	}
	return operationErr
}

func (s stagedDirectoryRemoval) commit(db *sqlx.DB) error {
	if s.stagedPath == "" {
		return nil
	}
	if err := os.RemoveAll(s.stagedPath); err != nil {
		return fmt.Errorf("remove staged entity directory %q: %w", s.stagedPath, err)
	}
	return database.DeleteEntityRemovalJournal(db, s.stagedPath)
}
