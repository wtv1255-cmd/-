import json
import os
import re
import shutil
import sys
from pathlib import Path


def find_skill_scripts_path() -> Path:
    candidates = [
        os.getenv("JY_SKILL_ROOT", "").strip(),
        r"C:\Users\Administrator\.agents\skills\jianying-editor",
    ]
    for candidate in candidates:
        if not candidate:
            continue
        scripts_path = Path(candidate) / "scripts"
        if (scripts_path / "jy_wrapper.py").exists():
            return scripts_path
    raise RuntimeError("未找到 jianying-editor skill，无法创建剪映原生草稿。")


def seconds(ms: int) -> str:
    return f"{max(0, int(ms)) / 1000:.3f}s"


def is_visual_clip(clip: dict) -> bool:
    return (clip.get("type") == "visual" or clip.get("trackId") == "visual") and bool(clip.get("assetId"))


def is_audio_clip(clip: dict) -> bool:
    clip_type = clip.get("type") or clip.get("trackId")
    return clip_type in {"voice", "bgm", "sfx"} and bool(clip.get("assetId"))


def is_subtitle_clip(clip: dict) -> bool:
    return clip.get("type") == "subtitle" or clip.get("trackId") == "subtitle"


def is_visible_subtitle_text(clip: dict) -> bool:
    text = str(clip.get("text") or "").strip()
    if not text:
        return False
    if re.match(r"^[【\[]\s*(画面|镜头|场景|视觉|分镜)\s*[:：]", text):
        return False
    return bool(clip.get("emphasisSubtitle", True))


def material_path(asset: dict) -> str:
    file_info = asset.get("file") if isinstance(asset, dict) else None
    path = file_info.get("path") if isinstance(file_info, dict) else ""
    return str(path or "").strip()


def extract_shot_id(*values: object) -> str:
    for value in values:
        match = re.search(r"shot[_-]?(\d+)", str(value or ""), re.IGNORECASE)
        if match:
            return f"shot_{int(match.group(1)):02d}"
    return ""


def normalize_asset_key(value: object) -> str:
    key = str(value or "").strip().lower().replace("\\", "/")
    key = key.rsplit("/", 1)[-1]
    key = re.sub(r"_\d{8,}$", "", key)
    return key


def asset_has_existing_file(asset: dict) -> bool:
    path = material_path(asset)
    return bool(path and Path(path).exists())


def resolve_material_for_clip(clip: dict, asset_by_id: dict, assets: list[dict]) -> dict | None:
    exact = asset_by_id.get(str(clip.get("assetId")))
    if exact and asset_has_existing_file(exact):
        return exact

    if not is_visual_clip(clip):
        return exact if exact and asset_has_existing_file(exact) else None

    shot_id = extract_shot_id(clip.get("id"), clip.get("assetId"))
    if shot_id:
        tagged = [
            asset
            for asset in assets
            if isinstance(asset, dict)
            and asset.get("kind") == "stickman_image"
            and shot_id in (asset.get("tags") or [])
            and asset_has_existing_file(asset)
        ]
        if tagged:
            return tagged[0]

    clip_asset_key = normalize_asset_key(clip.get("assetId"))
    if clip_asset_key:
        for asset in assets:
            if not isinstance(asset, dict) or not asset_has_existing_file(asset):
                continue
            keys = [
                normalize_asset_key(asset.get("id")),
                normalize_asset_key(asset.get("displayName")),
                normalize_asset_key((asset.get("file") or {}).get("filename")),
            ]
            if clip_asset_key in keys or any(key and clip_asset_key.endswith(key) for key in keys):
                return asset

    return None


def copy_source_package(source_dir: Path, draft_dir: Path) -> None:
    package_dir = draft_dir / "ta-huo-source-package"
    package_dir.mkdir(parents=True, exist_ok=True)
    for name in ["draft_content.json", "task-materials.json", "ta-huo-director-plan.json"]:
        src = source_dir / name
        if src.exists():
            shutil.copy2(src, package_dir / name)


def resolve_canvas(plan: dict) -> dict:
    canvas = plan.get("canvas") if isinstance(plan, dict) else {}
    width = int(canvas.get("width") or 0) if isinstance(canvas, dict) else 0
    height = int(canvas.get("height") or 0) if isinstance(canvas, dict) else 0
    aspect_ratio = str(canvas.get("aspectRatio") or "") if isinstance(canvas, dict) else ""

    if width > 0 and height > 0:
        return {"width": width, "height": height, "aspectRatio": aspect_ratio}
    if aspect_ratio == "16:9":
        return {"width": 1920, "height": 1080, "aspectRatio": "16:9"}
    if aspect_ratio == "1:1":
        return {"width": 1080, "height": 1080, "aspectRatio": "1:1"}
    return {"width": 1080, "height": 1920, "aspectRatio": "9:16"}


def main() -> int:
    if len(sys.argv) != 2:
        raise SystemExit("usage: create-native-jianying-draft.py <payload.json>")

    payload_path = Path(sys.argv[1])
    payload = json.loads(payload_path.read_text(encoding="utf-8"))
    drafts_root = Path(payload["draftsRoot"])
    materials_root = Path(payload["materialsRoot"])
    project_name = payload["draftName"]
    source_package = Path(payload["sourcePackage"])
    plan = payload.get("plan") or {}
    clips = (plan.get("aiDirector") or {}).get("clips") or []
    asset_by_id = {
        str(asset.get("id")): asset
        for asset in (plan.get("materialAssets") or [])
        if isinstance(asset, dict) and asset.get("id")
    }
    material_assets = [
        asset for asset in (plan.get("materialAssets") or []) if isinstance(asset, dict)
    ]
    canvas = resolve_canvas(plan)

    scripts_path = find_skill_scripts_path()
    sys.path.insert(0, str(scripts_path))
    from jy_wrapper import JyProject  # noqa: E402

    drafts_root.mkdir(parents=True, exist_ok=True)
    materials_root.mkdir(parents=True, exist_ok=True)

    project = JyProject(
        project_name,
        width=canvas["width"],
        height=canvas["height"],
        drafts_root=str(drafts_root),
        overwrite=False,
    )

    ordered_clips = sorted(clips, key=lambda clip: int(clip.get("startMs", 0) or 0))

    for clip in ordered_clips:
        if not is_visual_clip(clip):
            continue
        asset = resolve_material_for_clip(clip, asset_by_id, material_assets)
        path = material_path(asset)
        if not path or not Path(path).exists():
            continue
        project.add_media_safe(
            path,
            start_time=seconds(clip.get("startMs", 0)),
            duration=seconds(clip.get("durationMs", 3000)),
            track_name="Visual",
        )

    for clip in ordered_clips:
        if not is_audio_clip(clip):
            continue
        asset = asset_by_id.get(str(clip.get("assetId")))
        path = material_path(asset)
        if not path or not Path(path).exists():
            continue
        project.add_media_safe(
            path,
            start_time=seconds(clip.get("startMs", 0)),
            duration=seconds(clip.get("durationMs", 3000)),
            track_name="Voice" if clip.get("type") == "voice" else str(clip.get("type") or "Audio"),
        )

    for clip in ordered_clips:
        if not is_subtitle_clip(clip) or not is_visible_subtitle_text(clip):
            continue
        project.add_text_simple(
            str(clip["text"]),
            start_time=seconds(clip.get("startMs", 0)),
            duration=seconds(clip.get("durationMs", 3000)),
        )

    result = project.save()
    draft_path = Path(result["draft_path"])
    copy_source_package(source_package, draft_path)

    print(
        json.dumps(
            {
                "ok": True,
                "nativeDraftPath": str(draft_path),
                "nativeMaterialsPath": str(materials_root),
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
