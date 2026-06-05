package repository

import (
	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
)

// PromptCategories 返回内置提示词分类的副本。
func PromptCategories() []model.PromptCategory {
	result := make([]model.PromptCategory, len(promptCategories))
	copy(result, promptCategories)
	return result
}

// PromptCategoryByCode 根据分类编码查找内置提示词分类。
func PromptCategoryByCode(category string) (model.PromptCategory, bool) {
	for _, item := range promptCategories {
		if item.Category == category {
			return item, true
		}
	}
	return model.PromptCategory{}, false
}

// ListPromptCategories 返回内置提示词分类。
func ListPromptCategories() ([]model.PromptCategory, error) {
	return PromptCategories(), nil
}

// CountPromptCategory 返回指定分类当前入库数量。
func CountPromptCategory(category string) (int64, error) {
	db, err := DB()
	if err != nil {
		return 0, err
	}
	var count int64
	if err := db.Model(&model.Prompt{}).Where("category = ?", category).Count(&count).Error; err != nil {
		return 0, err
	}
	return count, nil
}

// ListPrompts 按查询条件返回提示词分页列表。
func ListPrompts(q model.Query) ([]model.Prompt, int64, error) {
	db, err := DB()
	if err != nil {
		return nil, 0, err
	}
	q.Normalize()
	tx := applyPromptFilters(db.Model(&model.Prompt{}), q)

	var total int64
	if err := tx.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var items []model.Prompt
	if err := tx.Order("updated_at desc").Offset(q.Offset()).Limit(q.PageSize).Find(&items).Error; err != nil {
		return nil, 0, err
	}
	categories, _ := ListPromptCategories()
	githubURLs := map[string]string{}
	for _, item := range categories {
		githubURLs[item.Category] = item.GithubURL
	}
	for i := range items {
		items[i].GithubURL = githubURLs[items[i].Category]
	}
	return items, total, nil
}

// ListPromptTags 返回当前提示词查询条件下的全部标签。
func ListPromptTags(q model.Query) ([]string, error) {
	db, err := DB()
	if err != nil {
		return nil, err
	}
	q.Normalize()
	q.Tags = nil
	tx := applyPromptFilters(db.Model(&model.Prompt{}), q)

	var items []model.Prompt
	if err := tx.Select("tags").Find(&items).Error; err != nil {
		return nil, err
	}
	return promptTagsFromItems(items), nil
}

// ReplacePromptCategory 用远程同步结果替换整个提示词分类。
func ReplacePromptCategory(category model.PromptCategory, items []model.Prompt) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("category = ?", category.Category).Delete(&model.Prompt{}).Error; err != nil {
			return err
		}
		if len(items) == 0 {
			return nil
		}
		for i := range items {
			items[i].Category = category.Category
			items[i].GithubURL = ""
		}
		return tx.Create(&items).Error
	})
}

// applyPromptFilters 应用提示词列表的搜索条件。
func applyPromptFilters(tx *gorm.DB, q model.Query) *gorm.DB {
	if q.Keyword != "" {
		like := "%" + q.Keyword + "%"
		tx = tx.Where("title LIKE ? OR prompt LIKE ?", like, like)
	}
	if isActivePromptOption(q.Category) {
		tx = tx.Where("category = ?", q.Category)
	}
	return applyPromptTagsFilter(tx, q.Tags)
}

// applyPromptTagsFilter 应用 JSON 标签条件。
func applyPromptTagsFilter(tx *gorm.DB, tags []string) *gorm.DB {
	if len(tags) == 0 {
		return tx
	}
	condition := tx.Session(&gorm.Session{NewDB: true})
	for _, tag := range tags {
		condition = condition.Or(promptJSONTagsContains(tx), tag)
	}
	return tx.Where(condition)
}

func promptTagsFromItems(items []model.Prompt) []string {
	seen := map[string]bool{}
	tags := []string{}
	for _, item := range items {
		for _, tag := range item.Tags {
			if tag != "" && !seen[tag] {
				seen[tag] = true
				tags = append(tags, tag)
			}
		}
	}
	return tags
}

// promptJSONTagsContains 返回提示词 tags 的 JSON 包含条件。
func promptJSONTagsContains(tx *gorm.DB) string {
	switch tx.Dialector.Name() {
	case "mysql":
		return "JSON_CONTAINS(tags, JSON_QUOTE(?))"
	case "postgres":
		return "jsonb_exists(tags::jsonb, ?)"
	default:
		return "EXISTS (SELECT 1 FROM json_each(tags) WHERE value = ?)"
	}
}

// isActivePromptOption 判断提示词筛选项有效状态。
func isActivePromptOption(value string) bool {
	return value != "" && value != "全部" && value != "all"
}
