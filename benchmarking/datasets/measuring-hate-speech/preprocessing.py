# /// script
# requires-python = ">=3.10"
# dependencies = ["pandas>=2.2", "pyarrow>=17"]
# ///
"""
Measuring Hate Speech (UC Berkeley D-Lab) -> common benchmark format.

Source: https://huggingface.co/datasets/ucberkeley-dlab/measuring-hate-speech
The source has one row per (comment, annotator); this collapses it to one item per comment.

Output: data/data.jsonl, one object per line:
  {"id": str, "text": str, "label": bool, "metadata": {...}}

  label     hate_speech_score > --threshold (the dataset card treats > 0.5 as approximately hate speech)
  metadata  hate_speech_score, num_annotators, platform (dataset's int code),
            categories     top-level target groups (race, religion, ...) marked by >= --target-agreement of annotators
            subcategories  same rule for sub-targets (religion_muslim, origin_immigrant, ...)

Run:  uv run benchmarking/datasets/measuring-hate-speech/preprocessing.py [--threshold 0.5] [--target-agreement 0.5]
"""

import argparse
import json
import urllib.request
from pathlib import Path

import pandas as pd

# data/train-* is the current release (the repo-root parquet lacks the target_politics_* columns)
SOURCE_URL = (
    "https://huggingface.co/datasets/ucberkeley-dlab/measuring-hate-speech"
    "/resolve/main/data/train-00000-of-00001.parquet"
)
HERE = Path(__file__).resolve().parent
RAW_PATH = HERE / "data" / "raw" / "train-00000-of-00001.parquet"
OUT_PATH = HERE / "data" / "data.jsonl"

TARGET_GROUPS = ["race", "religion", "origin", "gender", "sexuality", "age", "disability", "politics"]


def download(path: Path) -> None:
    """Fetch the source parquet once; later runs reuse the local copy."""
    if path.exists():
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    print(f"Downloading {SOURCE_URL}")
    partial = path.with_suffix(".part")
    urllib.request.urlretrieve(SOURCE_URL, partial)
    partial.rename(path)


def build_items(df: pd.DataFrame, threshold: float, agreement: float) -> pd.DataFrame:
    """Collapse annotator rows into one row per comment with label + metadata columns."""
    top_cols = {f"target_{g}": g for g in TARGET_GROUPS}
    sub_cols = {
        c: c.removeprefix("target_")
        for c in df.columns
        if c.startswith("target_") and c not in top_cols
    }

    grouped = df.groupby("comment_id", sort=True)
    items = grouped.agg(
        text=("text", "first"),
        hate_speech_score=("hate_speech_score", "mean"),
        num_annotators=("annotator_id", "nunique"),
        platform=("platform", "first"),
    )
    # Fraction of a comment's annotators who marked each target column
    marked = grouped[list(top_cols) + list(sub_cols)].mean() >= agreement

    def names(row: pd.Series, mapping: dict[str, str]) -> list[str]:
        return [name for col, name in mapping.items() if row[col]]

    items["categories"] = marked.apply(names, axis=1, mapping=top_cols)
    items["subcategories"] = marked.apply(names, axis=1, mapping=sub_cols)
    items["label"] = items["hate_speech_score"] > threshold
    return items


def write_jsonl(items: pd.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for comment_id, row in items.iterrows():
            record = {
                "id": str(comment_id),
                "text": row["text"],
                "label": bool(row["label"]),
                "metadata": {
                    "hate_speech_score": round(float(row["hate_speech_score"]), 4),
                    "num_annotators": int(row["num_annotators"]),
                    "platform": int(row["platform"]),
                    "categories": row["categories"],
                    "subcategories": row["subcategories"],
                },
            }
            f.write(json.dumps(record, ensure_ascii=False) + "\n")


def print_stats(items: pd.DataFrame) -> None:
    print(f"Items: {len(items)}  positive rate: {items['label'].mean():.3f}")
    exploded = items[["categories", "label"]].explode("categories").dropna()
    stats = exploded.groupby("categories")["label"].agg(n="size", positive_rate="mean")
    print(stats.sort_values("n", ascending=False).round(3).to_string())


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--threshold", type=float, default=0.5,
                        help="hate_speech_score above this is labeled a violation (default 0.5)")
    parser.add_argument("--target-agreement", type=float, default=0.5,
                        help="fraction of annotators needed to tag a target category (default 0.5)")
    parser.add_argument("--out", type=Path, default=OUT_PATH, help=f"output path (default {OUT_PATH})")
    args = parser.parse_args()

    download(RAW_PATH)
    df = pd.read_parquet(RAW_PATH)
    items = build_items(df, args.threshold, args.target_agreement)
    write_jsonl(items, args.out)
    print(f"Wrote {args.out}")
    print_stats(items)


if __name__ == "__main__":
    main()
