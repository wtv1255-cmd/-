package handler

import (
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

var allowedImageHosts = map[string]bool{
	"raw.githubusercontent.com": true,
	"github.com":                true,
	"cms-assets.youmind.com":    true,
	"cdn.imgedify.com":          true,
	"pbs.twimg.com":             true,
}

func ImageProxy(w http.ResponseWriter, r *http.Request) {
	source := strings.TrimSpace(r.URL.Query().Get("url"))
	if !isAllowedImageURL(source) {
		http.Error(w, "invalid image url", http.StatusBadRequest)
		return
	}

	request, err := http.NewRequestWithContext(r.Context(), http.MethodGet, source, nil)
	if err != nil {
		http.Error(w, "invalid image url", http.StatusBadRequest)
		return
	}
	request.Header.Set("Accept", "image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8")
	request.Header.Set("User-Agent", "prompt-center-image-proxy")

	client := http.Client{Timeout: 45 * time.Second}
	response, err := client.Do(request)
	if err != nil {
		http.Error(w, "image upstream failed", http.StatusBadGateway)
		return
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		http.Error(w, "image upstream failed", response.StatusCode)
		return
	}

	contentType := response.Header.Get("Content-Type")
	if !strings.HasPrefix(strings.ToLower(contentType), "image/") {
		http.Error(w, "upstream is not an image", http.StatusUnsupportedMediaType)
		return
	}

	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "no-store")
	if contentLength := response.Header.Get("Content-Length"); contentLength != "" {
		w.Header().Set("Content-Length", contentLength)
	}
	w.WriteHeader(http.StatusOK)
	_, _ = io.Copy(w, response.Body)
}

func isAllowedImageURL(value string) bool {
	parsed, err := url.Parse(value)
	if err != nil || parsed == nil {
		return false
	}
	if parsed.Scheme != "https" && parsed.Scheme != "http" {
		return false
	}
	return allowedImageHosts[strings.ToLower(parsed.Hostname())]
}
