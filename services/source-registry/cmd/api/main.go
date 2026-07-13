package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/redis/go-redis/v9"
	"poc-d1/source-registry/internal/application"
	"poc-d1/source-registry/internal/config"
	redisrepo "poc-d1/source-registry/internal/infrastructure/redis"
	httptransport "poc-d1/source-registry/internal/transport/http"
)

func main() {
	cfg := config.Load()
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	client := redis.NewClient(&redis.Options{Addr: cfg.RedisAddr})
	defer client.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := client.Ping(ctx).Err(); err != nil {
		logger.Error("redis unavailable", "error", err)
		os.Exit(1)
	}

	registry := application.NewRegistry(redisrepo.NewSourceRepository(client))
	health := func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if err := client.Ping(r.Context()).Err(); err != nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = w.Write([]byte(`{"ok":false,"service":"source-registry","redis":"unavailable"}`))
			return
		}
		_, _ = w.Write([]byte(`{"ok":true,"service":"source-registry","redis":"connected"}`))
	}
	server := &http.Server{Addr: cfg.HTTPAddr, Handler: httptransport.NewHandler(registry, logger, health), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 10 * time.Second, IdleTimeout: 60 * time.Second}
	go func() {
		logger.Info("source registry listening", "addr", server.Addr)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("server stopped", "error", err)
			os.Exit(1)
		}
	}()
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	shutdown, done := context.WithTimeout(context.Background(), 10*time.Second)
	defer done()
	_ = server.Shutdown(shutdown)
}
