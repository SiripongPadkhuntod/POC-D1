package application

import (
	"context"
	"time"

	"poc-d1/source-registry/internal/domain"
)

type SourceRepository interface {
	List(context.Context, string) ([]domain.Source, error)
	Upsert(context.Context, domain.Source, time.Duration) error
	Delete(context.Context, string, string) error
}

type Registry struct {
	repository SourceRepository
	now        func() time.Time
}

func NewRegistry(repository SourceRepository) *Registry {
	return &Registry{repository: repository, now: time.Now}
}

func (r *Registry) List(ctx context.Context, studioID string) ([]domain.Source, error) {
	return r.repository.List(ctx, studioID)
}

func (r *Registry) Register(ctx context.Context, source domain.Source) error {
	if err := source.Normalize(r.now()); err != nil {
		return err
	}
	return r.repository.Upsert(ctx, source, domain.SourceTTL)
}

func (r *Registry) Delete(ctx context.Context, studioID, sourceID string) error {
	return r.repository.Delete(ctx, studioID, sourceID)
}
