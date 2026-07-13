package domain

import (
	"errors"
	"regexp"
	"strings"
	"time"
)

const SourceTTL = 15 * time.Second

var studioIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]+$`)

type Source struct {
	StudioID     string    `json:"studioId"`
	ID           string    `json:"id"`
	Kind         string    `json:"kind"`
	Label        string    `json:"label"`
	WebsocketURL string    `json:"websocketUrl"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

func (s *Source) Normalize(now time.Time) error {
	s.StudioID = Clean(s.StudioID, 64)
	if s.StudioID == "" {
		s.StudioID = "default"
	}
	s.ID = Clean(s.ID, 128)
	s.Kind = Clean(s.Kind, 32)
	s.Label = Clean(s.Label, 128)
	s.WebsocketURL = Clean(s.WebsocketURL, 512)
	if !ValidStudioID(s.StudioID) || s.ID == "" || s.Label == "" || (s.Kind != "camera" && s.Kind != "microphone") {
		return errors.New("valid studioId, id, label and kind are required")
	}
	if !strings.HasPrefix(s.WebsocketURL, "wss://") && !strings.HasPrefix(s.WebsocketURL, "ws://") {
		return errors.New("websocketUrl must start with wss:// or ws://")
	}
	s.UpdatedAt = now.UTC()
	return nil
}

func StudioID(value string) (string, error) {
	value = Clean(value, 64)
	if value == "" {
		value = "default"
	}
	if !ValidStudioID(value) {
		return "", errors.New("studioId must contain only letters, numbers, _ or -")
	}
	return value, nil
}

func ValidStudioID(value string) bool { return value != "" && studioIDPattern.MatchString(value) }

func Clean(value string, max int) string {
	value = strings.TrimSpace(value)
	if len(value) > max {
		return value[:max]
	}
	return value
}
