from __future__ import annotations

import base64
import json
import math
import os
import queue
import socket
import subprocess
import threading
import time
import tkinter as tk
from datetime import date
from pathlib import Path
from tkinter import ttk
from urllib import error as urllib_error
from urllib import request as urllib_request
import webbrowser

ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = Path(__file__).resolve().parent / "assets"

FRONTEND_URL = "http://localhost:5173"
BACKEND_URL = "http://localhost:3001"
CHAT_URL = f"{BACKEND_URL}/api/chat/contextual"

TRANSPARENT = "#010203"
PET_W = 190
PET_H = 185

BUBBLE_W = 470
BUBBLE_H = 500
BUBBLE_GAP = 8

CREATE_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)
DETACHED_PROCESS = getattr(subprocess, "DETACHED_PROCESS", 0x00000008)

SUBJECTS = [
    ("nanotechnologies", "Nanotechnologies"),
    ("quantum_technologies", "Quantum Technologies"),
    ("microelectronics_design", "Microelectronics Design"),
    ("cpia", "CPIA"),
    ("biophotonics", "Biophotonics"),
]

MODES = [
    ("conceptual", "Conceptual"),
    ("problems", "Problemas"),
    ("exam", "Examen"),
]

SUBJECT_BY_NAME = {name: subject_id for subject_id, name in SUBJECTS}
MODE_BY_NAME = {name: mode_id for mode_id, name in MODES}

WORKSPACE_URLS = {
    "Abrir Lumina": f"{FRONTEND_URL}/?workspace=study",
    "Apuntes": f"{FRONTEND_URL}/?workspace=notes",
    "Agenda": f"{FRONTEND_URL}/?workspace=planner",
    "Calificaciones": f"{FRONTEND_URL}/?workspace=grades",
    "Biblioteca PDF": f"{BACKEND_URL}/rag-library",
}


def port_open(port: int, host: str = "127.0.0.1", timeout: float = 0.18) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def hidden_process(command: list[str], cwd: Path) -> None:
    kwargs = {
        "cwd": str(cwd),
        "stdin": subprocess.DEVNULL,
        "stdout": subprocess.DEVNULL,
        "stderr": subprocess.DEVNULL,
    }

    if os.name == "nt":
        kwargs["creationflags"] = CREATE_NO_WINDOW | DETACHED_PROCESS

    subprocess.Popen(command, **kwargs)


def ensure_ollama() -> None:
    if port_open(11434):
        return

    try:
        hidden_process(["ollama", "serve"], ROOT)
    except Exception:
        pass


def ensure_backend() -> None:
    ensure_ollama()

    if not port_open(3001):
        try:
            hidden_process(["npm.cmd", "run", "notes"], ROOT)
        except Exception:
            pass


def ensure_full_lumina() -> None:
    ensure_backend()

    if not port_open(5173):
        try:
            hidden_process(["npm.cmd", "run", "dev"], ROOT)
        except Exception:
            pass


def wait_for_port(port: int, timeout: float) -> bool:
    deadline = time.time() + timeout

    while time.time() < deadline:
        if port_open(port):
            return True
        time.sleep(0.2)

    return False


def open_url(url: str) -> None:
    def worker():
        if "localhost:5173" in url:
            ensure_full_lumina()
            wait_for_port(5173, 12.0)
        elif "localhost:3001" in url:
            ensure_backend()
            wait_for_port(3001, 10.0)

        webbrowser.open(url)

    threading.Thread(target=worker, daemon=True).start()


def clean_for_minichat(text: str) -> str:
    """Keep Markdown readable in a plain Tk text widget."""
    value = str(text or "")
    value = value.replace("**", "")
    value = value.replace("### ", "")
    value = value.replace("## ", "")
    value = value.replace("# ", "")
    return value


class LuminaLlama:
    def __init__(self) -> None:
        self.root = tk.Tk()
        self.root.title("Lumina Llama")
        self.root.overrideredirect(True)
        self.root.attributes("-topmost", True)

        if os.name == "nt":
            self.root.wm_attributes("-transparentcolor", TRANSPARENT)

        self.root.configure(bg=TRANSPARENT)

        screen_w = self.root.winfo_screenwidth()
        screen_h = self.root.winfo_screenheight()
        x = max(20, screen_w - PET_W - 35)
        y = max(20, screen_h - PET_H - 85)
        self.root.geometry(f"{PET_W}x{PET_H}+{x}+{y}")

        self.canvas = tk.Canvas(
            self.root,
            width=PET_W,
            height=PET_H,
            bg=TRANSPARENT,
            highlightthickness=0,
            bd=0,
        )
        self.canvas.pack(fill="both", expand=True)

        self.frames = self._load_frames()
        self.current_frame = 0

        self.image_item = self.canvas.create_image(
            PET_W // 2,
            PET_H // 2 - 5,
            image=self.frames[0],
            anchor="center",
        )

        self.status_item = self.canvas.create_oval(
            PET_W - 28,
            PET_H - 31,
            PET_W - 15,
            PET_H - 18,
            fill="#64748b",
            outline="#0f172a",
            width=2,
        )

        self.tooltip_bg = self.canvas.create_rectangle(
            13,
            4,
            PET_W - 13,
            31,
            fill="#0f172a",
            outline="#334155",
            width=1,
            state="hidden",
        )

        self.tooltip = self.canvas.create_text(
            PET_W // 2,
            18,
            text="Lumina · clic para preguntar",
            fill="#e2e8f0",
            font=("Segoe UI", 9, "bold"),
            state="hidden",
        )

        self.press_x = 0
        self.press_y = 0
        self.start_win_x = 0
        self.start_win_y = 0
        self.dragged = False

        self.canvas.bind("<ButtonPress-1>", self._press)
        self.canvas.bind("<B1-Motion>", self._drag)
        self.canvas.bind("<ButtonRelease-1>", self._release)
        self.canvas.bind("<Button-3>", self._context_menu)
        self.canvas.bind("<Enter>", self._enter)
        self.canvas.bind("<Leave>", self._leave)

        self.menu = tk.Menu(self.root, tearoff=0)

        for label, url in WORKSPACE_URLS.items():
            self.menu.add_command(
                label=label,
                command=lambda u=url: open_url(u),
            )

        self.menu.add_separator()
        self.menu.add_command(
            label="Nuevo mini-chat",
            command=self._new_chat,
        )
        self.menu.add_command(
            label="Reiniciar servicios Lumina",
            command=lambda: threading.Thread(
                target=ensure_backend,
                daemon=True,
            ).start(),
        )
        self.menu.add_separator()
        self.menu.add_command(
            label="Salir",
            command=self._quit,
        )

        self.bubble: tk.Toplevel | None = None
        self.response_text: tk.Text | None = None
        self.prompt_entry: tk.Entry | None = None
        self.subject_combo: ttk.Combobox | None = None
        self.mode_combo: ttk.Combobox | None = None
        self.send_button: tk.Button | None = None
        self.bubble_status_var = tk.StringVar(value="Qwen local")
        self.messages: list[dict[str, str]] = []
        self.event_queue: queue.Queue = queue.Queue()
        self.busy = False
        self.image_refs = []

        self._configure_ttk()
        self._animate()
        self._update_status()
        self._drain_queue()

    def _configure_ttk(self) -> None:
        style = ttk.Style()

        try:
            style.theme_use("clam")
        except tk.TclError:
            pass

        style.configure(
            "Lumina.TCombobox",
            fieldbackground="#111827",
            background="#111827",
            foreground="#e2e8f0",
            arrowcolor="#67e8f9",
            bordercolor="#334155",
            lightcolor="#334155",
            darkcolor="#334155",
            padding=5,
        )

        style.map(
            "Lumina.TCombobox",
            fieldbackground=[("readonly", "#111827")],
            foreground=[("readonly", "#e2e8f0")],
        )

    def _load_frames(self):
        paths = [
            ASSET_DIR / "llama_idle_0.png",
            ASSET_DIR / "llama_idle_1.png",
        ]

        return [
            tk.PhotoImage(file=str(path))
            for path in paths
        ]

    def _press(self, event):
        self.press_x = event.x_root
        self.press_y = event.y_root
        self.start_win_x = self.root.winfo_x()
        self.start_win_y = self.root.winfo_y()
        self.dragged = False

    def _drag(self, event):
        dx = event.x_root - self.press_x
        dy = event.y_root - self.press_y

        if abs(dx) + abs(dy) > 6:
            self.dragged = True

        self.root.geometry(
            f"+{self.start_win_x + dx}+{self.start_win_y + dy}"
        )

        if self.bubble and self.bubble.winfo_exists():
            self._position_bubble()

    def _release(self, _event):
        if not self.dragged:
            self._toggle_bubble()

    def _context_menu(self, event):
        try:
            self.menu.tk_popup(
                event.x_root,
                event.y_root,
            )
        finally:
            self.menu.grab_release()

    def _enter(self, _event):
        self.canvas.itemconfigure(
            self.tooltip_bg,
            state="normal",
        )
        self.canvas.itemconfigure(
            self.tooltip,
            state="normal",
        )

    def _leave(self, _event):
        self.canvas.itemconfigure(
            self.tooltip_bg,
            state="hidden",
        )
        self.canvas.itemconfigure(
            self.tooltip,
            state="hidden",
        )

    def _position_bubble(self) -> None:
        if not self.bubble or not self.bubble.winfo_exists():
            return

        self.root.update_idletasks()

        screen_w = self.root.winfo_screenwidth()
        screen_h = self.root.winfo_screenheight()

        pet_x = self.root.winfo_x()
        pet_y = self.root.winfo_y()

        x = pet_x + PET_W - BUBBLE_W
        y = pet_y - BUBBLE_H - BUBBLE_GAP

        if x < 10:
            x = 10

        if x + BUBBLE_W > screen_w - 10:
            x = screen_w - BUBBLE_W - 10

        if y < 10:
            # Not enough space above: place to the left or right.
            right_x = pet_x + PET_W + BUBBLE_GAP

            if right_x + BUBBLE_W <= screen_w - 10:
                x = right_x
                y = max(
                    10,
                    min(
                        pet_y - 40,
                        screen_h - BUBBLE_H - 10,
                    ),
                )
            else:
                x = max(
                    10,
                    pet_x - BUBBLE_W - BUBBLE_GAP,
                )
                y = max(
                    10,
                    min(
                        pet_y - 40,
                        screen_h - BUBBLE_H - 10,
                    ),
                )

        self.bubble.geometry(
            f"{BUBBLE_W}x{BUBBLE_H}+{x}+{y}"
        )

    def _make_bubble(self) -> None:
        if self.bubble and self.bubble.winfo_exists():
            return

        bubble = tk.Toplevel(self.root)
        bubble.title("Lumina Mini Chat")
        bubble.attributes("-topmost", True)
        bubble.configure(bg="#0b1120")
        bubble.resizable(False, False)
        bubble.protocol(
            "WM_DELETE_WINDOW",
            self._hide_bubble,
        )
        bubble.bind(
            "<Escape>",
            lambda _event: self._hide_bubble(),
        )

        self.bubble = bubble
        self._position_bubble()

        outer = tk.Frame(
            bubble,
            bg="#0b1120",
            highlightbackground="#334155",
            highlightthickness=1,
        )
        outer.pack(fill="both", expand=True)

        header = tk.Frame(
            outer,
            bg="#0f172a",
            height=54,
        )
        header.pack(
            fill="x",
            padx=1,
            pady=(1, 0),
        )
        header.pack_propagate(False)

        title_wrap = tk.Frame(
            header,
            bg="#0f172a",
        )
        title_wrap.pack(
            side="left",
            fill="both",
            expand=True,
            padx=14,
            pady=8,
        )

        tk.Label(
            title_wrap,
            text="Lumina",
            bg="#0f172a",
            fg="#f8fafc",
            font=("Segoe UI", 12, "bold"),
        ).pack(anchor="w")

        tk.Label(
            title_wrap,
            textvariable=self.bubble_status_var,
            bg="#0f172a",
            fg="#67e8f9",
            font=("Segoe UI", 8),
        ).pack(anchor="w")

        tk.Button(
            header,
            text="↗",
            command=lambda: open_url(
                WORKSPACE_URLS["Abrir Lumina"]
            ),
            bg="#0f172a",
            fg="#94a3b8",
            activebackground="#1e293b",
            activeforeground="#f8fafc",
            bd=0,
            font=("Segoe UI", 13, "bold"),
            cursor="hand2",
            width=3,
        ).pack(side="right", padx=(0, 2))

        tk.Button(
            header,
            text="×",
            command=self._hide_bubble,
            bg="#0f172a",
            fg="#94a3b8",
            activebackground="#1e293b",
            activeforeground="#f8fafc",
            bd=0,
            font=("Segoe UI", 14),
            cursor="hand2",
            width=3,
        ).pack(side="right")

        controls = tk.Frame(
            outer,
            bg="#0b1120",
        )
        controls.pack(
            fill="x",
            padx=12,
            pady=(11, 7),
        )

        self.subject_combo = ttk.Combobox(
            controls,
            state="readonly",
            style="Lumina.TCombobox",
            values=[name for _, name in SUBJECTS],
            width=25,
        )
        self.subject_combo.set(SUBJECTS[0][1])
        self.subject_combo.pack(
            side="left",
            fill="x",
            expand=True,
        )

        self.mode_combo = ttk.Combobox(
            controls,
            state="readonly",
            style="Lumina.TCombobox",
            values=[name for _, name in MODES],
            width=13,
        )
        self.mode_combo.set(MODES[0][1])
        self.mode_combo.pack(
            side="left",
            padx=(8, 0),
        )

        body = tk.Frame(
            outer,
            bg="#0b1120",
        )
        body.pack(
            fill="both",
            expand=True,
            padx=12,
            pady=(0, 8),
        )

        scrollbar = tk.Scrollbar(body)
        scrollbar.pack(side="right", fill="y")

        self.response_text = tk.Text(
            body,
            wrap="word",
            bg="#0f172a",
            fg="#dbeafe",
            insertbackground="#67e8f9",
            selectbackground="#164e63",
            relief="flat",
            padx=12,
            pady=10,
            font=("Segoe UI", 10),
            yscrollcommand=scrollbar.set,
            state="disabled",
        )
        self.response_text.pack(
            side="left",
            fill="both",
            expand=True,
        )
        scrollbar.config(
            command=self.response_text.yview
        )

        self.response_text.tag_configure(
            "user",
            foreground="#67e8f9",
            font=("Segoe UI", 10, "bold"),
        )
        self.response_text.tag_configure(
            "assistant",
            foreground="#e2e8f0",
        )
        self.response_text.tag_configure(
            "muted",
            foreground="#64748b",
            font=("Segoe UI", 8),
        )
        self.response_text.tag_configure(
            "error",
            foreground="#fda4af",
        )

        if not self.messages:
            self._append_text(
                "Pregunta lo que quieras. Solo arrancaré el backend y Qwen; "
                "no hace falta abrir Lumina entero.\n",
                "muted",
            )

        composer = tk.Frame(
            outer,
            bg="#0b1120",
        )
        composer.pack(
            fill="x",
            padx=12,
            pady=(0, 12),
        )

        self.prompt_entry = tk.Entry(
            composer,
            bg="#111827",
            fg="#f8fafc",
            insertbackground="#67e8f9",
            relief="flat",
            font=("Segoe UI", 10),
        )
        self.prompt_entry.pack(
            side="left",
            fill="x",
            expand=True,
            ipady=9,
        )
        self.prompt_entry.bind(
            "<Return>",
            self._send_from_event,
        )

        self.send_button = tk.Button(
            composer,
            text="Enviar",
            command=self._send_message,
            bg="#22d3ee",
            fg="#082f49",
            activebackground="#67e8f9",
            activeforeground="#082f49",
            bd=0,
            padx=15,
            pady=8,
            font=("Segoe UI", 9, "bold"),
            cursor="hand2",
        )
        self.send_button.pack(
            side="left",
            padx=(8, 0),
        )

        footer = tk.Frame(
            outer,
            bg="#0b1120",
        )
        footer.pack(
            fill="x",
            padx=12,
            pady=(0, 9),
        )

        tk.Button(
            footer,
            text="Nueva conversación",
            command=self._new_chat,
            bg="#0b1120",
            fg="#64748b",
            activebackground="#0b1120",
            activeforeground="#cbd5e1",
            bd=0,
            font=("Segoe UI", 8),
            cursor="hand2",
        ).pack(side="left")

        tk.Label(
            footer,
            text="Enter para enviar",
            bg="#0b1120",
            fg="#475569",
            font=("Segoe UI", 8),
        ).pack(side="right")

    def _toggle_bubble(self) -> None:
        self._make_bubble()

        if self.bubble.state() == "withdrawn":
            self._show_bubble()
        elif self.bubble.winfo_viewable():
            self._hide_bubble()
        else:
            self._show_bubble()

    def _show_bubble(self) -> None:
        self._make_bubble()
        self._position_bubble()
        self.bubble.deiconify()
        self.bubble.lift()

        if self.prompt_entry:
            self.prompt_entry.focus_set()

    def _hide_bubble(self) -> None:
        if self.bubble and self.bubble.winfo_exists():
            self.bubble.withdraw()

    def _new_chat(self) -> None:
        self.messages = []
        self.image_refs.clear()

        if self.response_text:
            self.response_text.configure(state="normal")
            self.response_text.delete("1.0", "end")
            self.response_text.configure(state="disabled")

            self._append_text(
                "Nueva conversación.\n",
                "muted",
            )

        self._show_bubble()

    def _send_from_event(self, _event):
        self._send_message()
        return "break"

    def _append_text(self, text: str, tag: str | None = None) -> None:
        if not self.response_text:
            return

        self.response_text.configure(state="normal")
        self.response_text.insert(
            "end",
            text,
            tag or (),
        )
        self.response_text.configure(state="disabled")
        self.response_text.see("end")

    def _append_image(self, b64_data: str) -> None:
        if not self.response_text:
            return

        try:
            image = tk.PhotoImage(data=b64_data)

            if image.width() > 390:
                factor = max(
                    1,
                    math.ceil(
                        image.width() / 390
                    ),
                )
                image = image.subsample(
                    factor,
                    factor,
                )

            self.image_refs.append(image)

            self.response_text.configure(
                state="normal"
            )
            self.response_text.insert(
                "end",
                "\n",
            )
            self.response_text.image_create(
                "end",
                image=image,
            )
            self.response_text.insert(
                "end",
                "\n",
            )
            self.response_text.configure(
                state="disabled"
            )
            self.response_text.see("end")
        except Exception:
            self._append_text(
                "\n[Se ha generado una gráfica. Ábrela en Lumina para verla.]\n",
                "muted",
            )

    def _set_busy(self, busy: bool) -> None:
        self.busy = busy

        if self.send_button:
            self.send_button.configure(
                state="disabled" if busy else "normal",
                text="..." if busy else "Enviar",
            )

        if self.prompt_entry:
            self.prompt_entry.configure(
                state="disabled" if busy else "normal"
            )

    def _selected_subject(self) -> tuple[str, str]:
        name = (
            self.subject_combo.get()
            if self.subject_combo
            else SUBJECTS[0][1]
        )

        return (
            SUBJECT_BY_NAME.get(
                name,
                SUBJECTS[0][0],
            ),
            name,
        )

    def _selected_mode(self) -> str:
        name = (
            self.mode_combo.get()
            if self.mode_combo
            else MODES[0][1]
        )

        return MODE_BY_NAME.get(
            name,
            "conceptual",
        )

    def _send_message(self) -> None:
        if self.busy or not self.prompt_entry:
            return

        prompt = self.prompt_entry.get().strip()

        if not prompt:
            return

        self.prompt_entry.delete(0, "end")
        self._append_text(
            f"\nTú\n{prompt}\n\n",
            "user",
        )

        self.messages.append(
            {
                "role": "user",
                "content": prompt,
            }
        )

        # Keep a small local conversation to keep latency/context under control.
        self.messages = self.messages[-10:]

        self._set_busy(True)
        self.bubble_status_var.set(
            "Preparando Qwen…"
        )

        subject_id, subject_name = self._selected_subject()
        mode = self._selected_mode()

        threading.Thread(
            target=self._chat_worker,
            args=(subject_id, subject_name, mode),
            daemon=True,
        ).start()

    def _chat_worker(
        self,
        subject_id: str,
        subject_name: str,
        mode: str,
    ) -> None:
        assistant_parts: list[str] = []

        try:
            ensure_backend()

            if not wait_for_port(3001, 12.0):
                raise RuntimeError(
                    "No he podido arrancar el backend de Lumina."
                )

            payload = {
                "subject": subject_id,
                "subjectName": subject_name,
                "selectedDateKey": date.today().isoformat(),
                "mode": mode,
                "languageCode": "es-ES",
                "languageName": "castellano",
                "diaryNotes": [],
                "messages": self.messages,
                "stream": True,
            }

            data = json.dumps(
                payload
            ).encode("utf-8")

            req = urllib_request.Request(
                CHAT_URL,
                data=data,
                headers={
                    "Content-Type": "application/json",
                    "Accept": "application/x-ndjson, application/json",
                },
                method="POST",
            )

            self.event_queue.put(
                ("status", "Qwen respondiendo…")
            )
            self.event_queue.put(
                ("assistant_start", None)
            )

            with urllib_request.urlopen(
                req,
                timeout=90,
            ) as response:
                for raw_line in response:
                    line = raw_line.decode(
                        "utf-8",
                        errors="replace",
                    ).strip()

                    if not line:
                        continue

                    try:
                        parsed = json.loads(line)
                    except json.JSONDecodeError:
                        continue

                    lumina = parsed.get("lumina") or {}

                    if (
                        lumina.get("type")
                        == "scientific_plot"
                    ):
                        url = str(
                            lumina.get("url") or ""
                        )

                        prefix = "data:image/png;base64,"

                        if url.startswith(prefix):
                            self.event_queue.put(
                                (
                                    "image",
                                    url[len(prefix):],
                                )
                            )
                        else:
                            self.event_queue.put(
                                (
                                    "text",
                                    "\n[Gráfica generada]\n",
                                )
                            )

                        continue

                    chunk = (
                        parsed.get("message", {})
                        .get("content", "")
                    )

                    if chunk:
                        assistant_parts.append(chunk)
                        self.event_queue.put(
                            (
                                "text",
                                clean_for_minichat(
                                    chunk
                                ),
                            )
                        )

            assistant = "".join(
                assistant_parts
            ).strip()

            if assistant:
                self.messages.append(
                    {
                        "role": "assistant",
                        "content": assistant,
                    }
                )
                self.messages = self.messages[-10:]

            self.event_queue.put(
                ("assistant_end", None)
            )
            self.event_queue.put(
                ("status", "Qwen local · listo")
            )

        except urllib_error.HTTPError as exc:
            try:
                detail = exc.read().decode(
                    "utf-8",
                    errors="replace",
                )
            except Exception:
                detail = ""

            self.event_queue.put(
                (
                    "error",
                    f"HTTP {exc.code}: {detail[:240]}",
                )
            )

        except Exception as exc:
            self.event_queue.put(
                (
                    "error",
                    str(exc),
                )
            )

        finally:
            self.event_queue.put(
                ("busy", False)
            )

    def _drain_queue(self) -> None:
        try:
            while True:
                kind, value = self.event_queue.get_nowait()

                if kind == "status":
                    self.bubble_status_var.set(
                        str(value)
                    )

                elif kind == "assistant_start":
                    self._append_text(
                        "Lumina\n",
                        "assistant",
                    )

                elif kind == "text":
                    self._append_text(
                        str(value),
                        "assistant",
                    )

                elif kind == "image":
                    self._append_image(
                        str(value)
                    )

                elif kind == "assistant_end":
                    self._append_text(
                        "\n\n",
                        "assistant",
                    )

                elif kind == "error":
                    self._append_text(
                        f"\nError\n{value}\n\n",
                        "error",
                    )
                    self.bubble_status_var.set(
                        "Error"
                    )

                elif kind == "busy":
                    self._set_busy(bool(value))

        except queue.Empty:
            pass

        self.root.after(
            45,
            self._drain_queue,
        )

    def _animate(self):
        now = int(time.time() * 10)
        blink = (now % 43) in (0, 1)
        next_frame = 1 if blink else 0

        if next_frame != self.current_frame:
            self.current_frame = next_frame
            self.canvas.itemconfigure(
                self.image_item,
                image=self.frames[next_frame],
            )

        bob = 2 if (now // 5) % 2 else 0

        self.canvas.coords(
            self.image_item,
            PET_W // 2,
            PET_H // 2 - 5 + bob,
        )

        self.root.after(
            120,
            self._animate,
        )

    def _update_status(self):
        backend = port_open(3001)
        ollama = port_open(11434)

        if backend and ollama:
            color = "#22c55e"
        elif backend or ollama:
            color = "#f59e0b"
        else:
            color = "#64748b"

        self.canvas.itemconfigure(
            self.status_item,
            fill=color,
        )

        self.root.after(
            2500,
            self._update_status,
        )

    def _quit(self) -> None:
        try:
            if self.bubble:
                self.bubble.destroy()
        finally:
            self.root.destroy()

    def run(self):
        self.root.mainloop()


if __name__ == "__main__":
    LuminaLlama().run()
