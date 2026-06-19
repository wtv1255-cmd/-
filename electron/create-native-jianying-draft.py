import json
import os
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


def copy_source_package(source_dir: Path, draft_dir: Path) -> None:
    package_dir = draft_dir / "ta-huo-source-package"
    package_dir.mkdir(parents=True, exist_ok=True)
    for name in ["draft_content.json", "task-materials.json", "ta-huo-director-plan.json"]:
        src = source_dir / name
        if src.exists():
            shutil.copy2(src, package_dir / name)


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

    scripts_path = find_skill_scripts_path()
    sys.path.insert(0, str(scripts_path))
    from jy_wrapper import JyProject  # noqa: E402

    drafts_root.mkdir(parents=True, exist_ok=True)
    materials_root.mkdir(parents=True, exist_ok=True)

    project = JyProject(
        project_name,
        width=1080,
        height=1920,
        drafts_root=str(drafts_root),
        overwrite=False,
    )

    for clip in clips:
        if clip.get("type") != "subtitle" or not clip.get("text"):
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
