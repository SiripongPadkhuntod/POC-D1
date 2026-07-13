package config

import (
	"os"
	"strings"
)

type Config struct {
	HTTPAddr  string
	RedisAddr string
}

func Load() Config {
	return Config{HTTPAddr: env("HTTP_ADDR", ":8080"), RedisAddr: env("REDIS_ADDR", "redis:6379")}
}

func env(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}
