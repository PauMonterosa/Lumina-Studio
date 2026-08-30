#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

try:
    import fitz  # PyMuPDF
except Exception as exc:
    sys.stderr.write(
        "Falta PyMuPDF. Ejecuta: python -m pip install pymupdf\n"
    )
    raise

MAX_CHUNK_CHARS = 1500
OVERLAP_CHARS = 180


def clean_text(value: str) -> str:
    value = value.replace("\x00", " ")
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r"\n[ \t]+", "\n", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def guess_heading(text: str) -> str:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    for line in lines[:5]:
        if (
            3 <= len(line) <= 120
            and not line.endswith(".")
            and len(line.split()) <= 16
        ):
            return line
    return ""


def split_page(text: str, page_number: int) -> list[dict]:
    clean = clean_text(text)
    if not clean:
        return []

    paragraphs = [
        p.strip()
        for p in re.split(r"\n\s*\n", clean)
        if p.strip()
    ]

    if not paragraphs:
        paragraphs = [clean]

    chunks: list[dict] = []
    current = ""

    def emit(block: str) -> None:
        block = block.strip()
        if not block:
            return

        if len(block) <= MAX_CHUNK_CHARS:
            chunks.append(
                {
                    "page": page_number,
                    "heading": guess_heading(block),
                    "text": block,
                }
            )
            return

        start = 0
        while start < len(block):
            end = min(start + MAX_CHUNK_CHARS, len(block))
            if end < len(block):
                break_at = max(
                    block.rfind(". ", start + 700, end),
                    block.rfind("\n", start + 700, end),
                    block.rfind(" ", start + 700, end),
                )
                if break_at > start:
                    end = break_at + 1

            piece = block[start:end].strip()
            if piece:
                chunks.append(
                    {
                        "page": page_number,
                        "heading": guess_heading(piece),
                        "text": piece,
                    }
                )

            if end >= len(block):
                break

            start = max(end - OVERLAP_CHARS, start + 1)

    for paragraph in paragraphs:
        candidate = f"{current}\n\n{paragraph}".strip() if current else paragraph

        if len(candidate) <= MAX_CHUNK_CHARS:
            current = candidate
        else:
            emit(current)
            current = paragraph

    emit(current)
    return chunks


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--subject", default="")
    parser.add_argument("--relative", default="")
    parser.add_argument("--mtime", type=int, required=True)
    parser.add_argument("--size", type=int, required=True)
    args = parser.parse_args()

    input_path = Path(args.input).resolve()
    output_path = Path(args.output).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    doc = fitz.open(input_path)

    metadata = doc.metadata or {}
    chunks: list[dict] = []
    text_pages = 0
    scanned_pages = 0

    for index in range(doc.page_count):
        page = doc.load_page(index)
        text = clean_text(page.get_text("text") or "")

        if len(text) >= 40:
            text_pages += 1
            chunks.extend(split_page(text, index + 1))
        else:
            scanned_pages += 1

    warning = ""

    if doc.page_count and text_pages == 0:
        warning = (
            "No se ha encontrado texto extraíble. "
            "El PDF parece escaneado; Lumina PDF RAG no usa OCR."
        )
    elif scanned_pages > text_pages:
        warning = (
            "Muchas páginas parecen escaneadas y no contienen texto extraíble. "
            "Esas páginas no se han indexado."
        )

    payload = {
        "version": 2,
        "filename": input_path.name,
        "metadata": {
            "title": clean_text(metadata.get("title") or ""),
            "author": clean_text(metadata.get("author") or ""),
            "subject": clean_text(metadata.get("subject") or ""),
        },
        "source": {
            "relative": args.relative,
            "subject": args.subject,
            "mtimeMs": args.mtime,
            "size": args.size,
        },
        "pages": doc.page_count,
        "textPages": text_pages,
        "scannedPages": scanned_pages,
        "warning": warning,
        "chunks": chunks,
    }

    output_path.write_text(
        json.dumps(payload, ensure_ascii=False),
        encoding="utf-8",
    )

    print(
        json.dumps(
            {
                "ok": True,
                "pages": doc.page_count,
                "textPages": text_pages,
                "chunks": len(chunks),
            }
        )
    )


if __name__ == "__main__":
    main()
