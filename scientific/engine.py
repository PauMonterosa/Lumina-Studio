#!/usr/bin/env python3
"""
Lumina Scientific Engine V1

Restricted scientific-computing backend for Lumina Studio.
It accepts a JSON request on stdin and returns JSON on stdout.

No arbitrary Python code is executed. Requests are mapped to a fixed set of
SymPy / NumPy / SciPy / Matplotlib operations.
"""

from __future__ import annotations

import json
import math
import os
import re
import sys
import uuid
from pathlib import Path
from typing import Any

import matplotlib
matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np
import scipy
from scipy import integrate as scipy_integrate
from scipy import optimize
from scipy.integrate import solve_ivp
import sympy as sp
from sympy.parsing.sympy_parser import (
    convert_xor,
    implicit_multiplication_application,
    parse_expr,
    standard_transformations,
)

MAX_TEXT = 12000
MAX_MATRIX_DIM = 20
MAX_ARRAY = 10000

TRANSFORMATIONS = standard_transformations + (
    convert_xor,
    implicit_multiplication_application,
)

SAFE_NAMES = {
    "pi": sp.pi,
    "E": sp.E,
    "I": sp.I,
    "oo": sp.oo,
    "inf": sp.oo,
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
    "floor": sp.floor,
    "ceiling": sp.ceiling,
    "Heaviside": sp.Heaviside,
}

SAFE_GLOBALS = {
    "__builtins__": {},
    "Symbol": sp.Symbol,
    "Integer": sp.Integer,
    "Float": sp.Float,
    "Rational": sp.Rational,
    **SAFE_NAMES,
}

IDENTIFIER = re.compile(r"\b[A-Za-z_][A-Za-z0-9_]*\b")
FORBIDDEN = re.compile(
    r"(__|import|exec|eval|open|compile|globals|locals|lambda|class|def|os|sys|subprocess)",
    re.I,
)


def fail(message: str, operation: str | None = None) -> dict[str, Any]:
    return {
        "ok": False,
        "operation": operation,
        "error": str(message),
    }


def clean_text(value: Any, name: str = "expression") -> str:
    text = str(value or "").strip()
    if not text:
        raise ValueError(f"Falta {name}.")
    if len(text) > MAX_TEXT:
        raise ValueError(f"{name} es demasiado largo.")
    if FORBIDDEN.search(text):
        raise ValueError(f"{name} contiene una construcción no permitida.")
    return text


def local_symbols(text: str, extra: list[str] | None = None) -> dict[str, Any]:
    names = set(IDENTIFIER.findall(text))
    if extra:
        names.update(extra)

    local = dict(SAFE_NAMES)

    for name in names:
        if name in SAFE_NAMES:
            continue
        if FORBIDDEN.fullmatch(name):
            continue
        local[name] = sp.Symbol(name)

    return local


def parse_math(value: Any, extra_symbols: list[str] | None = None) -> sp.Expr:
    text = clean_text(value)
    return parse_expr(
        text,
        local_dict=local_symbols(text, extra_symbols),
        global_dict=SAFE_GLOBALS,
        transformations=TRANSFORMATIONS,
        evaluate=True,
    )


def parse_scalar(value: Any) -> sp.Expr:
    if isinstance(value, (int, float)):
        return sp.Float(value) if isinstance(value, float) else sp.Integer(value)
    return parse_math(value)


def parse_equation(value: Any) -> sp.Equality:
    text = clean_text(value, "equation")

    if "=" in text:
        lhs, rhs = text.split("=", 1)
        return sp.Eq(parse_math(lhs), parse_math(rhs))

    return sp.Eq(parse_math(text), 0)


def symbol(name: Any, default: str = "x") -> sp.Symbol:
    raw = str(name or default).strip()
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", raw):
        raise ValueError("Variable no válida.")
    return sp.Symbol(raw)


def sympy_string(value: Any) -> Any:
    if isinstance(value, sp.MatrixBase):
        return [[str(item) for item in row] for row in value.tolist()]
    if isinstance(value, dict):
        return {str(k): sympy_string(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [sympy_string(v) for v in value]
    if isinstance(value, sp.Basic):
        return str(value)
    if isinstance(value, np.generic):
        return value.item()
    if isinstance(value, np.ndarray):
        return value.tolist()
    return value


def sympy_latex(value: Any) -> str:
    if isinstance(value, dict):
        parts = [rf"{sp.latex(k)}: {sp.latex(v)}" for k, v in value.items()]
        return r"\left\{" + ", ".join(parts) + r"\right\}"
    if isinstance(value, (list, tuple)):
        return r"\left[" + ", ".join(
            sp.latex(v) if isinstance(v, sp.Basic) else str(v) for v in value
        ) + r"\right]"
    if isinstance(value, sp.Basic) or isinstance(value, sp.MatrixBase):
        return sp.latex(value)
    return str(value)


def finite_float(value: Any) -> float:
    result = float(sp.N(value))
    if not math.isfinite(result):
        raise ValueError("El resultado numérico no es finito.")
    return result


def parse_substitutions(data: Any) -> dict[sp.Symbol, sp.Expr]:
    if not isinstance(data, dict):
        return {}
    output: dict[sp.Symbol, sp.Expr] = {}
    for key, value in data.items():
        output[symbol(key)] = parse_scalar(value)
    return output


def parse_matrix(data: Any) -> sp.Matrix:
    if not isinstance(data, list) or not data or not all(isinstance(row, list) for row in data):
        raise ValueError("matrix debe ser una lista bidimensional.")

    rows = len(data)
    cols = max(len(row) for row in data)

    if rows > MAX_MATRIX_DIM or cols > MAX_MATRIX_DIM:
        raise ValueError(f"La matriz supera {MAX_MATRIX_DIM}x{MAX_MATRIX_DIM}.")

    if any(len(row) != cols for row in data):
        raise ValueError("Todas las filas de la matriz deben tener la misma longitud.")

    return sp.Matrix([[parse_scalar(item) for item in row] for row in data])


def parse_vector(data: Any) -> sp.Matrix:
    if not isinstance(data, list) or not data:
        raise ValueError("vector debe ser una lista.")
    if len(data) > MAX_ARRAY:
        raise ValueError("El vector es demasiado grande.")
    return sp.Matrix([parse_scalar(item) for item in data])


def result_payload(operation: str, result: Any, *, latex: str | None = None, **extra: Any) -> dict[str, Any]:
    payload = {
        "ok": True,
        "operation": operation,
        "result": sympy_string(result),
    }
    if latex is not None:
        payload["latex"] = latex
    payload.update(extra)
    return payload


def op_symbolic(operation: str, request: dict[str, Any]) -> dict[str, Any]:
    expr = parse_math(request.get("expression"))
    var = symbol(request.get("variable", "x"))

    if operation == "simplify":
        result = sp.simplify(expr)
    elif operation == "expand":
        result = sp.expand(expr)
    elif operation == "factor":
        result = sp.factor(expr)
    elif operation == "diff":
        order = int(request.get("order", 1))
        order = max(1, min(order, 12))
        result = sp.diff(expr, var, order)
    elif operation == "integrate":
        lower = request.get("lower")
        upper = request.get("upper")
        if lower is not None and upper is not None:
            low = parse_scalar(lower)
            high = parse_scalar(upper)
            result = sp.integrate(expr, (var, low, high))
            return result_payload(
                operation,
                result,
                latex=sp.latex(result),
                numeric=str(sp.N(result, 14)),
            )
        result = sp.integrate(expr, var)
    elif operation == "limit":
        point = parse_scalar(request.get("point", 0))
        direction = str(request.get("direction", "+-"))
        if direction not in {"+", "-", "+-"}:
            direction = "+-"
        result = sp.limit(expr, var, point, dir=direction)
    elif operation == "series":
        point = parse_scalar(request.get("point", 0))
        order = int(request.get("order", 6))
        order = max(2, min(order, 20))
        result = sp.series(expr, var, point, order)
    elif operation == "evaluate":
        subs = parse_substitutions(request.get("substitutions"))
        precision = int(request.get("precision", 12))
        precision = max(4, min(precision, 50))
        substituted = expr.subs(subs)
        result = sp.N(substituted, precision)
        return result_payload(
            operation,
            result,
            latex=sp.latex(substituted),
            exact=str(sp.simplify(substituted)),
        )
    else:
        raise ValueError(f"Operación simbólica desconocida: {operation}")

    return result_payload(operation, result, latex=sp.latex(result))


def op_solve(request: dict[str, Any]) -> dict[str, Any]:
    equation = parse_equation(request.get("equation") or request.get("expression"))
    variable = symbol(request.get("variable", "x"))
    result = sp.solve(equation, variable)

    return result_payload(
        "solve",
        result,
        latex=sympy_latex(result),
        equation=str(equation),
    )


def op_matrix(request: dict[str, Any]) -> dict[str, Any]:
    matrix = parse_matrix(request.get("matrix"))
    action = str(request.get("action", "det")).lower()

    if action in {"det", "determinant"}:
        result = matrix.det()
        latex = sp.latex(result)
    elif action in {"inv", "inverse"}:
        result = matrix.inv()
        latex = sp.latex(result)
    elif action == "rank":
        result = matrix.rank()
        latex = sp.latex(result)
    elif action in {"eigenvalues", "eigen", "autovalores"}:
        result = matrix.eigenvals()
        latex = sympy_latex(result)
    elif action in {"eigenvectors", "autovectores"}:
        raw = matrix.eigenvects()
        result = [
            {
                "eigenvalue": str(value),
                "multiplicity": multiplicity,
                "vectors": [sympy_string(v) for v in vectors],
            }
            for value, multiplicity, vectors in raw
        ]
        latex = ""
    elif action == "transpose":
        result = matrix.T
        latex = sp.latex(result)
    else:
        raise ValueError("Acción de matriz no válida.")

    return result_payload(
        "matrix",
        result,
        latex=latex,
        action=action,
    )


def op_linear_solve(request: dict[str, Any]) -> dict[str, Any]:
    A = parse_matrix(request.get("matrix") or request.get("A"))
    b = parse_vector(request.get("vector") or request.get("b"))

    if A.rows != b.rows:
        raise ValueError("A y b tienen dimensiones incompatibles.")

    solution = sp.linsolve((A, b))
    return result_payload(
        "linear_solve",
        solution,
        latex=sp.latex(solution),
    )


def op_root(request: dict[str, Any]) -> dict[str, Any]:
    expr = parse_math(request.get("expression"))
    var = symbol(request.get("variable", "x"))
    function = sp.lambdify(var, expr, modules=["numpy"])

    bracket = request.get("bracket")
    guess = request.get("guess")

    if isinstance(bracket, list) and len(bracket) == 2:
        a = finite_float(parse_scalar(bracket[0]))
        b = finite_float(parse_scalar(bracket[1]))
        root = optimize.brentq(function, a, b)
        method = "brentq"
    elif guess is not None:
        root = optimize.newton(
            function,
            finite_float(parse_scalar(guess)),
        )
        method = "newton"
    else:
        raise ValueError("root necesita bracket=[a,b] o guess.")

    residual = float(function(root))
    return result_payload(
        "root",
        root,
        latex=sp.latex(sp.Float(root)),
        method=method,
        residual=residual,
    )


def op_numeric_integral(request: dict[str, Any]) -> dict[str, Any]:
    expr = parse_math(request.get("expression"))
    var = symbol(request.get("variable", "x"))
    lower = finite_float(parse_scalar(request.get("lower")))
    upper = finite_float(parse_scalar(request.get("upper")))
    function = sp.lambdify(var, expr, modules=["numpy"])

    value, error = scipy_integrate.quad(function, lower, upper, limit=200)

    return result_payload(
        "numeric_integral",
        value,
        latex=sp.latex(sp.Float(value)),
        estimated_error=error,
    )


def plot_path(request: dict[str, Any]) -> tuple[Path, str]:
    raw_dir = str(request.get("output_dir") or "").strip()
    if not raw_dir:
        raw_dir = str(Path.cwd() / ".lumina" / "scientific" / "plots")

    directory = Path(raw_dir).resolve()
    directory.mkdir(parents=True, exist_ok=True)

    filename = f"plot-{uuid.uuid4().hex}.png"
    return directory / filename, filename


def save_plot(path: Path) -> None:
    plt.tight_layout()
    plt.savefig(path, dpi=155, bbox_inches="tight")
    plt.close()


def op_plot(request: dict[str, Any]) -> dict[str, Any]:
    raw_expressions = request.get("expressions")
    if raw_expressions is None:
        raw_expressions = [request.get("expression")]
    if isinstance(raw_expressions, str):
        raw_expressions = [raw_expressions]
    if not isinstance(raw_expressions, list) or not raw_expressions:
        raise ValueError("Faltan expressions para representar.")
    raw_expressions = raw_expressions[:4]

    var = symbol(request.get("variable", "x"))
    x_min = finite_float(parse_scalar(request.get("x_min", -10)))
    x_max = finite_float(parse_scalar(request.get("x_max", 10)))
    if not math.isfinite(x_min) or not math.isfinite(x_max) or x_min >= x_max:
        raise ValueError("Rango x no válido.")

    x = np.linspace(x_min, x_max, 700)
    labels = request.get("labels") if isinstance(request.get("labels"), list) else []

    plt.figure(figsize=(7.2, 4.4))

    valid_count = 0
    expression_strings = []

    for index, raw in enumerate(raw_expressions):
        expr = parse_math(raw)
        expression_strings.append(str(expr))
        function = sp.lambdify(var, expr, modules=["numpy"])
        y = np.asarray(function(x))

        if y.ndim == 0:
            y = np.full_like(x, float(y), dtype=float)

        y = np.real_if_close(y)
        if np.iscomplexobj(y):
            continue

        y = np.asarray(y, dtype=float)
        y[~np.isfinite(y)] = np.nan

        label = labels[index] if index < len(labels) else str(expr)
        plt.plot(x, y, label=label)
        valid_count += 1

    if valid_count == 0:
        plt.close()
        raise ValueError("No se pudo obtener una curva real en el rango pedido.")

    plt.axhline(0, linewidth=0.8)
    plt.axvline(0, linewidth=0.8)
    plt.xlabel(str(var))
    plt.ylabel(str(request.get("y_label") or "f(x)"))
    title = str(request.get("title") or "Lumina Scientific Engine")
    plt.title(title)

    if valid_count > 1 or request.get("show_legend", True):
        plt.legend()

    plt.grid(True, alpha=0.25)

    path, filename = plot_path(request)
    save_plot(path)

    return result_payload(
        "plot",
        expression_strings,
        plot_file=filename,
        x_range=[x_min, x_max],
    )


def op_ode(request: dict[str, Any]) -> dict[str, Any]:
    rhs_text = request.get("expression") or request.get("rhs")
    rhs = parse_math(rhs_text, extra_symbols=["t", "y"])

    t_symbol = symbol(request.get("independent_variable", "t"), "t")
    y_symbol = symbol(request.get("dependent_variable", "y"), "y")

    t0 = finite_float(parse_scalar(request.get("t0", 0)))
    t1 = finite_float(parse_scalar(request.get("t1", 1)))
    y0 = finite_float(parse_scalar(request.get("y0", 0)))

    if t0 == t1:
        raise ValueError("t0 y t1 deben ser distintos.")

    substitutions = parse_substitutions(request.get("substitutions"))
    rhs = rhs.subs(substitutions)
    function = sp.lambdify((t_symbol, y_symbol), rhs, modules=["numpy"])

    n_points = int(request.get("points", 250))
    n_points = max(30, min(n_points, 2000))
    t_eval = np.linspace(t0, t1, n_points)

    def fun(t, y):
        return [float(function(t, y[0]))]

    solution = solve_ivp(
        fun,
        (t0, t1),
        [y0],
        t_eval=t_eval,
        rtol=1e-8,
        atol=1e-10,
    )

    if not solution.success:
        raise ValueError(solution.message)

    response = result_payload(
        "ode",
        {
            "t_final": float(solution.t[-1]),
            "y_final": float(solution.y[0, -1]),
        },
        rhs=str(rhs),
        points=n_points,
    )

    if request.get("plot"):
        plt.figure(figsize=(7.2, 4.4))
        plt.plot(solution.t, solution.y[0])
        plt.xlabel(str(t_symbol))
        plt.ylabel(str(y_symbol))
        plt.title(str(request.get("title") or "Solución numérica de la ODE"))
        plt.grid(True, alpha=0.25)

        path, filename = plot_path(request)
        save_plot(path)
        response["plot_file"] = filename

    if request.get("return_series"):
        cap = min(len(solution.t), 500)
        response["series"] = {
            "t": solution.t[:cap].tolist(),
            "y": solution.y[0, :cap].tolist(),
        }

    return response


def op_fft(request: dict[str, Any]) -> dict[str, Any]:
    samples = request.get("samples")
    if not isinstance(samples, list) or len(samples) < 2:
        raise ValueError("fft necesita una lista samples.")
    if len(samples) > MAX_ARRAY:
        raise ValueError(f"fft admite como máximo {MAX_ARRAY} muestras.")

    values = np.asarray(samples, dtype=float)
    sample_rate = float(request.get("sample_rate", 1.0))
    if sample_rate <= 0:
        raise ValueError("sample_rate debe ser positivo.")

    values = values - np.mean(values)
    spectrum = np.fft.rfft(values)
    frequencies = np.fft.rfftfreq(len(values), d=1.0 / sample_rate)
    magnitude = np.abs(spectrum) * 2.0 / len(values)

    if len(magnitude) > 0:
        magnitude[0] *= 0.5

    top_n = int(request.get("top_n", 8))
    top_n = max(1, min(top_n, 20))

    candidates = np.argsort(magnitude[1:])[::-1][:top_n] + 1 if len(magnitude) > 1 else np.array([], dtype=int)
    peaks = [
        {
            "frequency": float(frequencies[i]),
            "magnitude": float(magnitude[i]),
        }
        for i in candidates
    ]

    response = result_payload(
        "fft",
        peaks,
        sample_rate=sample_rate,
        n_samples=len(values),
    )

    if request.get("plot"):
        plt.figure(figsize=(7.2, 4.4))
        plt.plot(frequencies, magnitude)
        plt.xlabel("Frecuencia")
        plt.ylabel("Magnitud")
        plt.title(str(request.get("title") or "Espectro FFT"))
        plt.grid(True, alpha=0.25)

        path, filename = plot_path(request)
        save_plot(path)
        response["plot_file"] = filename

    return response


def op_polyfit(request: dict[str, Any]) -> dict[str, Any]:
    x_data = request.get("x")
    y_data = request.get("y")

    if not isinstance(x_data, list) or not isinstance(y_data, list):
        raise ValueError("polyfit necesita listas x e y.")
    if len(x_data) != len(y_data) or len(x_data) < 2:
        raise ValueError("x e y deben tener la misma longitud y al menos dos puntos.")
    if len(x_data) > MAX_ARRAY:
        raise ValueError("Demasiados puntos para polyfit.")

    x = np.asarray(x_data, dtype=float)
    y = np.asarray(y_data, dtype=float)
    degree = int(request.get("degree", 1))
    degree = max(1, min(degree, 8))

    coeffs = np.polyfit(x, y, degree)
    poly = np.poly1d(coeffs)
    prediction = poly(x)

    ss_res = float(np.sum((y - prediction) ** 2))
    ss_tot = float(np.sum((y - np.mean(y)) ** 2))
    r_squared = 1.0 - ss_res / ss_tot if ss_tot > 0 else 1.0

    response = result_payload(
        "polyfit",
        coeffs.tolist(),
        degree=degree,
        r_squared=r_squared,
        polynomial=str(poly),
    )

    if request.get("plot"):
        x_line = np.linspace(float(np.min(x)), float(np.max(x)), 500)
        plt.figure(figsize=(7.2, 4.4))
        plt.scatter(x, y, label="Datos")
        plt.plot(x_line, poly(x_line), label=f"Ajuste grado {degree}")
        plt.xlabel(str(request.get("x_label") or "x"))
        plt.ylabel(str(request.get("y_label") or "y"))
        plt.title(str(request.get("title") or "Ajuste polinómico"))
        plt.legend()
        plt.grid(True, alpha=0.25)

        path, filename = plot_path(request)
        save_plot(path)
        response["plot_file"] = filename

    return response


def health() -> dict[str, Any]:
    return {
        "ok": True,
        "operation": "health",
        "engine": "Lumina Scientific Engine",
        "version": "1.0",
        "python": sys.version.split()[0],
        "sympy": sp.__version__,
        "numpy": np.__version__,
        "scipy": scipy.__version__,
        "matplotlib": matplotlib.__version__,
        "operations": [
            "simplify",
            "expand",
            "factor",
            "solve",
            "diff",
            "integrate",
            "limit",
            "series",
            "evaluate",
            "matrix",
            "linear_solve",
            "root",
            "numeric_integral",
            "ode",
            "fft",
            "polyfit",
            "plot",
        ],
    }


def dispatch(request: dict[str, Any]) -> dict[str, Any]:
    operation = str(request.get("operation") or "").strip().lower()

    if operation == "health":
        return health()

    if operation in {
        "simplify",
        "expand",
        "factor",
        "diff",
        "integrate",
        "limit",
        "series",
        "evaluate",
    }:
        return op_symbolic(operation, request)

    if operation == "solve":
        return op_solve(request)

    if operation == "matrix":
        return op_matrix(request)

    if operation == "linear_solve":
        return op_linear_solve(request)

    if operation == "root":
        return op_root(request)

    if operation == "numeric_integral":
        return op_numeric_integral(request)

    if operation == "plot":
        return op_plot(request)

    if operation == "ode":
        return op_ode(request)

    if operation == "fft":
        return op_fft(request)

    if operation == "polyfit":
        return op_polyfit(request)

    raise ValueError(f"Operación no soportada: {operation or '(vacía)'}")


def main() -> None:
    try:
        raw = sys.stdin.read()
        request = json.loads(raw or "{}")
        if not isinstance(request, dict):
            raise ValueError("La petición debe ser un objeto JSON.")

        response = dispatch(request)
    except Exception as exc:
        operation = None
        try:
            operation = request.get("operation")  # type: ignore[name-defined]
        except Exception:
            pass
        response = fail(str(exc), operation)

    sys.stdout.write(json.dumps(response, ensure_ascii=False, allow_nan=False))


if __name__ == "__main__":
    main()
