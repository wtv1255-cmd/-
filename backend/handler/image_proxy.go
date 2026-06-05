package handler

import (
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

const (
	imageCacheControl       = "public, max-age=2592000, immutable"
	imageCacheMaxSize       = 30 * 1024 * 1024
	imageCacheMaxTotalSize  int64 = 1024 * 1024 * 1024
	imageCachePruneInterval = 10 * time.Minute
)

var errImageTooLarge = errors.New("image is too large")

var (
	imageCachePruneMu   sync.Mutex
	imageCacheLastPrune time.Time
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

	cacheFile, metaFile, cacheKey, cacheErr := imageCachePaths(source)
	if cacheErr == nil && serveCachedImage(w, r, cacheFile, metaFile, cacheKey) {
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

	if response.ContentLength > imageCacheMaxSize {
		http.Error(w, "image is too large", http.StatusRequestEntityTooLarge)
		return
	}

	imageBytes, err := readImageBody(response.Body)
	if err != nil {
		if errors.Is(err, errImageTooLarge) {
			http.Error(w, "image is too large", http.StatusRequestEntityTooLarge)
			return
		}
		http.Error(w, "image upstream failed", http.StatusBadGateway)
		return
	}

	contentType := imageContentType(response.Header.Get("Content-Type"), imageBytes)
	if !strings.HasPrefix(strings.ToLower(contentType), "image/") {
		http.Error(w, "upstream is not an image", http.StatusUnsupportedMediaType)
		return
	}

	if cacheErr == nil {
		if err := writeCachedImage(cacheFile, metaFile, source, contentType, imageBytes); err == nil {
			maybePruneImageCache(filepath.Dir(cacheFile))
		}
	}

	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", imageCacheControl)
	w.Header().Set("ETag", imageCacheETag(cacheKey))
	w.Header().Set("X-Image-Cache", "MISS")
	w.Header().Set("Content-Length", fmt.Sprintf("%d", len(imageBytes)))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(imageBytes)
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

type cachedImageMeta struct {
	ContentType string    `json:"contentType"`
	SourceURL   string    `json:"sourceUrl"`
	Size        int       `json:"size"`
	CachedAt    time.Time `json:"cachedAt"`
}

func imageCachePaths(source string) (string, string, string, error) {
	key := imageCacheKey(source)
	cacheDir := strings.TrimSpace(os.Getenv("IMAGE_CACHE_DIR"))
	if cacheDir == "" {
		userCacheDir, err := os.UserCacheDir()
		if err == nil && userCacheDir != "" {
			cacheDir = filepath.Join(userCacheDir, "prompt-center-desktop", "image-cache")
		} else {
			cacheDir = filepath.Join("data", "image-cache")
		}
	}

	if err := os.MkdirAll(cacheDir, 0o755); err != nil {
		return "", "", key, err
	}

	return filepath.Join(cacheDir, key+".bin"), filepath.Join(cacheDir, key+".json"), key, nil
}

func imageCacheKey(source string) string {
	sum := sha256.Sum256([]byte(source))
	return fmt.Sprintf("%x", sum)
}

func imageCacheETag(cacheKey string) string {
	return `"` + cacheKey + `"`
}

func serveCachedImage(w http.ResponseWriter, r *http.Request, cacheFile string, metaFile string, cacheKey string) bool {
	metaBytes, err := os.ReadFile(metaFile)
	if err != nil {
		return false
	}

	var meta cachedImageMeta
	if err := json.Unmarshal(metaBytes, &meta); err != nil {
		return false
	}
	if !strings.HasPrefix(strings.ToLower(meta.ContentType), "image/") {
		return false
	}

	file, err := os.Open(cacheFile)
	if err != nil {
		return false
	}
	defer file.Close()

	stat, err := file.Stat()
	if err != nil || stat.Size() <= 0 {
		return false
	}

	etag := imageCacheETag(cacheKey)
	w.Header().Set("Content-Type", meta.ContentType)
	w.Header().Set("Cache-Control", imageCacheControl)
	w.Header().Set("ETag", etag)
	w.Header().Set("X-Image-Cache", "HIT")

	if r.Header.Get("If-None-Match") == etag {
		w.WriteHeader(http.StatusNotModified)
		return true
	}

	http.ServeContent(w, r, filepath.Base(cacheFile), stat.ModTime(), file)
	return true
}

func readImageBody(body io.Reader) ([]byte, error) {
	imageBytes, err := io.ReadAll(io.LimitReader(body, imageCacheMaxSize+1))
	if err != nil {
		return nil, err
	}
	if len(imageBytes) > imageCacheMaxSize {
		return nil, errImageTooLarge
	}
	return imageBytes, nil
}

func imageContentType(headerValue string, imageBytes []byte) string {
	contentType := strings.TrimSpace(headerValue)
	if strings.HasPrefix(strings.ToLower(contentType), "image/") {
		return contentType
	}
	if len(imageBytes) == 0 {
		return contentType
	}
	return http.DetectContentType(imageBytes)
}

func writeCachedImage(cacheFile string, metaFile string, source string, contentType string, imageBytes []byte) error {
	meta := cachedImageMeta{
		ContentType: contentType,
		SourceURL:   source,
		Size:        len(imageBytes),
		CachedAt:    time.Now().UTC(),
	}
	metaBytes, err := json.Marshal(meta)
	if err != nil {
		return err
	}
	if err := os.WriteFile(cacheFile, imageBytes, 0o644); err != nil {
		return err
	}
	return os.WriteFile(metaFile, metaBytes, 0o644)
}

func maybePruneImageCache(cacheDir string) {
	imageCachePruneMu.Lock()
	if time.Since(imageCacheLastPrune) < imageCachePruneInterval {
		imageCachePruneMu.Unlock()
		return
	}
	imageCacheLastPrune = time.Now()
	imageCachePruneMu.Unlock()

	go pruneImageCache(cacheDir)
}

type imageCacheEntry struct {
	binPath  string
	metaPath string
	size     int64
	modTime  time.Time
}

func pruneImageCache(cacheDir string) {
	entries, err := os.ReadDir(cacheDir)
	if err != nil {
		return
	}

	var totalSize int64
	cacheEntries := make([]imageCacheEntry, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".bin" {
			continue
		}

		binPath := filepath.Join(cacheDir, entry.Name())
		stat, err := os.Stat(binPath)
		if err != nil {
			continue
		}

		totalSize += stat.Size()
		cacheEntries = append(cacheEntries, imageCacheEntry{
			binPath:  binPath,
			metaPath: strings.TrimSuffix(binPath, ".bin") + ".json",
			size:     stat.Size(),
			modTime:  stat.ModTime(),
		})
	}

	if totalSize <= imageCacheMaxTotalSize {
		return
	}

	sort.Slice(cacheEntries, func(i, j int) bool {
		return cacheEntries[i].modTime.Before(cacheEntries[j].modTime)
	})

	targetSize := imageCacheMaxTotalSize * 8 / 10
	for _, entry := range cacheEntries {
		if totalSize <= targetSize {
			return
		}
		_ = os.Remove(entry.binPath)
		_ = os.Remove(entry.metaPath)
		totalSize -= entry.size
	}
}
