import json
import os
import sys
import wave
from pathlib import Path


def read_wav_duration_ms(path: Path) -> int | None:
    if path.suffix.lower() != ".wav":
        return None
    try:
        with wave.open(str(path), "rb") as wav:
            frames = wav.getnframes()
            framerate = wav.getframerate()
            if framerate <= 0:
                return None
            return round((frames / framerate) * 1000)
    except Exception:
        return None


def main() -> int:
    if len(sys.argv) != 2:
        raise SystemExit("usage: synthesize-local-tts.py <payload.json>")

    payload_path = Path(sys.argv[1])
    payload = json.loads(payload_path.read_text(encoding="utf-8"))
    project_path = Path(payload["projectPath"])
    model_dir = Path(payload.get("modelDir") or project_path / "checkpoints")
    reference_audio_path = Path(payload["referenceAudioPath"])
    output_path = Path(payload["outputPath"])
    text = str(payload.get("text") or "").strip()

    if not text:
        raise RuntimeError("TTS text is empty")
    if not reference_audio_path.exists():
        raise RuntimeError(f"Reference audio not found: {reference_audio_path}")

    sys.path.insert(0, str(project_path))
    sys.path.insert(0, str(project_path / "indextts"))
    os.chdir(project_path)

    from indextts.infer_v2 import IndexTTS2  # noqa: E402

    output_path.parent.mkdir(parents=True, exist_ok=True)
    tts = IndexTTS2(
        model_dir=str(model_dir),
        cfg_path=str(model_dir / "config.yaml"),
        use_fp16=bool(payload.get("useFp16")),
        use_deepspeed=bool(payload.get("useDeepspeed")),
        use_cuda_kernel=bool(payload.get("useCudaKernel")),
    )
    tts.infer(
        spk_audio_prompt=str(reference_audio_path),
        text=text,
        output_path=str(output_path),
        verbose=False,
        max_text_tokens_per_segment=int(
            payload.get("maxTextTokensPerSegment") or 120
        ),
    )

    print(
        json.dumps(
            {
                "ok": True,
                "outputPath": str(output_path),
                "durationMs": read_wav_duration_ms(output_path),
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
