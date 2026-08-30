#!/usr/bin/env python3
from __future__ import annotations

import json
import math
import re
import sys
from pathlib import Path
from typing import Any

import matplotlib
matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np
import sympy as sp
from scipy import special as sps
from sympy.parsing.sympy_parser import (
    convert_xor,
    implicit_multiplication_application,
    parse_expr,
    standard_transformations,
)

TRANSFORMATIONS = standard_transformations + (
    convert_xor,
    implicit_multiplication_application,
)

SAFE_NAMES = {
    "pi": sp.pi,
    "E": sp.E,
    "I": sp.I,
    "oo": sp.oo,
    "sin": sp.sin,
    "cos": sp.cos,
    "tan": sp.tan,
    "asin": sp.asin,
    "acos": sp.acos,
    "atan": sp.atan,
    "sinh": sp.sinh,
    "cosh": sp.cosh,
    "tanh": sp.tanh,
    "exp": sp.exp,
    "log": sp.log,
    "ln": sp.log,
    "sqrt": sp.sqrt,
    "Abs": sp.Abs,
    "abs": sp.Abs,
    "sign": sp.sign,
    "floor": sp.floor,
    "ceiling": sp.ceiling,
    "Piecewise": sp.Piecewise,
    "Heaviside": sp.Heaviside,
    "Min": sp.Min,
    "Max": sp.Max,
    "besselj": sp.besselj,
    "bessely": sp.bessely,
    "besseli": sp.besseli,
    "besselk": sp.besselk,
    "hankel1": sp.hankel1,
    "hankel2": sp.hankel2,
    "legendre": sp.legendre,
    "hermite": sp.hermite,
    "laguerre": sp.laguerre,
    "erf": sp.erf,
    "erfc": sp.erfc,
    "gamma": sp.gamma,
}

SAFE_GLOBALS = {
    "__builtins__": {},
    "Symbol": sp.Symbol,
    "Integer": sp.Integer,
    "Float": sp.Float,
    "Rational": sp.Rational,
    **SAFE_NAMES,
}

SPECIAL_NUMERIC_MODULES = {
    "besselj": sps.jv,
    "bessely": sps.yv,
    "besseli": sps.iv,
    "besselk": sps.kv,
    "hankel1": sps.hankel1,
    "hankel2": sps.hankel2,
    "erf": sps.erf,
    "erfc": sps.erfc,
    "gamma": sps.gamma,
}


def lambdify_numeric(args: Any, expr: sp.Expr):
    """Lambdify with NumPy plus SciPy special-function support."""
    return sp.lambdify(
        args,
        expr,
        modules=[SPECIAL_NUMERIC_MODULES, "scipy", "numpy"],
    )


def ensure_only_symbols(expr: sp.Expr, allowed: set[sp.Symbol], context: str) -> None:
    extra = set(expr.free_symbols) - set(allowed)
    if extra:
        names = ", ".join(sorted(str(x) for x in extra))
        raise ValueError(
            f"{context} contiene parámetros sin valor: {names}. "
            "Indica valores concretos o pide varios órdenes explícitos."
        )

IDENTIFIER = re.compile(
    r"\b[A-Za-z_][A-Za-z0-9_]*\b"
)

FORBIDDEN = re.compile(
    r"(__|\b(?:import|exec|eval|open|compile|globals|locals|lambda|class|def|os|sys|subprocess)\b)",
    re.I,
)

MAX_TEXT = 8000


def clean_text(value: Any, name: str = "expression") -> str:
    text = str(value or "").strip()

    if not text:
        raise ValueError(f"Falta {name}.")

    if len(text) > MAX_TEXT:
        raise ValueError(f"{name} es demasiado largo.")

    if FORBIDDEN.search(text):
        raise ValueError(
            f"{name} contiene una construcción no permitida."
        )

    return text


def local_symbols(
    text: str,
    extra_symbols: list[str] | None = None,
) -> dict[str, Any]:
    names = set(
        IDENTIFIER.findall(text)
    )

    if extra_symbols:
        names.update(extra_symbols)

    local = dict(SAFE_NAMES)

    for name in names:
        if name in SAFE_NAMES:
            continue

        if FORBIDDEN.fullmatch(name):
            continue

        local[name] = sp.Symbol(name)

    return local


def parse_math(
    value: Any,
    extra_symbols: list[str] | None = None,
) -> sp.Expr:
    text = clean_text(value)

    return parse_expr(
        text,
        local_dict=local_symbols(
            text,
            extra_symbols,
        ),
        global_dict=SAFE_GLOBALS,
        transformations=TRANSFORMATIONS,
        evaluate=True,
    )


def parse_scalar(value: Any) -> float:
    if isinstance(
        value,
        (int, float),
    ):
        result = float(value)
    else:
        result = float(
            sp.N(
                parse_math(value)
            )
        )

    if not math.isfinite(result):
        raise ValueError(
            "El límite numérico no es finito."
        )

    return result


def get_bool(
    spec: dict[str, Any],
    key: str,
    default: bool,
) -> bool:
    value = spec.get(
        key,
        default,
    )

    if isinstance(value, str):
        return value.strip().lower() not in {
            "false",
            "0",
            "no",
            "off",
        }

    return bool(value)


def set_scale(
    axis: str,
    value: Any,
) -> None:
    scale = str(
        value or "linear"
    ).lower()

    if scale not in {
        "linear",
        "log",
        "symlog",
    }:
        scale = "linear"

    if axis == "x":
        plt.xscale(scale)
    else:
        plt.yscale(scale)


def apply_common_2d(
    spec: dict[str, Any],
    *,
    allow_legend: bool = True,
) -> None:
    plt.xlabel(
        str(
            spec.get(
                "x_label",
                "x",
            )
        )
    )

    plt.ylabel(
        str(
            spec.get(
                "y_label",
                "y",
            )
        )
    )

    title = str(
        spec.get(
            "title",
            "",
        )
    ).strip()

    if title:
        plt.title(title)

    if get_bool(
        spec,
        "grid",
        True,
    ):
        plt.grid(
            True,
            alpha=0.25,
        )

    set_scale(
        "x",
        spec.get("x_scale"),
    )

    set_scale(
        "y",
        spec.get("y_scale"),
    )

    if (
        spec.get("y_min") is not None
        and spec.get("y_max") is not None
    ):
        plt.ylim(
            parse_scalar(
                spec["y_min"]
            ),
            parse_scalar(
                spec["y_max"]
            ),
        )

    if get_bool(
        spec,
        "equal_aspect",
        False,
    ):
        plt.gca().set_aspect(
            "equal",
            adjustable="box",
        )

    if (
        allow_legend
        and get_bool(
            spec,
            "legend",
            True,
        )
    ):
        handles, labels = (
            plt.gca()
            .get_legend_handles_labels()
        )

        labels = [
            label
            for label in labels
            if label
            and not label.startswith("_")
        ]

        if labels:
            plt.legend()


def add_reference_marks(
    spec: dict[str, Any],
) -> None:
    for item in (
        spec.get("vlines")
        if isinstance(
            spec.get("vlines"),
            list,
        )
        else []
    ):
        if isinstance(item, dict):
            x_value = parse_scalar(
                item.get("x")
            )
            label = str(
                item.get(
                    "label",
                    "",
                )
            )
        else:
            x_value = parse_scalar(item)
            label = ""

        plt.axvline(
            x_value,
            linestyle="--",
            linewidth=1.0,
            label=label or None,
        )

    for item in (
        spec.get("hlines")
        if isinstance(
            spec.get("hlines"),
            list,
        )
        else []
    ):
        if isinstance(item, dict):
            y_value = parse_scalar(
                item.get("y")
            )
            label = str(
                item.get(
                    "label",
                    "",
                )
            )
        else:
            y_value = parse_scalar(item)
            label = ""

        plt.axhline(
            y_value,
            linestyle="--",
            linewidth=1.0,
            label=label or None,
        )

    for item in (
        spec.get("points")
        if isinstance(
            spec.get("points"),
            list,
        )
        else []
    ):
        if not isinstance(
            item,
            dict,
        ):
            continue

        x_value = parse_scalar(
            item.get("x")
        )

        y_value = parse_scalar(
            item.get("y")
        )

        label = str(
            item.get(
                "label",
                "",
            )
        )

        plt.scatter(
            [x_value],
            [y_value],
            zorder=5,
        )

        if label:
            plt.annotate(
                label,
                (
                    x_value,
                    y_value,
                ),
                xytext=(
                    6,
                    6,
                ),
                textcoords="offset points",
            )


def function_plot(
    spec: dict[str, Any],
) -> None:
    variable_name = str(
        spec.get(
            "variable",
            "x",
        )
    )

    variable = sp.Symbol(
        variable_name
    )

    x_min = parse_scalar(
        spec.get(
            "x_min",
            -10,
        )
    )

    x_max = parse_scalar(
        spec.get(
            "x_max",
            10,
        )
    )

    if x_min >= x_max:
        raise ValueError(
            "El rango x no es válido."
        )

    samples = int(
        spec.get(
            "samples",
            1200,
        )
    )

    samples = max(
        300,
        min(
            samples,
            5000,
        ),
    )

    x = np.linspace(
        x_min,
        x_max,
        samples,
    )

    expressions = (
        spec.get(
            "expressions"
        )
        or []
    )

    if isinstance(
        expressions,
        str,
    ):
        expressions = [
            expressions
        ]

    if not expressions:
        raise ValueError(
            "No hay funciones para representar."
        )

    labels = (
        spec.get("labels")
        if isinstance(
            spec.get("labels"),
            list,
        )
        else []
    )

    plt.figure(
        figsize=(7.6, 4.8)
    )

    valid_curves = 0

    for index, raw in enumerate(
        expressions[:8]
    ):
        expr = parse_math(
            raw,
            [variable_name],
        )

        ensure_only_symbols(
            expr,
            {variable},
            f"La función {index + 1}",
        )

        function = lambdify_numeric(variable, expr)

        with np.errstate(
            all="ignore",
        ):
            y = np.asarray(
                function(x)
            )

        if y.ndim == 0:
            try:
                scalar_y = float(y)
            except (TypeError, ValueError) as error:
                raise ValueError(
                    f"No se puede evaluar numéricamente {expr}. "
                    "Comprueba que todos los parámetros tengan un valor concreto."
                ) from error

            y = np.full_like(
                x,
                scalar_y,
                dtype=float,
            )

        y = np.real_if_close(y)

        if np.iscomplexobj(y):
            continue

        y = np.asarray(
            y,
            dtype=float,
        )

        y[
            ~np.isfinite(y)
        ] = np.nan

        label = (
            str(labels[index])
            if index < len(labels)
            else str(expr)
        )

        plt.plot(
            x,
            y,
            label=label,
        )

        valid_curves += 1

    if valid_curves == 0:
        plt.close()

        raise ValueError(
            "No se ha podido obtener una curva real en ese dominio."
        )

    if get_bool(
        spec,
        "axis_at_zero",
        True,
    ):
        plt.axhline(
            0,
            linewidth=0.8,
        )

        plt.axvline(
            0,
            linewidth=0.8,
        )

    plt.xlim(
        x_min,
        x_max,
    )

    add_reference_marks(spec)
    apply_common_2d(spec)


def parametric_plot(
    spec: dict[str, Any],
) -> None:
    parameter_name = str(
        spec.get(
            "parameter",
            "t",
        )
    )

    parameter = sp.Symbol(
        parameter_name
    )

    t_min = parse_scalar(
        spec.get(
            "t_min",
            0,
        )
    )

    t_max = parse_scalar(
        spec.get(
            "t_max",
            "2*pi",
        )
    )

    samples = max(
        300,
        min(
            int(
                spec.get(
                    "samples",
                    1400,
                )
            ),
            5000,
        ),
    )

    t = np.linspace(
        t_min,
        t_max,
        samples,
    )

    x_expr = parse_math(
        spec.get(
            "x_expression"
        ),
        [parameter_name],
    )

    y_expr = parse_math(
        spec.get(
            "y_expression"
        ),
        [parameter_name],
    )

    x_function = lambdify_numeric(parameter, x_expr)

    y_function = lambdify_numeric(parameter, y_expr)

    x = np.asarray(
        x_function(t),
        dtype=float,
    )

    y = np.asarray(
        y_function(t),
        dtype=float,
    )

    plt.figure(
        figsize=(7.0, 5.4)
    )

    plt.plot(
        x,
        y,
    )

    apply_common_2d(spec)


def polar_plot(
    spec: dict[str, Any],
) -> None:
    parameter_name = str(
        spec.get(
            "parameter",
            "theta",
        )
    )

    parameter = sp.Symbol(
        parameter_name
    )

    theta_min = parse_scalar(
        spec.get(
            "theta_min",
            0,
        )
    )

    theta_max = parse_scalar(
        spec.get(
            "theta_max",
            "2*pi",
        )
    )

    samples = max(
        360,
        min(
            int(
                spec.get(
                    "samples",
                    1600,
                )
            ),
            5000,
        ),
    )

    theta = np.linspace(
        theta_min,
        theta_max,
        samples,
    )

    r_expr = parse_math(
        spec.get(
            "r_expression"
        ),
        [parameter_name],
    )

    r_function = lambdify_numeric(parameter, r_expr)

    r = np.asarray(
        r_function(theta),
        dtype=float,
    )

    figure = plt.figure(
        figsize=(6.4, 6.0)
    )

    axis = figure.add_subplot(
        111,
        projection="polar",
    )

    axis.plot(
        theta,
        r,
    )

    title = str(
        spec.get(
            "title",
            "",
        )
    ).strip()

    if title:
        axis.set_title(
            title,
            pad=18,
        )

    if get_bool(
        spec,
        "grid",
        True,
    ):
        axis.grid(
            True,
            alpha=0.3,
        )


def implicit_curve(
    spec: dict[str, Any],
) -> None:
    x_name = str(
        spec.get(
            "x_variable",
            "x",
        )
    )

    y_name = str(
        spec.get(
            "y_variable",
            "y",
        )
    )

    x_symbol = sp.Symbol(
        x_name
    )

    y_symbol = sp.Symbol(
        y_name
    )

    expression = parse_math(
        spec.get(
            "expression"
        ),
        [
            x_name,
            y_name,
        ],
    )

    x_min = parse_scalar(
        spec.get(
            "x_min",
            -5,
        )
    )

    x_max = parse_scalar(
        spec.get(
            "x_max",
            5,
        )
    )

    y_min = parse_scalar(
        spec.get(
            "y_min",
            -5,
        )
    )

    y_max = parse_scalar(
        spec.get(
            "y_max",
            5,
        )
    )

    resolution = max(
        220,
        min(
            int(
                spec.get(
                    "samples",
                    600,
                )
            ),
            1200,
        ),
    )

    x = np.linspace(
        x_min,
        x_max,
        resolution,
    )

    y = np.linspace(
        y_min,
        y_max,
        resolution,
    )

    X, Y = np.meshgrid(
        x,
        y,
    )

    function = sp.lambdify(
        (
            x_symbol,
            y_symbol,
        ),
        expression,
        modules=[SPECIAL_NUMERIC_MODULES, "scipy", "numpy"],
    )

    with np.errstate(
        all="ignore",
    ):
        Z = np.asarray(
            function(
                X,
                Y,
            ),
            dtype=float,
        )

    plt.figure(
        figsize=(6.6, 5.6)
    )

    plt.contour(
        X,
        Y,
        Z,
        levels=[0],
        linewidths=1.8,
    )

    plt.xlim(
        x_min,
        x_max,
    )

    plt.ylim(
        y_min,
        y_max,
    )

    apply_common_2d(
        spec,
        allow_legend=False,
    )


def contour_plot(
    spec: dict[str, Any],
) -> None:
    x_name = str(
        spec.get(
            "x_variable",
            "x",
        )
    )

    y_name = str(
        spec.get(
            "y_variable",
            "y",
        )
    )

    x_symbol = sp.Symbol(
        x_name
    )

    y_symbol = sp.Symbol(
        y_name
    )

    expression = parse_math(
        spec.get(
            "expression"
        ),
        [
            x_name,
            y_name,
        ],
    )

    x_min = parse_scalar(
        spec.get(
            "x_min",
            -5,
        )
    )

    x_max = parse_scalar(
        spec.get(
            "x_max",
            5,
        )
    )

    y_min = parse_scalar(
        spec.get(
            "y_min",
            -5,
        )
    )

    y_max = parse_scalar(
        spec.get(
            "y_max",
            5,
        )
    )

    resolution = max(
        100,
        min(
            int(
                spec.get(
                    "samples",
                    300,
                )
            ),
            700,
        ),
    )

    x = np.linspace(
        x_min,
        x_max,
        resolution,
    )

    y = np.linspace(
        y_min,
        y_max,
        resolution,
    )

    X, Y = np.meshgrid(
        x,
        y,
    )

    function = sp.lambdify(
        (
            x_symbol,
            y_symbol,
        ),
        expression,
        modules=[SPECIAL_NUMERIC_MODULES, "scipy", "numpy"],
    )

    with np.errstate(
        all="ignore",
    ):
        Z = np.asarray(
            function(
                X,
                Y,
            ),
            dtype=float,
        )

    plt.figure(
        figsize=(6.8, 5.5)
    )

    raw_levels = spec.get(
        "levels",
        12,
    )

    if isinstance(
        raw_levels,
        list,
    ):
        levels = [
            parse_scalar(value)
            for value in raw_levels
        ]
    else:
        levels = max(
            3,
            min(
                int(raw_levels),
                40,
            ),
        )

    if get_bool(
        spec,
        "filled",
        True,
    ):
        contour = plt.contourf(
            X,
            Y,
            Z,
            levels=levels,
        )
    else:
        contour = plt.contour(
            X,
            Y,
            Z,
            levels=levels,
        )

    if get_bool(
        spec,
        "colorbar",
        True,
    ):
        plt.colorbar(
            contour,
            ax=plt.gca(),
        )

    apply_common_2d(
        spec,
        allow_legend=False,
    )


def vector_field(
    spec: dict[str, Any],
) -> None:
    x_name = str(
        spec.get(
            "x_variable",
            "x",
        )
    )

    y_name = str(
        spec.get(
            "y_variable",
            "y",
        )
    )

    x_symbol = sp.Symbol(
        x_name
    )

    y_symbol = sp.Symbol(
        y_name
    )

    u_expr = parse_math(
        spec.get(
            "u_expression"
        ),
        [
            x_name,
            y_name,
        ],
    )

    v_expr = parse_math(
        spec.get(
            "v_expression"
        ),
        [
            x_name,
            y_name,
        ],
    )

    x_min = parse_scalar(
        spec.get(
            "x_min",
            -2,
        )
    )

    x_max = parse_scalar(
        spec.get(
            "x_max",
            2,
        )
    )

    y_min = parse_scalar(
        spec.get(
            "y_min",
            -2,
        )
    )

    y_max = parse_scalar(
        spec.get(
            "y_max",
            2,
        )
    )

    density = max(
        8,
        min(
            int(
                spec.get(
                    "density",
                    19,
                )
            ),
            45,
        ),
    )

    x = np.linspace(
        x_min,
        x_max,
        density,
    )

    y = np.linspace(
        y_min,
        y_max,
        density,
    )

    X, Y = np.meshgrid(
        x,
        y,
    )

    u_function = sp.lambdify(
        (
            x_symbol,
            y_symbol,
        ),
        u_expr,
        modules=[SPECIAL_NUMERIC_MODULES, "scipy", "numpy"],
    )

    v_function = sp.lambdify(
        (
            x_symbol,
            y_symbol,
        ),
        v_expr,
        modules=[SPECIAL_NUMERIC_MODULES, "scipy", "numpy"],
    )

    U = np.asarray(
        u_function(
            X,
            Y,
        ),
        dtype=float,
    )

    V = np.asarray(
        v_function(
            X,
            Y,
        ),
        dtype=float,
    )

    if get_bool(
        spec,
        "normalize_vectors",
        False,
    ):
        magnitude = np.hypot(
            U,
            V,
        )

        safe = np.where(
            magnitude == 0,
            1,
            magnitude,
        )

        U = U / safe
        V = V / safe

    plt.figure(
        figsize=(6.8, 5.6)
    )

    plt.quiver(
        X,
        Y,
        U,
        V,
    )

    plt.xlim(
        x_min,
        x_max,
    )

    plt.ylim(
        y_min,
        y_max,
    )

    apply_common_2d(
        spec,
        allow_legend=False,
    )


def scatter_fit(
    spec: dict[str, Any],
) -> None:
    x = np.asarray(
        spec.get("x") or [],
        dtype=float,
    )

    y = np.asarray(
        spec.get("y") or [],
        dtype=float,
    )

    if (
        x.size < 2
        or y.size != x.size
    ):
        raise ValueError(
            "Los datos x/y no son válidos."
        )

    x_error_raw = (
        spec.get("x_error")
        if isinstance(
            spec.get("x_error"),
            list,
        )
        else []
    )

    y_error_raw = (
        spec.get("y_error")
        if isinstance(
            spec.get("y_error"),
            list,
        )
        else []
    )

    x_error = (
        np.asarray(
            x_error_raw,
            dtype=float,
        )
        if len(
            x_error_raw
        ) == len(x)
        else None
    )

    y_error = (
        np.asarray(
            y_error_raw,
            dtype=float,
        )
        if len(
            y_error_raw
        ) == len(y)
        else None
    )

    plt.figure(
        figsize=(7.2, 4.8)
    )

    if (
        x_error is not None
        or y_error is not None
    ):
        plt.errorbar(
            x,
            y,
            xerr=x_error,
            yerr=y_error,
            fmt="o",
            label="Datos",
            capsize=3,
        )
    else:
        plt.scatter(
            x,
            y,
            label="Datos",
        )

    if get_bool(
        spec,
        "show_fit",
        True,
    ):
        degree = max(
            1,
            min(
                int(
                    spec.get(
                        "fit_degree",
                        1,
                    )
                ),
                min(
                    8,
                    len(x) - 1,
                ),
            ),
        )

        coefficients = np.polyfit(
            x,
            y,
            degree,
        )

        polynomial = np.poly1d(
            coefficients
        )

        x_line = np.linspace(
            float(
                np.min(x)
            ),
            float(
                np.max(x)
            ),
            600,
        )

        plt.plot(
            x_line,
            polynomial(x_line),
            label=f"Ajuste grado {degree}",
        )

    apply_common_2d(spec)


def surface_3d(
    spec: dict[str, Any],
) -> None:
    x_name = str(
        spec.get(
            "x_variable",
            "x",
        )
    )

    y_name = str(
        spec.get(
            "y_variable",
            "y",
        )
    )

    x_symbol = sp.Symbol(
        x_name
    )

    y_symbol = sp.Symbol(
        y_name
    )

    expression = parse_math(
        spec.get(
            "expression"
        ),
        [
            x_name,
            y_name,
        ],
    )

    x_min = parse_scalar(
        spec.get(
            "x_min",
            -5,
        )
    )

    x_max = parse_scalar(
        spec.get(
            "x_max",
            5,
        )
    )

    y_min = parse_scalar(
        spec.get(
            "y_min",
            -5,
        )
    )

    y_max = parse_scalar(
        spec.get(
            "y_max",
            5,
        )
    )

    mesh_points = max(
        40,
        min(
            int(
                spec.get(
                    "mesh_points",
                    110,
                )
            ),
            220,
        ),
    )

    x = np.linspace(
        x_min,
        x_max,
        mesh_points,
    )

    y = np.linspace(
        y_min,
        y_max,
        mesh_points,
    )

    X, Y = np.meshgrid(
        x,
        y,
    )

    function = sp.lambdify(
        (
            x_symbol,
            y_symbol,
        ),
        expression,
        modules=[SPECIAL_NUMERIC_MODULES, "scipy", "numpy"],
    )

    with np.errstate(
        all="ignore",
    ):
        Z = np.asarray(
            function(
                X,
                Y,
            ),
            dtype=float,
        )

    figure = plt.figure(
        figsize=(7.2, 5.8)
    )

    axis = figure.add_subplot(
        111,
        projection="3d",
    )

    axis.plot_surface(
        X,
        Y,
        Z,
        linewidth=0,
        antialiased=True,
    )

    axis.set_xlabel(
        str(
            spec.get(
                "x_label",
                x_name,
            )
        )
    )

    axis.set_ylabel(
        str(
            spec.get(
                "y_label",
                y_name,
            )
        )
    )

    axis.set_zlabel(
        str(
            spec.get(
                "z_label",
                "z",
            )
        )
    )

    title = str(
        spec.get(
            "title",
            "",
        )
    ).strip()

    if title:
        axis.set_title(title)


def save_figure(
    output_dir: Path,
    file_stem: str,
    dpi: int,
) -> tuple[Path, Path]:
    output_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    png_path = (
        output_dir
        / f"{file_stem}.png"
    )

    pdf_path = (
        output_dir
        / f"{file_stem}.pdf"
    )

    plt.tight_layout()

    plt.savefig(
        png_path,
        dpi=dpi,
        bbox_inches="tight",
    )

    plt.savefig(
        pdf_path,
        bbox_inches="tight",
    )

    plt.close()

    return (
        png_path,
        pdf_path,
    )


def generate(
    spec: dict[str, Any],
    output_dir: Path,
    file_stem: str,
) -> dict[str, Any]:
    plot_type = str(
        spec.get(
            "type",
            "function_plot",
        )
    )

    handlers = {
        "function_plot": function_plot,
        "parametric": parametric_plot,
        "polar": polar_plot,
        "implicit_curve": implicit_curve,
        "contour": contour_plot,
        "vector_field": vector_field,
        "scatter_fit": scatter_fit,
        "surface_3d": surface_3d,
    }

    handler = handlers.get(
        plot_type
    )

    if handler is None:
        raise ValueError(
            f"Tipo de gráfica no soportado: {plot_type}"
        )

    handler(spec)

    dpi = max(
        120,
        min(
            int(
                spec.get(
                    "dpi",
                    170,
                )
            ),
            240,
        ),
    )

    png_path, pdf_path = (
        save_figure(
            output_dir,
            file_stem,
            dpi,
        )
    )

    return {
        "ok": True,
        "plot_type": plot_type,
        "png_path": str(
            png_path.resolve()
        ),
        "pdf_path": str(
            pdf_path.resolve()
        ),
    }


def health() -> dict[str, Any]:
    return {
        "ok": True,
        "engine": "Lumina Notebook Scientific Plot",
        "version": "1.1",
        "python": sys.version.split()[0],
        "sympy": sp.__version__,
        "numpy": np.__version__,
        "matplotlib": matplotlib.__version__,
        "scipy": __import__("scipy").__version__,
        "types": [
            "function_plot",
            "parametric",
            "polar",
            "implicit_curve",
            "contour",
            "vector_field",
            "scatter_fit",
            "surface_3d",
        ],
    }


def main() -> None:
    try:
        raw = sys.stdin.read()

        request = json.loads(
            raw or "{}"
        )

        operation = str(
            request.get(
                "operation",
                "generate",
            )
        )

        if operation == "health":
            response = health()
        elif operation == "generate":
            spec = request.get(
                "spec"
            )

            if not isinstance(
                spec,
                dict,
            ):
                raise ValueError(
                    "Falta spec."
                )

            output_dir = Path(
                request.get(
                    "output_dir",
                    ".",
                )
            ).resolve()

            file_stem = str(
                request.get(
                    "file_stem",
                    "scientific-plot",
                )
            )

            if not re.fullmatch(
                r"[A-Za-z0-9_-]+",
                file_stem,
            ):
                raise ValueError(
                    "Nombre de archivo no válido."
                )

            response = generate(
                spec,
                output_dir,
                file_stem,
            )
        else:
            raise ValueError(
                f"Operación desconocida: {operation}"
            )
    except Exception as error:
        try:
            plt.close()
        except Exception:
            pass

        response = {
            "ok": False,
            "error": str(error),
        }

    sys.stdout.write(
        json.dumps(
            response,
            ensure_ascii=False,
            allow_nan=False,
        )
    )


if __name__ == "__main__":
    main()
