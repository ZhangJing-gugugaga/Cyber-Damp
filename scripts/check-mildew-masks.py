"""Independently recount saved alpha masks with existing Pillow; never compare RGB deltas.

python scripts/check-mildew-masks.py logs/rooted-review-20261021
Scope is mildew/fungi/contact-shadow before deformation, not all material effects.
"""
import json
import sys
from pathlib import Path
from PIL import Image, ImageChops

root = Path(sys.argv[1]).resolve()
records = []
for metadata_file in sorted(root.glob("mask-*.json")):
    metadata = json.loads(metadata_file.read_text(encoding="utf-8"))
    assert metadata["scope"] == "mildew-and-fungi-before-deformation"
    for index, sample in enumerate(metadata["samples"]):
        if sample is None:
            continue
        stem = f"{metadata_file.stem}-{index}"
        def alpha(layer, threshold):
            with Image.open(root / f"{stem}-{layer}.png") as image:
                assert image.size == (sample["pixels"], sample["pixels"])
                return image.getchannel("A").point(lambda value: 255 if value >= threshold else 0, "1")
        original = alpha("source", 128)
        expected = ImageChops.logical_and(original, ImageChops.logical_or(alpha("colonies", 13), alpha("fungi", 13)))
        union = alpha("union", 128)
        assert ImageChops.logical_xor(expected, union).getbbox() is None, f"Union differs: {stem}"
        total = original.histogram()[255]
        covered = expected.histogram()[255]
        ratio = covered / total if total else 0
        assert total == sample["total"] and covered == sample["covered"], stem
        assert abs(ratio - sample["ratio"]) < 1e-12 and ratio <= .90, stem
        records.append({"sample": stem, "pixels": sample["pixels"], "total": total, "covered": covered, "ratio": ratio})
assert records, "No saved mask measurements found"
report = {"scope": "mildew-and-fungi-before-deformation", "pass": True, "checks": len(records),
          "sizes": sorted({row["pixels"] for row in records}), "maxRatio": max(row["ratio"] for row in records), "records": records}
(root / "independent-mask-check.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({key: value for key, value in report.items() if key != "records"}))
