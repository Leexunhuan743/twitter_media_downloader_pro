package downloading

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/jmoiron/sqlx"
	log "github.com/sirupsen/logrus"
	"github.com/unkmonster/tmd/internal/database"
	"github.com/unkmonster/tmd/internal/logging"
)

func updateUserLink(lnk *database.UserLink, db *sqlx.DB, path string) error {
	name := filepath.Base(path)

	linkpath, err := lnk.Path(db)
	if err != nil {
		log.Errorf("[download] Link path resolve failed link_id=%d error=%q", lnk.Id, err.Error())
		return err
	}
	path, err = filepath.Abs(path)
	if err != nil {
		log.Errorf("[download] Target path resolve failed path=%q error=%q", logging.Path(path), err.Error())
		return err
	}

	linkDir := filepath.Dir(linkpath)
	if err := os.MkdirAll(linkDir, 0755); err != nil {
		log.Errorf("[download] Link directory create failed path=%q error=%q", logging.Path(linkDir), err.Error())
		return err
	}

	if lnk.Name == name {
		return ensureUserSymlink(path, linkpath)
	}

	newlinkpath := filepath.Join(linkDir, name)

	if err = os.RemoveAll(linkpath); err != nil {
		log.Errorf("[download] Old link remove failed path=%q error=%q", logging.Path(linkpath), err.Error())
		return err
	}
	if err = ensureUserSymlink(path, newlinkpath); err != nil {
		return err
	}

	if err = database.UpdateUserLink(db, lnk.Id, name); err != nil {
		log.Errorf("[download] User link update failed link_id=%d name=%q error=%q", lnk.Id, name, err.Error())
		return err
	}
	lnk.Name = name
	return nil
}
func ensureUserSymlink(targetPath, linkPath string) error {
	if err := os.Symlink(targetPath, linkPath); err != nil {
		if !os.IsExist(err) {
			return err
		}
		return replaceStaleUserSymlink(targetPath, linkPath, err)
	}
	return nil
}

func replaceStaleUserSymlink(targetPath, linkPath string, existErr error) error {
	currentTarget, err := os.Readlink(linkPath)
	if err != nil {
		return existErr
	}
	if !filepath.IsAbs(currentTarget) {
		currentTarget = filepath.Join(filepath.Dir(linkPath), currentTarget)
	}
	currentTarget, err = filepath.Abs(currentTarget)
	if err != nil {
		return err
	}
	targetPath, err = filepath.Abs(targetPath)
	if err != nil {
		return err
	}
	if currentTarget == targetPath {
		return nil
	}

	backupPath := linkPath + ".stale"
	if err := os.Remove(backupPath); err != nil && !os.IsNotExist(err) {
		return err
	}
	if err := os.Rename(linkPath, backupPath); err != nil {
		return err
	}
	if err := os.Symlink(targetPath, linkPath); err != nil {
		if restoreErr := os.Rename(backupPath, linkPath); restoreErr != nil {
			os.Remove(backupPath) // best-effort cleanup of .stale
			return fmt.Errorf("symlink failed: %w (restore rename also failed: %v)", err, restoreErr)
		}
		return err
	}
	return os.Remove(backupPath)
}
