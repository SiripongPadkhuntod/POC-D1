package httptransport_test

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"poc-d1/source-registry/internal/application"
	"poc-d1/source-registry/internal/domain"
	httptransport "poc-d1/source-registry/internal/transport/http"
)

type memoryRepository struct {
	mu      sync.Mutex
	sources map[string]domain.Source
}

func newMemoryRepository() *memoryRepository {
	return &memoryRepository{sources: map[string]domain.Source{}}
}
func (m *memoryRepository) List(_ context.Context, studioID string) ([]domain.Source, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	items := []domain.Source{}
	for _, item := range m.sources {
		if item.StudioID == studioID {
			items = append(items, item)
		}
	}
	sort.Slice(items, func(i, j int) bool { return items[i].Label < items[j].Label })
	return items, nil
}
func (m *memoryRepository) Upsert(_ context.Context, source domain.Source, _ time.Duration) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.sources[source.StudioID+"/"+source.ID] = source
	return nil
}
func (m *memoryRepository) Delete(_ context.Context, studioID, id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.sources, studioID+"/"+id)
	return nil
}

func TestSourceLifecycleAndStudioIsolation(t *testing.T) {
	repo := newMemoryRepository()
	handler := httptransport.NewHandler(application.NewRegistry(repo), slog.New(slog.NewTextHandler(io.Discard, nil)), func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	for _, body := range []string{`{"studioId":"a","id":"cam-1","kind":"camera","label":"A","websocketUrl":"wss://example.test/ws"}`, `{"studioId":"b","id":"cam-1","kind":"camera","label":"B","websocketUrl":"wss://example.test/ws"}`} {
		result := httptest.NewRecorder()
		handler.ServeHTTP(result, httptest.NewRequest(http.MethodPost, "/api/sources", strings.NewReader(body)))
		if result.Code != http.StatusOK {
			t.Fatalf("POST=%d %s", result.Code, result.Body.String())
		}
	}
	result := httptest.NewRecorder()
	handler.ServeHTTP(result, httptest.NewRequest(http.MethodGet, "/api/sources?studioId=a", nil))
	var payload struct {
		Sources []domain.Source `json:"sources"`
	}
	if err := json.NewDecoder(result.Body).Decode(&payload); err != nil {
		t.Fatal(err)
	}
	if len(payload.Sources) != 1 || payload.Sources[0].Label != "A" {
		t.Fatalf("sources=%+v", payload.Sources)
	}
	result = httptest.NewRecorder()
	handler.ServeHTTP(result, httptest.NewRequest(http.MethodDelete, "/api/sources?studioId=a&id=cam-1", nil))
	if result.Code != http.StatusOK {
		t.Fatalf("DELETE=%d", result.Code)
	}
}

func TestRejectsInvalidSource(t *testing.T) {
	handler := httptransport.NewHandler(application.NewRegistry(newMemoryRepository()), slog.New(slog.NewTextHandler(io.Discard, nil)), func(w http.ResponseWriter, _ *http.Request) {})
	result := httptest.NewRecorder()
	handler.ServeHTTP(result, httptest.NewRequest(http.MethodPost, "/api/sources", strings.NewReader(`{"id":"cam","kind":"camera","label":"Cam","websocketUrl":"https://example.test"}`)))
	if result.Code != http.StatusBadRequest {
		t.Fatalf("status=%d", result.Code)
	}
}
