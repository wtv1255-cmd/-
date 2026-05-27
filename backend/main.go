package main

import (
	"log"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/router"
)

func main() {
	if err := config.Load(); err != nil {
		log.Fatal(err)
	}
	log.Fatal(router.New().Run(":" + config.Cfg.Port))
}
