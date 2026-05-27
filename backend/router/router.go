package router

import (
	"net/http"

	"github.com/basketikun/infinite-canvas/handler"
	"github.com/gin-gonic/gin"
)

func New() *gin.Engine {
	router := gin.Default()
	router.RedirectTrailingSlash = false
	_ = router.SetTrustedProxies(nil)
	api := router.Group("/api")
	api.GET("/health", func(c *gin.Context) {
		c.String(http.StatusOK, "ok")
	})
	api.GET("/prompts", gin.WrapF(handler.Prompts))
	api.POST("/prompts/sync", gin.WrapF(handler.PromptSync))

	router.NoRoute(func(c *gin.Context) {
		c.JSON(http.StatusNotFound, gin.H{
			"code":    http.StatusNotFound,
			"message": "not found",
		})
	})

	return router
}
