# Third-party notices

## YanAI

Some image prompt preset ideas and wording in `lib/types/image.ts` are adapted
from YanAI's default prompt library.

Project: https://github.com/huaiyuechusan/YanAI
License: MIT
Copyright (c) 2026 kunkun

The adapted presets in this project are rewritten for the local image workbench
and do not include YanAI account-pool, registration, reverse-engineering, quota,
or provider-token automation code.

## YanAI bundled prompt library

The local `yanai-banana-prompts` prompt dataset is adapted from YanAI's bundled
Banana Prompt Quicker prompt snapshot. Per-item author/link metadata is
preserved in prompt tags and previews where available. Preview image assets are
not vendored into this repository; they are resolved from upstream raw asset
URLs and cached by the local image proxy at runtime.
