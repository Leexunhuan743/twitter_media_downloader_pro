package database

import (
	"fmt"

	"github.com/jmoiron/sqlx"
	log "github.com/sirupsen/logrus"
	"github.com/unkmonster/tmd/internal/logging"
	"github.com/unkmonster/tmd/internal/utils"
)

func Connect(path string) (*sqlx.DB, error) {
	recovered, err := recoverInterruptedSQLiteReplacement(path)
	if err != nil {
		return nil, fmt.Errorf("failed to recover interrupted database replacement at %q: %w", path, err)
	}
	if recovered {
		log.Warnf("[db] Recovered original database after interrupted replacement path=%q", logging.Path(path))
	}

	exists, err := utils.PathExists(path)
	if err != nil {
		return nil, fmt.Errorf("failed to check if db file exists at %q: %w", path, err)
	}

	if exists {
		if err := migrateExistingDatabase(path); err != nil {
			return nil, err
		}
	}

	db, err := openSQLiteFile(path, false)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database at %q: %w", path, err)
	}

	configureSQLiteConnection(db)

	if err := CreateTables(db); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to initialize tables at %q: %w", path, err)
	}
	if err := MigrateDatabase(db); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to migrate database at %q: %w", path, err)
	}

	// 旧版本可能以非 UTC 偏移写入 latest_release_time（SQLite 按文本序比较
	// MAX，混合偏移会让基线回退）。归一化为 UTC 使文本序等于时刻序；失败仅
	// 告警，不阻塞启动（下次启动会重试）。
	if err := NormalizeLegacyTimestamps(db); err != nil {
		log.Warnf("[db] Legacy timestamp normalization incomplete error=%q", err.Error())
	}

	if err := validateDatabase(db); err != nil {
		db.Close()
		return nil, fmt.Errorf("database at %q failed validation after initialization: %w", path, err)
	}

	if !exists {
		log.Debugf("[db] Created database file path=%q", logging.Path(path))
	}
	return db, nil
}
