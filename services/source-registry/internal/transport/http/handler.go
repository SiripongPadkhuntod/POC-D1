package httptransport

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"poc-d1/source-registry/internal/application"
	"poc-d1/source-registry/internal/domain"
)

type Handler struct{ registry *application.Registry }

func NewHandler(registry *application.Registry, logger *slog.Logger, health http.HandlerFunc) http.Handler {
	h := &Handler{registry: registry}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", health)
	mux.Handle("/api/sources", h)
	return withCORS(withAccessLog(logger, mux))
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		h.list(w, r)
	case http.MethodPost:
		h.upsert(w, r)
	case http.MethodDelete:
		h.delete(w, r)
	case http.MethodOptions:
		w.WriteHeader(http.StatusNoContent)
	default:
		w.Header().Set("Allow", "GET, POST, DELETE, OPTIONS")
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
	}
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	studioID, err := domain.StudioID(r.URL.Query().Get("studioId"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	items, err := h.registry.List(r.Context(), studioID)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, errors.New("source storage unavailable"))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"sources": items})
}

func (h *Handler) upsert(w http.ResponseWriter, r *http.Request) {
	var source domain.Source
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&source); err != nil {
		writeError(w, http.StatusBadRequest, errors.New("invalid JSON body"))
		return
	}
	if err := h.registry.Register(r.Context(), source); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	studioID, err := domain.StudioID(r.URL.Query().Get("studioId"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	id := domain.Clean(r.URL.Query().Get("id"), 128)
	if id == "" {
		writeError(w, http.StatusBadRequest, errors.New("id is required"))
		return
	}
	if err := h.registry.Delete(r.Context(), studioID, id); err != nil {
		writeError(w, http.StatusServiceUnavailable, errors.New("source storage unavailable"))
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func writeError(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, map[string]string{"error": err.Error()})
}
func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func withAccessLog(logger *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started := time.Now()
		next.ServeHTTP(w, r)
		logger.Info("request", "method", r.Method, "path", r.URL.Path, "duration", time.Since(started))
	})
}
