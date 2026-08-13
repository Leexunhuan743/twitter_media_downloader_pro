package database

import (
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/jmoiron/sqlx"
	log "github.com/sirupsen/logrus"
)

// legacyTimeFormats mirrors the formats modernc.org/sqlite accepts when reading
// DATETIME text values (see parseTimeFormats in the driver).
var legacyTimeFormats = []string{
	"2006-01-02 15:04:05.999999999-07:00",
	"2006-01-02T15:04:05.999999999-07:00",
	"2006-01-02 15:04:05.999999999",
	"2006-01-02T15:04:05.999999999",
	"2006-01-02 15:04",
	"2006-01-02T15:04",
	"2006-01-02",
}

// sqliteTimeLayout is the TEXT layout modernc.org/sqlite uses with
// _time_format=sqlite. It preserves the zone offset, which is why mixed-offset
// values compare lexically instead of by instant.
const sqliteTimeLayout = "2006-01-02 15:04:05.999999999-07:00"

// NormalizeTime returns t normalized to UTC. Every latest_release_time write
// path must pass through this so the stored TEXT order equals the instant
// order (see NormalizeLegacyTimestamps). It is idempotent, so callers may
// normalize before updating in-memory records as well.
func NormalizeTime(t time.Time) time.Time {
	return t.UTC()
}

// NormalizeNullTime returns the nullable timestamp normalized to UTC when
// Valid. It never mutates the caller's value (value semantics), so callers
// keep the original representation for their own bookkeeping.
func NormalizeNullTime(t sql.NullTime) sql.NullTime {
	if t.Valid {
		t.Time = t.Time.UTC()
	}
	return t
}

// NormalizeLegacyTimestamps rewrites user_entities.latest_release_time values
// stored by older versions with a non-UTC zone offset into UTC.
//
// SQLite compares stored TEXT values with BINARY (lexical) ordering, so a
// "+08:00" value and a "+00:00" value that represent the same instant sort
// differently; MAX() comparisons in UpdateUserEntityTweetStat can then keep an
// older baseline, causing re-downloads. Writing every timestamp in UTC makes
// the lexical order equal to the instant order. Values already stored in UTC
// are left untouched, so the migration is idempotent.
func NormalizeLegacyTimestamps(db *sqlx.DB) error {
	if db == nil {
		return fmt.Errorf("normalize legacy timestamps: database is nil")
	}
	rows, err := db.Query(`SELECT id, latest_release_time FROM user_entities WHERE latest_release_time IS NOT NULL`)
	if err != nil {
		return fmt.Errorf("load latest_release_time values: %w", err)
	}
	defer rows.Close()

	type update struct {
		id  int
		utc time.Time
	}
	var updates []update
	for rows.Next() {
		var id int
		var raw string
		if err := rows.Scan(&id, &raw); err != nil {
			return fmt.Errorf("scan latest_release_time row %d: %w", id, err)
		}
		parsed, ok := parseLegacyTime(raw)
		if !ok {
			// Unparseable values are left untouched; the reader side would
			// also fail on them, so nothing is gained by rejecting the DB.
			continue
		}
		utc := parsed.UTC()
		if utc.Format(sqliteTimeLayout) == raw {
			continue
		}
		updates = append(updates, update{id: id, utc: utc})
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate latest_release_time rows: %w", err)
	}

	for _, u := range updates {
		if _, err := db.Exec(`UPDATE user_entities SET latest_release_time=? WHERE id=?`, u.utc, u.id); err != nil {
			return fmt.Errorf("normalize latest_release_time for entity %d: %w", u.id, err)
		}
	}
	if len(updates) > 0 {
		log.Infof("[db] Normalized legacy entity timestamps count=%d", len(updates))
	}
	return nil
}

func parseLegacyTime(raw string) (time.Time, bool) {
	raw = strings.TrimSpace(raw)
	for _, layout := range legacyTimeFormats {
		if t, err := time.Parse(layout, raw); err == nil {
			return t, true
		}
	}
	return time.Time{}, false
}
