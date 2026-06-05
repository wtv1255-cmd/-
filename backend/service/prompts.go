package service

import (
	"sync"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

var (
	localPromptEnsureOnce sync.Once
	localPromptEnsureErr  error
)

func ListPrompts(q model.Query) (model.PromptList, error) {
	if err := ensureLocalPromptCategories(); err != nil {
		return model.PromptList{}, err
	}
	items, total, err := repository.ListPrompts(q)
	if err != nil {
		return model.PromptList{}, err
	}
	tags, err := repository.ListPromptTags(q)
	if err != nil {
		return model.PromptList{}, err
	}
	categories := promptCategoryCodes(ListPromptCategories())
	return model.PromptList{Items: items, Tags: tags, Categories: categories, Total: int(total)}, nil
}

func ensureLocalPromptCategories() error {
	localPromptEnsureOnce.Do(func() {
		items, err := buildPromptCategory(yanaiBananaPromptCategory)
		if err != nil {
			localPromptEnsureErr = err
			return
		}
		count, err := repository.CountPromptCategory(yanaiBananaPromptCategory)
		if err != nil {
			localPromptEnsureErr = err
			return
		}
		if int(count) == len(items) {
			isCurrent, err := repository.PromptCategoryMatches(yanaiBananaPromptCategory, items)
			if err != nil {
				localPromptEnsureErr = err
				return
			}
			if isCurrent {
				return
			}
		}
		category, ok := repository.PromptCategoryByCode(yanaiBananaPromptCategory)
		if !ok {
			localPromptEnsureErr = nil
			return
		}
		localPromptEnsureErr = repository.ReplacePromptCategory(category, items)
	})
	return localPromptEnsureErr
}

func ListPromptCategories() []model.PromptCategory {
	categories, _ := repository.ListPromptCategories()
	return categories
}

func promptCategoryCodes(items []model.PromptCategory) []string {
	codes := []string{}
	for _, item := range items {
		if item.Category != "" {
			codes = append(codes, item.Category)
		}
	}
	return codes
}
