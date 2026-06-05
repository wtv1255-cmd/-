package handler

import (
	"encoding/json"
	"net"
	"net/http"
	"strings"

	"github.com/basketikun/infinite-canvas/service"
)

type promptSyncRequest struct {
	Category string `json:"category"`
}

func Prompts(w http.ResponseWriter, r *http.Request) {
	result, err := service.ListPrompts(parseQuery(r))
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func PromptSync(w http.ResponseWriter, r *http.Request) {
	if !isLocalRequest(r) {
		Fail(w, "仅允许本机同步")
		return
	}

	var request promptSyncRequest
	_ = json.NewDecoder(r.Body).Decode(&request)
	category := strings.TrimSpace(request.Category)
	synced := []string{}

	for _, item := range service.ListPromptCategories() {
		if !item.Remote && category != item.Category {
			continue
		}
		if category != "" && item.Category != category {
			continue
		}
		if _, err := service.SyncPromptCategory(item.Category); err != nil {
			FailError(w, err)
			return
		}
		synced = append(synced, item.Category)
	}

	OK(w, map[string]any{
		"categories": synced,
		"count":      len(synced),
	})
}

func isLocalRequest(r *http.Request) bool {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	if strings.EqualFold(host, "localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}
