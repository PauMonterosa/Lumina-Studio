#!/usr/bin/env python3
import json
import math
import re
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import sympy as sp

SAFE_NAMES = {
    "pi": sp.pi,
    "E": sp.E,
    "sin": sp.sin,
    "cos": sp.cos,
    "tan": sp.tan,
    "asin": sp.asin,
    "acos": sp.acos,
    "atan": sp.atan,
    "exp": sp.exp,
    "log": sp.log,
    "sqrt": sp.sqrt,
    "sinh": sp.sinh,
    "cosh": sp.cosh,
    "tanh": sp.tanh,
    "Abs": sp.Abs,
}

IDENTIFIER = re.compile(r"\b[A-Za-z_][A-Za-z0-9_]*\b")

def to_expr(text, extra_symbols=None):
    if extra_symbols is None:
        extra_symbols = []
    local_dict = dict(SAFE_NAMES)
    for name in set(IDENTIFIER.findall(str(text))) | set(extra_symbols):
        if name not in local_dict:
            local_dict[name] = sp.Symbol(name)
    return sp.sympify(str(text), locals=local_dict)

def slugify(value):
    value = str(value).strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    value = re.sub(r"(^-|-$)", "", value)
    return value or "grafica"

def save_plot(base_path):
    plt.tight_layout()
    png_path = str(base_path.with_suffix(".png"))
    pdf_path = str(base_path.with_suffix(".pdf"))
    plt.savefig(png_path, dpi=160, bbox_inches="tight")
    plt.savefig(pdf_path, bbox_inches="tight")
    plt.close()
    return png_path, pdf_path

def function_plot(spec):
    var = str(spec.get("variable", "x"))
    symbol = sp.Symbol(var)

    x_min = float(sp.N(to_expr(spec.get("x_min", "-10"), [var])))
    x_max = float(sp.N(to_expr(spec.get("x_max", "10"), [var])))

    if not math.isfinite(x_min) or not math.isfinite(x_max) or x_min >= x_max:
      raise ValueError("Rango x inválido.")

    samples = int(spec.get("samples", 1200))
    samples = max(300, min(samples, 5000))
    x = np.linspace(x_min, x_max, samples)

    expressions = spec.get("expressions") or []
    if not expressions:
        raise ValueError("No hay expresiones para representar.")

    labels = spec.get("labels") if isinstance(spec.get("labels"), list) else []
    title = str(spec.get("title") or "Representación gráfica")
    x_label = str(spec.get("x_label") or var)
    y_label = str(spec.get("y_label") or "y")
    grid = bool(spec.get("grid", True))
    legend = bool(spec.get("legend", True))

    plt.figure(figsize=(7.4, 4.8))

    for i, raw in enumerate(expressions[:6]):
        expr = to_expr(raw, [var])
        func = sp.lambdify(symbol, expr, modules=["numpy"])
        y = np.asarray(func(x))
        if y.ndim == 0:
            y = np.full_like(x, float(y), dtype=float)
        y = np.real_if_close(y)
        if np.iscomplexobj(y):
            continue
        y = np.asarray(y, dtype=float)
        y[~np.isfinite(y)] = np.nan
        label = labels[i] if i < len(labels) else str(expr)
        plt.plot(x, y, label=label)

    plt.axhline(0, linewidth=0.8)
    plt.axvline(0, linewidth=0.8)
    plt.xlabel(x_label)
    plt.ylabel(y_label)
    plt.title(title)
    if grid:
        plt.grid(True, alpha=0.25)
    if legend:
        plt.legend()

def scatter_fit(spec):
    x = np.asarray(spec.get("x") or [], dtype=float)
    y = np.asarray(spec.get("y") or [], dtype=float)
    if x.size < 2 or y.size != x.size:
        raise ValueError("Datos x/y inválidos.")

    degree = int(spec.get("fit_degree", 1))
    degree = max(1, min(degree, 8))
    coeffs = np.polyfit(x, y, degree)
    poly = np.poly1d(coeffs)

    title = str(spec.get("title") or "Ajuste experimental")
    x_label = str(spec.get("x_label") or "x")
    y_label = str(spec.get("y_label") or "y")
    grid = bool(spec.get("grid", True))
    legend = bool(spec.get("legend", True))

    x_line = np.linspace(float(np.min(x)), float(np.max(x)), 500)

    plt.figure(figsize=(7.4, 4.8))
    plt.scatter(x, y, label="Datos")
    plt.plot(x_line, poly(x_line), label=f"Ajuste grado {degree}")
    plt.xlabel(x_label)
    plt.ylabel(y_label)
    plt.title(title)
    if grid:
        plt.grid(True, alpha=0.25)
    if legend:
        plt.legend()

def main():
    try:
        raw = sys.stdin.read()
        spec = json.loads(raw or "{}")

        output_dir = Path(spec.get("output_dir") or ".").resolve()
        output_dir.mkdir(parents=True, exist_ok=True)

        filename_base = slugify(spec.get("filename_base") or spec.get("title") or "grafica")
        base_path = output_dir / filename_base

        plot_type = spec.get("type", "function_plot")
        if plot_type == "function_plot":
            function_plot(spec)
        elif plot_type == "scatter_fit":
            scatter_fit(spec)
        else:
            raise ValueError(f"Tipo de gráfica no soportado: {plot_type}")

        png_path, pdf_path = save_plot(base_path)

        caption = str(spec.get("caption") or spec.get("title") or "Gráfica científica.")
        response = {
            "ok": True,
            "png_path": png_path,
            "pdf_path": pdf_path,
            "caption": caption,
            "filename_base": filename_base,
        }
    except Exception as exc:
        response = {
            "ok": False,
            "error": str(exc),
        }

    sys.stdout.write(json.dumps(response, ensure_ascii=False))

if __name__ == "__main__":
    main()
