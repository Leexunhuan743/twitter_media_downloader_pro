package downloading

import (
	"github.com/jmoiron/sqlx"
	log "github.com/sirupsen/logrus"
	"github.com/unkmonster/tmd/internal/database"
	"github.com/unkmonster/tmd/internal/entity"
	"github.com/unkmonster/tmd/internal/naming"
	"github.com/unkmonster/tmd/internal/twitter"
)

func syncUserAndEntity(db *sqlx.DB, user *twitter.User, dir string, maxLen int) (*entity.UserEntity, error) {
	if err := database.SyncUser(db, user.Id, user.Name, user.ScreenName, user.IsProtected, user.FriendsCount, true); err != nil {
		log.Errorf("[download] User sync failed user=%q uid=%d error=%q", user.Title(), user.Id, err.Error())
		return nil, err
	}
	userNaming := naming.NewUserNaming(user.Name, user.ScreenName, maxLen)
	expectedTitle := userNaming.SanitizedTitle()

	ent, err := entity.NewUserEntity(db, user.Id, dir)
	if err != nil {
		log.Errorf("[download] User entity create failed user=%q uid=%d dir=%q error=%q", user.Title(), user.Id, dir, err.Error())
		return nil, err
	}
	if err = entity.Sync(ent, expectedTitle); err != nil {
		log.Errorf("[download] User entity sync failed user=%q uid=%d expected_title=%q error=%q", user.Title(), user.Id, expectedTitle, err.Error())
		return nil, err
	}
	return ent, nil
}

func shouldIgnoreUser(user *twitter.User) bool {
	if user == nil {
		return true
	}
	return user.Blocking || user.Muting
}
