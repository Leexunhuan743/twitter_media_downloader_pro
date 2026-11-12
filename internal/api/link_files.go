package api

import (
	"fmt"
	"os"

	log "github.com/sirupsen/logrus"
	"github.com/unkmonster/tmd/internal/database"
	"github.com/unkmonster/tmd/internal/logging"
)

// 用户链接在磁盘上表现为列表目录里的符号链接（或目录链接）。
// 数据库行与链接文件必须成对维护：只删行会留下无法追踪的孤儿链接，
// 只改名不改文件会让下次下载按新名字重建出第二份链接。

// removeUserLinkFile 删除链接文件；不存在视为成功（幂等）。
func removeUserLinkFile(path string) error {
	if path == "" {
		return nil
	}
	if _, err := os.Lstat(path); err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("inspect user link %q: %w", path, err)
	}
	if err := os.Remove(path); err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("remove user link %q: %w", path, err)
	}
	return nil
}

// renameUserLinkFile 跟随改名把链接文件移到新名字；源不存在时不算错误。
// 返回是否真的移动过，便于数据库失败时回滚。
func renameUserLinkFile(oldPath, newPath string) (bool, error) {
	if oldPath == "" || newPath == "" || oldPath == newPath {
		return false, nil
	}
	if _, err := os.Lstat(oldPath); err != nil {
		if os.IsNotExist(err) {
			return false, nil
		}
		return false, fmt.Errorf("inspect user link %q: %w", oldPath, err)
	}
	if err := os.Rename(oldPath, newPath); err != nil {
		return false, fmt.Errorf("rename user link %q -> %q: %w", oldPath, newPath, err)
	}
	return true, nil
}

// userLinkPath 计算链接文件路径；父列表实体已不存在时返回空串（对应目录已消失）。
func userLinkPath(db interface {
	Get(dest interface{}, query string, args ...interface{}) error
}, link *database.UserLink) string {
	if link == nil {
		return ""
	}
	path, err := link.PathWithTx(db)
	if err != nil || path == "" {
		log.Debugf("[api] User link path unavailable link_id=%d error=%q", link.Id, safeErrText(err))
		return ""
	}
	return path
}

func safeErrText(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

// removeUserLinkFiles 删除某个用户的全部链接文件，用于删除用户前清理磁盘。
// 任一文件删除失败都会返回错误，调用方应中止删除，避免留下孤儿链接。
func (s *Server) removeUserLinkFiles(userID uint64) (int, error) {
	links, err := database.GetUserLinks(s.db, userID)
	if err != nil {
		return 0, err
	}
	removed := 0
	for _, link := range links {
		path := userLinkPath(s.db, link)
		if path == "" {
			continue
		}
		if err := removeUserLinkFile(path); err != nil {
			log.Errorf("[api] User link remove failed user_id=%d path=%q error=%q", userID, logging.Path(path), err.Error())
			return removed, err
		}
		removed++
	}
	return removed, nil
}
