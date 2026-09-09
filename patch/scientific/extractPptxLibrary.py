#!/usr/bin/env python3
"""Lumina Studio PPTX extractor.

Uses only the Python standard library. It extracts visible slide text and speaker
notes from .pptx files and writes a compact JSON cache for local RAG.
"""

from __future__ import annotations

import argparse
import json
import posixpath
import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main"
R_NS = "http://schemas.openxmlformats.org/package/2006/relationships"


def _natural_slide_key(name: str) -> int:
    match = re.search(r"slide(\d+)\.xml$", name)
    return int(match.group(1)) if match else 10**9


def _extract_text(xml_bytes: bytes) -> list[str]:
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError:
        return []

    values: list[str] = []
    for node in root.findall(f".//{{{A_NS}}}t"):
        text = " ".join((node.text or "").split())
        if text:
            values.append(text)
    return values


def _notes_path_for_slide(zf: zipfile.ZipFile, slide_path: str) -> str | None:
    slide_dir = posixpath.dirname(slide_path)
    rel_path = posixpath.join(
        slide_dir,
        "_rels",
        posixpath.basename(slide_path) + ".rels",
    )
    try:
        rel_root = ET.fromstring(zf.read(rel_path))
    except (KeyError, ET.ParseError):
        return None

    for rel in rel_root.findall(f"{{{R_NS}}}Relationship"):
        rel_type = rel.attrib.get("Type", "")
        target = rel.attrib.get("Target", "")
        if rel_type.endswith("/notesSlide") and target:
            return posixpath.normpath(posixpath.join(slide_dir, target))
    return None


def _make_chunks(slide_number: int, title: str, text: str, notes: str) -> list[dict]:
    combined = "\n".join(
        part for part in [title, text, f"Notas del profesor:\n{notes}" if notes else ""] if part
    ).strip()
    if not combined:
        return []

    max_chars = 1350
    overlap = 180
    chunks: list[dict] = []
    start = 0
    part = 1
    while start < len(combined):
        end = min(len(combined), start + max_chars)
        if end < len(combined):
            boundary = combined.rfind("\n", start + 700, end)
            if boundary > start:
                end = boundary
        chunk_text = combined[start:end].strip()
        if chunk_text:
            chunks.append(
                {
                    "slide": slide_number,
                    "heading": title or f"Diapositiva {slide_number}",
                    "part": part,
                    "text": chunk_text,
                }
            )
        if end >= len(combined):
            break
        start = max(end - overlap, start + 1)
        part += 1
    return chunks


def extract_pptx(input_path: Path) -> dict:
    with zipfile.ZipFile(input_path, "r") as zf:
        slide_paths = sorted(
            [
                name
                for name in zf.namelist()
                if re.fullmatch(r"ppt/slides/slide\d+\.xml", name)
            ],
            key=_natural_slide_key,
        )

        slides: list[dict] = []
        chunks: list[dict] = []

        for index, slide_path in enumerate(slide_paths, start=1):
            visible = _extract_text(zf.read(slide_path))
            title = visible[0] if visible else f"Diapositiva {index}"
            body_items = visible[1:] if len(visible) > 1 else []
            text = "\n".join(body_items).strip()

            notes_path = _notes_path_for_slide(zf, slide_path)
            notes_items: list[str] = []
            if notes_path:
                try:
                    notes_items = _extract_text(zf.read(notes_path))
                except KeyError:
                    notes_items = []

            # Remove obvious duplicate visible strings from the speaker notes.
            visible_set = {item.strip() for item in visible if item.strip()}
            cleaned_notes = [
                item
                for item in notes_items
                if item.strip() and item.strip() not in visible_set
            ]
            notes = "\n".join(cleaned_notes).strip()

            slide = {
                "number": index,
                "title": title,
                "text": text,
                "notes": notes,
                "allText": "\n".join(part for part in [title, text, notes] if part),
            }
            slides.append(slide)
            chunks.extend(_make_chunks(index, title, text, notes))

    title = next((s["title"] for s in slides if s.get("title")), input_path.stem)
    return {
        "version": 1,
        "filename": input_path.name,
        "title": title,
        "slides": slides,
        "slideCount": len(slides),
        "chunks": chunks,
        "warning": "" if slides else "No se pudo extraer texto de las diapositivas.",
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--relative", default="")
    parser.add_argument("--subject", default="")
    parser.add_argument("--mtime", default="0")
    parser.add_argument("--size", default="0")
    args = parser.parse_args()

    input_path = Path(args.input).resolve()
    output_path = Path(args.output).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    data = extract_pptx(input_path)
    data["source"] = {
        "relative": args.relative,
        "subject": args.subject,
        "mtimeMs": int(float(args.mtime or 0)),
        "size": int(float(args.size or 0)),
    }

    output_path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(json.dumps({"ok": True, "slides": data["slideCount"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
