import fs from "fs/promises";
import path from "path";

const CONFIG_PATH = path.resolve(
  process.cwd(),
  "google-calendar.bridge.json"
);

const SECRET_PLACEHOLDER = "89cc4388b0934b6f9da77e8d3b0c40cdbc44e5c300464efb963ae8120720f25e";

async function readConfig() {
  let text;

  try {
    text = await fs.readFile(CONFIG_PATH, "utf8");
  } catch {
    return {
      configured: false,
      url: "",
      secret: "",
    };
  }

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      "google-calendar.bridge.json no contiene JSON válido."
    );
  }

  const url = String(data.url || "").trim();
  const secret = String(data.secret || "").trim();

  const configured =
    /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(
      url
    ) &&
    secret &&
    secret !== SECRET_PLACEHOLDER;

  return {
    configured,
    url,
    secret,
  };
}

async function callBridge(action, payload = {}) {
  const config = await readConfig();

  if (!config.configured) {
    throw new Error(
      "Configura google-calendar.bridge.json y pega tu LUMINA_SECRET."
    );
  }

  const response = await fetch(config.url, {
    method: "POST",
    redirect: "follow",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify({
      secret: config.secret,
      action,
      ...payload,
    }),
  });

  const text = await response.text();

  let data;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(
      `Apps Script devolvió una respuesta no válida (HTTP ${response.status}).`
    );
  }

  if (!response.ok || !data.ok) {
    throw new Error(
      data?.error ||
        `Apps Script respondió con HTTP ${response.status}.`
    );
  }

  return data;
}

export function registerGoogleCalendarBridgeRoutes(app) {
  app.get("/api/calendar/google/status", async (req, res) => {
    try {
      const config = await readConfig();

      if (!config.configured) {
        return res.json({
          ok: true,
          configured: false,
          connected: false,
          calendarName: "",
        });
      }

      const data = await callBridge("status");

      res.json({
        ok: true,
        configured: true,
        connected: Boolean(data.connected),
        calendarName: data.calendarName || "",
        calendarId: data.calendarId || "",
        timeZone: data.timeZone || "",
      });
    } catch (error) {
      res.status(502).json({
        ok: false,
        configured: true,
        connected: false,
        error:
          error.message ||
          "No se pudo contactar con Apps Script.",
      });
    }
  });

  app.get("/api/calendar/google/calendars", async (req, res) => {
    try {
      const data = await callBridge("calendars");

      res.json({
        ok: true,
        calendars: data.calendars || [],
      });
    } catch (error) {
      res.status(502).json({
        ok: false,
        error:
          error.message ||
          "No se pudieron cargar los calendarios.",
      });
    }
  });

  app.post("/api/calendar/google/sync", async (req, res) => {
    try {
      const {
        calendarId = "primary",
        monthStart,
        monthEnd,
        events = [],
      } = req.body || {};

      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(monthStart || "") ||
        !/^\d{4}-\d{2}-\d{2}$/.test(monthEnd || "")
      ) {
        return res.status(400).json({
          ok: false,
          error: "Rango mensual no válido.",
        });
      }

      const data = await callBridge("sync", {
        calendarId,
        monthStart,
        monthEnd,
        events: Array.isArray(events) ? events : [],
      });

      res.json({
        ok: true,
        events: data.events || [],
        stats: data.stats || {
          imported: 0,
          created: 0,
          updated: 0,
        },
      });
    } catch (error) {
      console.error("Google Calendar bridge sync:", error);

      res.status(502).json({
        ok: false,
        error:
          error.message ||
          "No se pudo sincronizar Google Calendar.",
      });
    }
  });

  app.post("/api/calendar/google/delete", async (req, res) => {
    try {
      const {
        calendarId,
        eventId,
      } = req.body || {};

      if (!calendarId || !eventId) {
        return res.status(400).json({
          ok: false,
          error: "Falta calendarId o eventId.",
        });
      }

      const data = await callBridge("delete", {
        calendarId,
        eventId,
      });

      res.json({
        ok: true,
        deleted: Boolean(data.deleted),
      });
    } catch (error) {
      res.status(502).json({
        ok: false,
        error:
          error.message ||
          "No se pudo eliminar el evento de Google.",
      });
    }
  });
}
