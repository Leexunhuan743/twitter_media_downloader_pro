package downloading

import (
	"context"

	"github.com/go-resty/resty/v2"
	"github.com/jmoiron/sqlx"
	log "github.com/sirupsen/logrus"
	"github.com/unkmonster/tmd/internal/database"
	"github.com/unkmonster/tmd/internal/entity"
	"github.com/unkmonster/tmd/internal/naming"
	"github.com/unkmonster/tmd/internal/twitter"
	"github.com/unkmonster/tmd/internal/utils"
)

func syncList(db *sqlx.DB, list *twitter.List) error {
	var ownerUserId uint64
	if list.Creator != nil {
		ownerUserId = list.Creator.Id
	}
	listdb, err := database.GetLst(db, list.Id)
	if err != nil {
		log.Errorf("[download] List load failed list_id=%d error=%q", list.Id, err.Error())
		return err
	}
	if listdb == nil {
		return database.CreateLst(db, &database.Lst{Id: list.Id, Name: list.Name, OwnerUserId: ownerUserId})
	}
	return database.UpdateLst(db, &database.Lst{Id: list.Id, Name: list.Name, OwnerUserId: ownerUserId})
}

func syncListAndGetMembers(ctx context.Context, client *resty.Client, db *sqlx.DB, lst twitter.ListBase, dir string, maxLen int, lsm *ListSyncManager) (entities []userInListEntity, members []*twitter.User, err error) {
	if v, ok := lst.(*twitter.List); ok {
		if err = syncList(db, v); err != nil {
			log.Errorf("[download] List sync failed list=%q error=%q", lst.Title(), err.Error())
			return nil, nil, err
		}
	}

	expectedTitle := naming.NewListNamingFromBase(lst, maxLen).SanitizedTitle()
	ent, err := entity.NewListEntity(db, lst.GetId(), dir)
	if err != nil {
		log.Errorf("[download] List entity create failed list=%q dir=%q error=%q", lst.Title(), dir, err.Error())
		return nil, nil, err
	}
	if err = entity.Sync(ent, expectedTitle); err != nil {
		log.Errorf("[download] List entity sync failed list=%q expected_title=%q error=%q", lst.Title(), expectedTitle, err.Error())
		return nil, nil, err
	}

	membersResult, err := lst.GetMembers(ctx, client)
	if err != nil {
		log.Errorf("[download] List members fetch failed list=%q error=%q", lst.Title(), err.Error())
		return nil, nil, err
	}

	eid, err := ent.Id()
	if err != nil {
		log.Errorf("[download] List entity id resolve failed list=%q error=%q", lst.Title(), err.Error())
		return nil, nil, err
	}

	members = membersResult.Users
	if len(members) == 0 {
		return nil, nil, nil
	}

	memberIDs := utils.ExtractIDs(members, func(u *twitter.User) uint64 { return u.Id })
	if err := database.MarkListMembersAccessibleByIDs(db, memberIDs); err != nil {
		log.Warnf("[download] List members accessibility mark failed list=%q members=%d error=%q", lst.Title(), len(memberIDs), err.Error())
	}
	if lsm != nil {
		if err = lsm.SyncListMembers(ctx, eid, lst.Title(), memberIDs); err != nil {
			log.Warnf("[download] List member links sync failed list=%q entity_id=%d members=%d error=%q", lst.Title(), eid, len(memberIDs), err.Error())
		}
	}

	entities = make([]userInListEntity, 0, len(members))
	for _, user := range members {
		entities = append(entities, userInListEntity{user: user, leid: eid})
	}
	return entities, members, nil
}
