package redisrepo

import (
	"context"
	"encoding/json"
	"sort"
	"time"

	"github.com/redis/go-redis/v9"
	"poc-d1/source-registry/internal/domain"
)

const keyPrefix = "poc-d1:studio:"

type SourceRepository struct{ client *redis.Client }

func NewSourceRepository(client *redis.Client) *SourceRepository {
	return &SourceRepository{client: client}
}

func (r *SourceRepository) List(ctx context.Context, studioID string) ([]domain.Source, error) {
	keys, err := r.client.Keys(ctx, key(studioID, "*")).Result()
	if err != nil {
		return nil, err
	}
	items := make([]domain.Source, 0, len(keys))
	if len(keys) == 0 {
		return items, nil
	}
	values, err := r.client.MGet(ctx, keys...).Result()
	if err != nil {
		return nil, err
	}
	for _, raw := range values {
		text, ok := raw.(string)
		if !ok {
			continue
		}
		var item domain.Source
		if json.Unmarshal([]byte(text), &item) == nil {
			items = append(items, item)
		}
	}
	sort.Slice(items, func(i, j int) bool { return items[i].Label < items[j].Label })
	return items, nil
}

func (r *SourceRepository) Upsert(ctx context.Context, source domain.Source, ttl time.Duration) error {
	encoded, err := json.Marshal(source)
	if err != nil {
		return err
	}
	return r.client.Set(ctx, key(source.StudioID, source.ID), encoded, ttl).Err()
}

func (r *SourceRepository) Delete(ctx context.Context, studioID, sourceID string) error {
	return r.client.Del(ctx, key(studioID, sourceID)).Err()
}

func key(studioID, sourceID string) string { return keyPrefix + studioID + ":source:" + sourceID }
