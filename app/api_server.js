"use strict";
const express = require("express");
const {ipcMain} = require("electron");

const pending = new Map(); // requestId → {resolve, reject, timer}
let get_focused_win;

function start(get_win_fn) {
    get_focused_win = get_win_fn;
    const app = express();
    app.use(express.json());
    register_routes(app);
    app.listen(7777, "127.0.0.1", () => {
        console.log("Clawbius API listening on http://127.0.0.1:7777");
        console.log("  Swagger UI:    http://127.0.0.1:7777/api/docs");
        console.log("  OpenAPI spec:  http://127.0.0.1:7777/api/openapi.json");
    });
}

// Called by moebius.js when api:result arrives from renderer
function handle_result({id, result, error}) {
    const p = pending.get(id);
    if (!p) return;
    clearTimeout(p.timer);
    pending.delete(id);
    error ? p.reject(error) : p.resolve(result);
}

// Async round-trip: send to renderer, await response via api:result
function dispatch(method, params = {}) {
    return new Promise((resolve, reject) => {
        const win = get_focused_win();
        if (!win) return reject({code: "NO_WINDOW", message: "No document window is open"});
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const timer = setTimeout(() => {
            pending.delete(id);
            reject({code: "TIMEOUT", message: "Renderer did not respond within 10s"});
        }, 10000);
        pending.set(id, {resolve, reject, timer});
        win.send("api:execute", {id, method, params});
    });
}

// Route helper: async round-trip dispatch (for ops needing a return value)
function dispatch_route(method) {
    return async (req, res) => {
        try {
            const params = Object.assign({}, req.body, req.query, req.params);
            // Parse numeric query params
            for (const k of ["x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "rx", "ry",
                              "width", "height", "size", "color", "code", "fg", "bg", "columns", "rows"]) {
                if (typeof params[k] === "string") {
                    const n = Number(params[k]);
                    if (!isNaN(n)) params[k] = n;
                }
            }
            if (typeof params.value === "string") {
                if (params.value === "true") params.value = true;
                else if (params.value === "false") params.value = false;
            }
            const result = await dispatch(method, params);
            res.json({ok: true, result: result ?? null});
        } catch (err) {
            res.status(500).json({ok: false, error: err});
        }
    };
}

// Route helper: fire-and-forget (direct win.send, immediate ok response)
function forward_route(channel, value_fn = null) {
    return (req, res) => {
        const win = get_focused_win();
        if (!win) return res.status(500).json({ok: false, error: {code: "NO_WINDOW", message: "No document window is open"}});
        if (value_fn) {
            const params = Object.assign({}, req.body, req.query);
            win.send(channel, value_fn(params));
        } else {
            win.send(channel);
        }
        res.json({ok: true});
    };
}

function register_routes(app) {

    // ─── DRAWING ──────────────────────────────────────────────────────────────

    // POST /api/draw/at - Draw a single character block at position (x, y)
    app.post("/api/draw/at", dispatch_route("draw_at"));

    // POST /api/draw/line - Draw a line from (x1,y1) to (x2,y2)
    app.post("/api/draw/line", dispatch_route("draw_line"));

    // POST /api/draw/rect/filled - Draw a filled rectangle
    app.post("/api/draw/rect/filled", dispatch_route("draw_rect_filled"));

    // POST /api/draw/rect/outline - Draw a rectangle outline
    app.post("/api/draw/rect/outline", dispatch_route("draw_rect_outline"));

    // POST /api/draw/ellipse/filled - Draw a filled ellipse
    app.post("/api/draw/ellipse/filled", dispatch_route("draw_ellipse_filled"));

    // POST /api/draw/ellipse/outline - Draw an ellipse outline
    app.post("/api/draw/ellipse/outline", dispatch_route("draw_ellipse_outline"));

    // POST /api/draw/fill - Flood fill at position (x, y)
    app.post("/api/draw/fill", dispatch_route("draw_fill"));

    // POST /api/draw/text - Write text characters starting at (x, y)
    app.post("/api/draw/text", dispatch_route("write_text"));

    // ─── CANVAS QUERIES ───────────────────────────────────────────────────────

    // GET /api/canvas/info - Get canvas metadata and current state
    app.get("/api/canvas/info", dispatch_route("get_info"));

    // GET /api/canvas/data - Get full canvas as array of {code,fg,bg} blocks
    app.get("/api/canvas/data", dispatch_route("get_data"));

    // GET /api/canvas/block?x=N&y=N - Get single block at (x,y)
    app.get("/api/canvas/block", dispatch_route("get_block"));

    // ─── CANVAS OPERATIONS ────────────────────────────────────────────────────

    // POST /api/canvas/resize - Resize canvas to given dimensions (bypasses modal dialog)
    app.post("/api/canvas/resize", dispatch_route("resize"));

    // POST /api/canvas/undo - Undo last operation
    app.post("/api/canvas/undo", forward_route("undo"));

    // POST /api/canvas/redo - Redo last undone operation
    app.post("/api/canvas/redo", forward_route("redo"));

    // POST /api/canvas/rows/insert - Insert a row at position y (uses cursor position if y omitted)
    app.post("/api/canvas/rows/insert", dispatch_route("insert_row"));

    // POST /api/canvas/rows/delete - Delete a row at position y
    app.post("/api/canvas/rows/delete", dispatch_route("delete_row"));

    // POST /api/canvas/columns/insert - Insert a column at position x
    app.post("/api/canvas/columns/insert", dispatch_route("insert_column"));

    // POST /api/canvas/columns/delete - Delete a column at position x
    app.post("/api/canvas/columns/delete", dispatch_route("delete_column"));

    // POST /api/canvas/scroll/up|down|left|right - Scroll canvas content
    app.post("/api/canvas/scroll/up",    forward_route("scroll_canvas_up"));
    app.post("/api/canvas/scroll/down",  forward_route("scroll_canvas_down"));
    app.post("/api/canvas/scroll/left",  forward_route("scroll_canvas_left"));
    app.post("/api/canvas/scroll/right", forward_route("scroll_canvas_right"));

    // ─── FILE OPERATIONS ──────────────────────────────────────────────────────

    // POST /api/file/open - Open a file by path (bypasses file dialog)
    app.post("/api/file/open", dispatch_route("open_file"));

    // POST /api/file/save - Save current document to its existing path
    app.post("/api/file/save", dispatch_route("save"));

    // POST /api/file/save-as - Save to a specific path (bypasses save dialog)
    app.post("/api/file/save-as", dispatch_route("save_as"));

    // POST /api/file/new - Create a new document (bypasses new document dialog)
    app.post("/api/file/new", dispatch_route("new_document"));

    // POST /api/file/export/png - Export as PNG image
    app.post("/api/file/export/png", dispatch_route("export_png"));

    // POST /api/file/export/utf8 - Export as UTF-8 encoded text
    app.post("/api/file/export/utf8", dispatch_route("export_utf8"));

    // POST /api/file/export/apng - Export as animated PNG
    app.post("/api/file/export/apng", dispatch_route("export_apng"));

    // ─── UI AND TOOL CONTROL ──────────────────────────────────────────────────

    // POST /api/ui/tool - Switch active drawing tool
    app.post("/api/ui/tool", dispatch_route("set_tool"));

    // GET /api/ui/color - Get current foreground and background colors
    app.get("/api/ui/color", dispatch_route("get_colors"));

    // POST /api/ui/color/fg - Set foreground color (0-15)
    app.post("/api/ui/color/fg", dispatch_route("set_fg"));

    // POST /api/ui/color/bg - Set background color (0-15)
    app.post("/api/ui/color/bg", dispatch_route("set_bg"));

    // POST /api/ui/font - Change character font
    app.post("/api/ui/font", forward_route("change_font", p => p.font_name));

    // POST /api/ui/font/9px - Toggle 9px letter spacing
    app.post("/api/ui/font/9px", forward_route("use_9px_font", p => {
        if (typeof p.value === "string") return p.value !== "false";
        return Boolean(p.value);
    }));

    // POST /api/ui/ice-colors - Toggle iCE extended colors mode
    app.post("/api/ui/ice-colors", forward_route("ice_colors", p => {
        if (typeof p.value === "string") return p.value !== "false";
        return Boolean(p.value);
    }));

    // POST /api/ui/zoom/in|out|actual - Zoom controls
    app.post("/api/ui/zoom/in",     forward_route("zoom_in"));
    app.post("/api/ui/zoom/out",    forward_route("zoom_out"));
    app.post("/api/ui/zoom/actual", forward_route("actual_size"));

    // POST /api/ui/brush-size - Set brush size (1-9)
    app.post("/api/ui/brush-size", dispatch_route("set_brush_size"));

    // POST /api/ui/statusbar - Show or hide the status bar
    app.post("/api/ui/statusbar", forward_route("show_statusbar", p => {
        if (typeof p.visible === "string") return p.visible !== "false";
        return Boolean(p.visible);
    }));

    // POST /api/ui/toolbar - Show or hide the toolbar
    app.post("/api/ui/toolbar", forward_route("show_toolbar", p => {
        if (typeof p.visible === "string") return p.visible !== "false";
        return Boolean(p.visible);
    }));

    // POST /api/ui/preview - Show or hide the preview panel
    app.post("/api/ui/preview", forward_route("show_preview", p => {
        if (typeof p.visible === "string") return p.visible !== "false";
        return Boolean(p.visible);
    }));

    // ─── SELECTION OPERATIONS ─────────────────────────────────────────────────

    // POST /api/selection/all - Select entire canvas
    app.post("/api/selection/all",      forward_route("select_all"));

    // POST /api/selection/deselect - Clear the selection
    app.post("/api/selection/deselect", forward_route("deselect"));

    // POST /api/selection/cut - Cut selection to clipboard
    app.post("/api/selection/cut",      forward_route("cut"));

    // POST /api/selection/copy - Copy selection to clipboard
    app.post("/api/selection/copy",     forward_route("copy"));

    // POST /api/selection/paste - Paste clipboard content
    app.post("/api/selection/paste",    forward_route("paste"));

    // POST /api/selection/erase - Erase selected area
    app.post("/api/selection/erase",    forward_route("erase"));

    // POST /api/selection/fill - Fill selected area with current colors
    app.post("/api/selection/fill",     forward_route("fill"));

    // ─── API DOCUMENTATION ────────────────────────────────────────────────────

    // GET /api/openapi.json - Machine-readable OpenAPI 3.0 spec
    app.get("/api/openapi.json", (req, res) => res.json(OPENAPI_SPEC));

    // GET /api/docs - Interactive Swagger UI
    app.get("/api/docs", (req, res) => {
        res.setHeader("Content-Type", "text/html");
        res.send(SWAGGER_HTML);
    });

    // GET / - Redirect to docs
    app.get("/", (req, res) => res.redirect("/api/docs"));
}

// ─── SWAGGER UI HTML ──────────────────────────────────────────────────────────
const SWAGGER_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Clawbius API</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
  <style>body{margin:0}</style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.onload = function() {
      SwaggerUIBundle({
        url: "/api/openapi.json",
        dom_id: "#swagger-ui",
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
        layout: "BaseLayout",
        deepLinking: true
      });
    };
  </script>
</body>
</html>`;

// ─── OPENAPI 3.0 SPECIFICATION ───────────────────────────────────────────────
const OPENAPI_SPEC = {
    openapi: "3.0.3",
    info: {
        title: "Clawbius ANSI Art Editor — Local API",
        version: "1.0.0",
        description: "HTTP REST API for programmatic control of the Clawbius ANSI/ASCII art editor. " +
            "All endpoints are available on localhost only (127.0.0.1:7777). No authentication required. " +
            "The API server starts automatically when Clawbius launches. " +
            "All drawing operations are reflected live in the visible editor canvas.",
        contact: {url: "https://github.com/n2tr0n/clawbius"}
    },
    servers: [{url: "http://127.0.0.1:7777", description: "Local Clawbius instance"}],
    tags: [
        {name: "drawing",   description: "Direct drawing operations on the canvas"},
        {name: "canvas",    description: "Canvas state queries and structural operations"},
        {name: "file",      description: "File and document management"},
        {name: "ui",        description: "Tool selection, color, font, and view controls"},
        {name: "selection", description: "Selection and clipboard operations"},
        {name: "docs",      description: "API documentation endpoints"}
    ],
    components: {
        schemas: {
            OkResponse: {
                type: "object",
                properties: {
                    ok: {type: "boolean", example: true},
                    result: {nullable: true}
                }
            },
            ErrorResponse: {
                type: "object",
                properties: {
                    ok: {type: "boolean", example: false},
                    error: {
                        type: "object",
                        properties: {
                            code: {type: "string", example: "NO_WINDOW"},
                            message: {type: "string"}
                        }
                    }
                }
            },
            Block: {
                type: "object",
                description: "A single ANSI character block",
                properties: {
                    code: {type: "integer", minimum: 0, maximum: 255,
                           description: "CP437 character code. 219=full block █, 32=space, 176-178=shading"},
                    fg:   {type: "integer", minimum: 0, maximum: 15,
                           description: "Foreground color index (0=black,1=dark blue,2=dark green,3=cyan,4=red,5=magenta,6=brown,7=light gray,8=dark gray,9=blue,10=green,11=cyan,12=red,13=magenta,14=yellow,15=white)"},
                    bg:   {type: "integer", minimum: 0, maximum: 15,
                           description: "Background color index (same palette as fg)"}
                }
            },
            CanvasInfo: {
                type: "object",
                properties: {
                    columns: {type: "integer", description: "Canvas width in characters"},
                    rows:    {type: "integer", description: "Canvas height in characters"},
                    title:   {type: "string"},
                    author:  {type: "string"},
                    group:   {type: "string"},
                    font_name: {type: "string", description: "Active font name e.g. 'IBM VGA'"},
                    use_9px_font: {type: "boolean"},
                    ice_colors:  {type: "boolean"},
                    file:    {type: "string", nullable: true, description: "Current file path or null if unsaved"},
                    fg:      {type: "integer", minimum: 0, maximum: 15, description: "Current foreground color"},
                    bg:      {type: "integer", minimum: 0, maximum: 15, description: "Current background color"}
                }
            }
        }
    },
    paths: {

        // ── DRAWING ────────────────────────────────────────────────────────────

        "/api/draw/at": {
            post: {
                tags: ["drawing"],
                summary: "Draw a single character block at a position",
                description: "Places a character with specified colors at position (x, y). " +
                    "Coordinates are 0-based column/row. If fg/bg are omitted, current palette colors are used. " +
                    "The change is immediately visible in the editor and is undoable.",
                requestBody: {required: true, content: {"application/json": {schema: {
                    type: "object",
                    required: ["x", "y"],
                    properties: {
                        x:    {type: "integer", minimum: 0, description: "Column (0-based)"},
                        y:    {type: "integer", minimum: 0, description: "Row (0-based)"},
                        code: {type: "integer", minimum: 0, maximum: 255, default: 219,
                               description: "CP437 character code. 219=█ (solid block), 32=space"},
                        fg:   {type: "integer", minimum: 0, maximum: 15, description: "Foreground color (uses current if omitted)"},
                        bg:   {type: "integer", minimum: 0, maximum: 15, description: "Background color (uses current if omitted)"}
                    },
                    example: {x: 10, y: 5, code: 219, fg: 14, bg: 0}
                }}}},
                responses: {
                    "200": {description: "Block drawn", content: {"application/json": {schema: {$ref: "#/components/schemas/OkResponse"}}}},
                    "500": {description: "Error", content: {"application/json": {schema: {$ref: "#/components/schemas/ErrorResponse"}}}}
                }
            }
        },

        "/api/draw/line": {
            post: {
                tags: ["drawing"],
                summary: "Draw a straight line between two points",
                description: "Draws a Bresenham line from (x1,y1) to (x2,y2) using the specified character and colors.",
                requestBody: {required: true, content: {"application/json": {schema: {
                    type: "object",
                    required: ["x1", "y1", "x2", "y2"],
                    properties: {
                        x1: {type: "integer", minimum: 0}, y1: {type: "integer", minimum: 0},
                        x2: {type: "integer", minimum: 0}, y2: {type: "integer", minimum: 0},
                        code: {type: "integer", minimum: 0, maximum: 255, default: 219},
                        fg: {type: "integer", minimum: 0, maximum: 15},
                        bg: {type: "integer", minimum: 0, maximum: 15}
                    },
                    example: {x1: 0, y1: 0, x2: 20, y2: 10, code: 219, fg: 11, bg: 0}
                }}}},
                responses: {
                    "200": {description: "Line drawn", content: {"application/json": {schema: {$ref: "#/components/schemas/OkResponse"}}}},
                    "500": {description: "Error", content: {"application/json": {schema: {$ref: "#/components/schemas/ErrorResponse"}}}}
                }
            }
        },

        "/api/draw/rect/filled": {
            post: {
                tags: ["drawing"],
                summary: "Draw a filled rectangle",
                requestBody: {required: true, content: {"application/json": {schema: {
                    type: "object", required: ["x","y","width","height"],
                    properties: {
                        x: {type: "integer"}, y: {type: "integer"},
                        width: {type: "integer", minimum: 1}, height: {type: "integer", minimum: 1},
                        code: {type: "integer", default: 219}, fg: {type: "integer"}, bg: {type: "integer"}
                    },
                    example: {x: 5, y: 5, width: 20, height: 10, code: 219, fg: 2, bg: 0}
                }}}},
                responses: {"200": {description: "Rectangle drawn", content: {"application/json": {schema: {$ref: "#/components/schemas/OkResponse"}}}}}
            }
        },

        "/api/draw/rect/outline": {
            post: {
                tags: ["drawing"],
                summary: "Draw a rectangle outline",
                requestBody: {required: true, content: {"application/json": {schema: {
                    type: "object", required: ["x","y","width","height"],
                    properties: {
                        x: {type: "integer"}, y: {type: "integer"},
                        width: {type: "integer", minimum: 1}, height: {type: "integer", minimum: 1},
                        code: {type: "integer", default: 219}, fg: {type: "integer"}, bg: {type: "integer"}
                    }
                }}}},
                responses: {"200": {description: "Outline drawn", content: {"application/json": {schema: {$ref: "#/components/schemas/OkResponse"}}}}}
            }
        },

        "/api/draw/ellipse/filled": {
            post: {
                tags: ["drawing"],
                summary: "Draw a filled ellipse",
                requestBody: {required: true, content: {"application/json": {schema: {
                    type: "object", required: ["cx","cy","rx","ry"],
                    properties: {
                        cx: {type: "integer", description: "Center x"},
                        cy: {type: "integer", description: "Center y"},
                        rx: {type: "integer", minimum: 1, description: "X radius"},
                        ry: {type: "integer", minimum: 1, description: "Y radius"},
                        fg: {type: "integer"}, bg: {type: "integer"}
                    },
                    example: {cx: 40, cy: 12, rx: 10, ry: 5, fg: 4, bg: 0}
                }}}},
                responses: {"200": {description: "Ellipse drawn", content: {"application/json": {schema: {$ref: "#/components/schemas/OkResponse"}}}}}
            }
        },

        "/api/draw/ellipse/outline": {
            post: {
                tags: ["drawing"],
                summary: "Draw an ellipse outline",
                requestBody: {required: true, content: {"application/json": {schema: {
                    type: "object", required: ["cx","cy","rx","ry"],
                    properties: {
                        cx: {type: "integer"}, cy: {type: "integer"},
                        rx: {type: "integer", minimum: 1}, ry: {type: "integer", minimum: 1},
                        fg: {type: "integer"}, bg: {type: "integer"}
                    }
                }}}},
                responses: {"200": {description: "Ellipse outline drawn", content: {"application/json": {schema: {$ref: "#/components/schemas/OkResponse"}}}}}
            }
        },

        "/api/draw/fill": {
            post: {
                tags: ["drawing"],
                summary: "Flood fill at position (x, y)",
                description: "Fills contiguous area of the same color with the specified foreground color.",
                requestBody: {required: true, content: {"application/json": {schema: {
                    type: "object", required: ["x","y"],
                    properties: {
                        x: {type: "integer"}, y: {type: "integer"},
                        fg: {type: "integer", description: "Fill color (uses current fg if omitted)"}
                    },
                    example: {x: 20, y: 10, fg: 4}
                }}}},
                responses: {"200": {description: "Fill applied", content: {"application/json": {schema: {$ref: "#/components/schemas/OkResponse"}}}}}
            }
        },

        "/api/draw/text": {
            post: {
                tags: ["drawing"],
                summary: "Write text characters starting at position (x, y)",
                description: "Places ASCII text starting at the given position. " +
                    "Uses CP437 character codes. Characters that exceed canvas width are clipped.",
                requestBody: {required: true, content: {"application/json": {schema: {
                    type: "object", required: ["x","y","text"],
                    properties: {
                        x:    {type: "integer", minimum: 0},
                        y:    {type: "integer", minimum: 0},
                        text: {type: "string", description: "Text to write (ASCII/CP437 characters)"},
                        fg:   {type: "integer", minimum: 0, maximum: 15},
                        bg:   {type: "integer", minimum: 0, maximum: 15}
                    },
                    example: {x: 0, y: 0, text: "Hello World", fg: 15, bg: 1}
                }}}},
                responses: {"200": {description: "Text written", content: {"application/json": {schema: {$ref: "#/components/schemas/OkResponse"}}}}}
            }
        },

        // ── CANVAS QUERIES ─────────────────────────────────────────────────────

        "/api/canvas/info": {
            get: {
                tags: ["canvas"],
                summary: "Get canvas metadata and current state",
                description: "Returns dimensions, document metadata, active font, current colors, and file path.",
                responses: {
                    "200": {
                        description: "Canvas info",
                        content: {"application/json": {schema: {
                            type: "object",
                            properties: {
                                ok: {type: "boolean"},
                                result: {$ref: "#/components/schemas/CanvasInfo"}
                            }
                        }}}
                    }
                }
            }
        },

        "/api/canvas/data": {
            get: {
                tags: ["canvas"],
                summary: "Get full canvas as array of blocks",
                description: "Returns all blocks in row-major order (left-to-right, top-to-bottom). " +
                    "Array length = columns × rows. Index = y * columns + x.",
                responses: {
                    "200": {
                        description: "Canvas data",
                        content: {"application/json": {schema: {
                            type: "object",
                            properties: {
                                ok: {type: "boolean"},
                                result: {type: "array", items: {$ref: "#/components/schemas/Block"}}
                            }
                        }}}
                    }
                }
            }
        },

        "/api/canvas/block": {
            get: {
                tags: ["canvas"],
                summary: "Get a single block at (x, y)",
                parameters: [
                    {name: "x", in: "query", required: true, schema: {type: "integer"}, description: "Column (0-based)"},
                    {name: "y", in: "query", required: true, schema: {type: "integer"}, description: "Row (0-based)"}
                ],
                responses: {
                    "200": {
                        description: "Block data",
                        content: {"application/json": {schema: {
                            type: "object",
                            properties: {ok: {type: "boolean"}, result: {$ref: "#/components/schemas/Block"}}
                        }}}
                    }
                }
            }
        },

        "/api/canvas/resize": {
            post: {
                tags: ["canvas"],
                summary: "Resize the canvas",
                description: "Changes canvas dimensions. Bypasses the resize dialog. Operation is undoable.",
                requestBody: {required: true, content: {"application/json": {schema: {
                    type: "object", required: ["columns","rows"],
                    properties: {
                        columns: {type: "integer", minimum: 1, maximum: 2000},
                        rows:    {type: "integer", minimum: 1, maximum: 3000}
                    },
                    example: {columns: 80, rows: 25}
                }}}},
                responses: {"200": {description: "Canvas resized", content: {"application/json": {schema: {$ref: "#/components/schemas/OkResponse"}}}}}
            }
        },

        "/api/canvas/undo": {
            post: {
                tags: ["canvas"], summary: "Undo last operation",
                responses: {"200": {description: "Undone", content: {"application/json": {schema: {$ref: "#/components/schemas/OkResponse"}}}}}
            }
        },

        "/api/canvas/redo": {
            post: {
                tags: ["canvas"], summary: "Redo last undone operation",
                responses: {"200": {description: "Redone", content: {"application/json": {schema: {$ref: "#/components/schemas/OkResponse"}}}}}
            }
        },

        "/api/canvas/rows/insert": {
            post: {
                tags: ["canvas"], summary: "Insert a row at position y",
                requestBody: {required: true, content: {"application/json": {schema: {
                    type: "object", required: ["y"],
                    properties: {y: {type: "integer", description: "Row index to insert before"}}
                }}}},
                responses: {"200": {description: "Row inserted", content: {"application/json": {schema: {$ref: "#/components/schemas/OkResponse"}}}}}
            }
        },

        "/api/canvas/rows/delete": {
            post: {
                tags: ["canvas"], summary: "Delete a row at position y",
                requestBody: {required: true, content: {"application/json": {schema: {
                    type: "object", required: ["y"],
                    properties: {y: {type: "integer"}}
                }}}},
                responses: {"200": {description: "Row deleted", content: {"application/json": {schema: {$ref: "#/components/schemas/OkResponse"}}}}}
            }
        },

        "/api/canvas/columns/insert": {
            post: {
                tags: ["canvas"], summary: "Insert a column at position x",
                requestBody: {required: true, content: {"application/json": {schema: {
                    type: "object", required: ["x"],
                    properties: {x: {type: "integer"}}
                }}}},
                responses: {"200": {description: "Column inserted", content: {"application/json": {schema: {$ref: "#/components/schemas/OkResponse"}}}}}
            }
        },

        "/api/canvas/columns/delete": {
            post: {
                tags: ["canvas"], summary: "Delete a column at position x",
                requestBody: {required: true, content: {"application/json": {schema: {
                    type: "object", required: ["x"],
                    properties: {x: {type: "integer"}}
                }}}},
                responses: {"200": {description: "Column deleted", content: {"application/json": {schema: {$ref: "#/components/schemas/OkResponse"}}}}}
            }
        },

        "/api/canvas/scroll/up":    {post: {tags: ["canvas"], summary: "Scroll canvas content up",    responses: {"200": {description: "Scrolled"}}}},
        "/api/canvas/scroll/down":  {post: {tags: ["canvas"], summary: "Scroll canvas content down",  responses: {"200": {description: "Scrolled"}}}},
        "/api/canvas/scroll/left":  {post: {tags: ["canvas"], summary: "Scroll canvas content left",  responses: {"200": {description: "Scrolled"}}}},
        "/api/canvas/scroll/right": {post: {tags: ["canvas"], summary: "Scroll canvas content right", responses: {"200": {description: "Scrolled"}}}},

        // ── FILE OPERATIONS ────────────────────────────────────────────────────

        "/api/file/open": {
            post: {
                tags: ["file"],
                summary: "Open a file by path",
                description: "Loads the specified file into the current editor window. Bypasses the file dialog.",
                requestBody: {required: true, content: {"application/json": {schema: {
                    type: "object", required: ["path"],
                    properties: {path: {type: "string", description: "Absolute path to .ans, .xb, .bin, .diz, .asc, .txt, or .nfo file"}},
                    example: {path: "C:\\Users\\user\\Desktop\\myart.ans"}
                }}}},
                responses: {"200": {description: "File opened", content: {"application/json": {schema: {$ref: "#/components/schemas/OkResponse"}}}}}
            }
        },

        "/api/file/save": {
            post: {
                tags: ["file"], summary: "Save current document",
                description: "Saves to the current file path. No-op if the document has never been saved.",
                responses: {"200": {description: "Saved", content: {"application/json": {schema: {$ref: "#/components/schemas/OkResponse"}}}}}
            }
        },

        "/api/file/save-as": {
            post: {
                tags: ["file"], summary: "Save document to a specific path",
                description: "Saves to the given path. Bypasses the save dialog. Updates the window title.",
                requestBody: {required: true, content: {"application/json": {schema: {
                    type: "object", required: ["path"],
                    properties: {path: {type: "string", description: "Target file path"}},
                    example: {path: "C:\\Users\\user\\Desktop\\output.ans"}
                }}}},
                responses: {"200": {description: "Saved", content: {"application/json": {schema: {$ref: "#/components/schemas/OkResponse"}}}}}
            }
        },

        "/api/file/new": {
            post: {
                tags: ["file"], summary: "Create a new document",
                description: "Opens a new blank canvas. Bypasses the new document dialog.",
                requestBody: {required: false, content: {"application/json": {schema: {
                    type: "object",
                    properties: {
                        columns: {type: "integer", default: 80},
                        rows:    {type: "integer", default: 300},
                        title:   {type: "string"},
                        author:  {type: "string"},
                        group:   {type: "string"},
                        font_name:    {type: "string", description: "Font name e.g. 'IBM VGA'"},
                        use_9px_font: {type: "boolean"},
                        ice_colors:   {type: "boolean"}
                    },
                    example: {columns: 80, rows: 25, title: "My Art", author: "Artist", font_name: "IBM VGA"}
                }}}},
                responses: {"200": {description: "Document created", content: {"application/json": {schema: {$ref: "#/components/schemas/OkResponse"}}}}}
            }
        },

        "/api/file/export/png": {
            post: {
                tags: ["file"], summary: "Export canvas as PNG image",
                requestBody: {required: true, content: {"application/json": {schema: {
                    type: "object", required: ["path"],
                    properties: {path: {type: "string"}},
                    example: {path: "C:\\Users\\user\\Desktop\\output.png"}
                }}}},
                responses: {"200": {description: "Exported", content: {"application/json": {schema: {$ref: "#/components/schemas/OkResponse"}}}}}
            }
        },

        "/api/file/export/utf8": {
            post: {
                tags: ["file"], summary: "Export canvas as UTF-8 encoded text file",
                requestBody: {required: true, content: {"application/json": {schema: {
                    type: "object", required: ["path"],
                    properties: {path: {type: "string"}},
                    example: {path: "C:\\Users\\user\\Desktop\\output.utf8ans"}
                }}}},
                responses: {"200": {description: "Exported", content: {"application/json": {schema: {$ref: "#/components/schemas/OkResponse"}}}}}
            }
        },

        "/api/file/export/apng": {
            post: {
                tags: ["file"], summary: "Export canvas as animated PNG (blink animation)",
                requestBody: {required: true, content: {"application/json": {schema: {
                    type: "object", required: ["path"],
                    properties: {path: {type: "string"}}
                }}}},
                responses: {"200": {description: "Exported", content: {"application/json": {schema: {$ref: "#/components/schemas/OkResponse"}}}}}
            }
        },

        // ── UI AND TOOL CONTROL ────────────────────────────────────────────────

        "/api/ui/tool": {
            post: {
                tags: ["ui"],
                summary: "Switch the active drawing tool",
                description: "Changes the active tool. The toolbar reflects the change immediately.",
                requestBody: {required: true, content: {"application/json": {schema: {
                    type: "object", required: ["tool"],
                    properties: {
                        tool: {
                            type: "string",
                            enum: ["select","brush","shifter","line","rect_outline","rect_filled","ellipse_outline","ellipse_filled","fill","sample"],
                            description: "select=keyboard/text mode, brush=freehand, shifter=attribute edit, line=straight line, rect_outline/rect_filled=rectangle, ellipse_outline/ellipse_filled=ellipse, fill=flood fill, sample=color picker"
                        }
                    },
                    example: {tool: "brush"}
                }}}},
                responses: {"200": {description: "Tool switched", content: {"application/json": {schema: {$ref: "#/components/schemas/OkResponse"}}}}}
            }
        },

        "/api/ui/color": {
            get: {
                tags: ["ui"], summary: "Get current foreground and background colors",
                responses: {
                    "200": {description: "Current colors", content: {"application/json": {schema: {
                        type: "object",
                        properties: {
                            ok: {type: "boolean"},
                            result: {type: "object", properties: {
                                fg: {type: "integer", minimum: 0, maximum: 15},
                                bg: {type: "integer", minimum: 0, maximum: 15}
                            }}
                        }
                    }}}}
                }
            }
        },

        "/api/ui/color/fg": {
            post: {
                tags: ["ui"], summary: "Set foreground color",
                requestBody: {required: true, content: {"application/json": {schema: {
                    type: "object", required: ["color"],
                    properties: {color: {type: "integer", minimum: 0, maximum: 15}},
                    example: {color: 14}
                }}}},
                responses: {"200": {description: "Color set", content: {"application/json": {schema: {$ref: "#/components/schemas/OkResponse"}}}}}
            }
        },

        "/api/ui/color/bg": {
            post: {
                tags: ["ui"], summary: "Set background color",
                requestBody: {required: true, content: {"application/json": {schema: {
                    type: "object", required: ["color"],
                    properties: {color: {type: "integer", minimum: 0, maximum: 15}},
                    example: {color: 0}
                }}}},
                responses: {"200": {description: "Color set", content: {"application/json": {schema: {$ref: "#/components/schemas/OkResponse"}}}}}
            }
        },

        "/api/ui/font": {
            post: {
                tags: ["ui"], summary: "Change the character font",
                description: "Available fonts include: 'IBM VGA', 'IBM VGA 9px', 'IBM EGA', 'IBM VGA50', " +
                    "'Amiga Topaz 1+', 'Amiga P0T-NOoDLE', 'Amiga MicroKnight', 'Amiga mOsOul', " +
                    "and many codepage variants (IBM VGA CP437, CP850, etc.)",
                requestBody: {required: true, content: {"application/json": {schema: {
                    type: "object", required: ["font_name"],
                    properties: {font_name: {type: "string"}},
                    example: {font_name: "IBM VGA"}
                }}}},
                responses: {"200": {description: "Font changed", content: {"application/json": {schema: {$ref: "#/components/schemas/OkResponse"}}}}}
            }
        },

        "/api/ui/font/9px": {
            post: {
                tags: ["ui"], summary: "Toggle 9-pixel letter spacing",
                description: "Enables or disables 9px inter-character spacing (classic IBM VGA look).",
                requestBody: {required: true, content: {"application/json": {schema: {
                    type: "object", required: ["value"],
                    properties: {value: {type: "boolean"}},
                    example: {value: true}
                }}}},
                responses: {"200": {description: "Toggled", content: {"application/json": {schema: {$ref: "#/components/schemas/OkResponse"}}}}}
            }
        },

        "/api/ui/ice-colors": {
            post: {
                tags: ["ui"], summary: "Toggle iCE extended colors mode",
                description: "iCE colors use the blink attribute bit to extend the background palette from 8 to 16 colors.",
                requestBody: {required: true, content: {"application/json": {schema: {
                    type: "object", required: ["value"],
                    properties: {value: {type: "boolean"}},
                    example: {value: true}
                }}}},
                responses: {"200": {description: "Toggled", content: {"application/json": {schema: {$ref: "#/components/schemas/OkResponse"}}}}}
            }
        },

        "/api/ui/zoom/in":     {post: {tags: ["ui"], summary: "Zoom in (increase zoom by 10%)", responses: {"200": {description: "Zoomed in"}}}},
        "/api/ui/zoom/out":    {post: {tags: ["ui"], summary: "Zoom out (decrease zoom by 10%)", responses: {"200": {description: "Zoomed out"}}}},
        "/api/ui/zoom/actual": {post: {tags: ["ui"], summary: "Reset zoom to 100%", responses: {"200": {description: "Zoom reset"}}}},

        "/api/ui/brush-size": {
            post: {
                tags: ["ui"], summary: "Set brush size (1-9)",
                requestBody: {required: true, content: {"application/json": {schema: {
                    type: "object", required: ["size"],
                    properties: {size: {type: "integer", minimum: 1, maximum: 9}},
                    example: {size: 3}
                }}}},
                responses: {"200": {description: "Brush size set", content: {"application/json": {schema: {$ref: "#/components/schemas/OkResponse"}}}}}
            }
        },

        "/api/ui/statusbar": {
            post: {
                tags: ["ui"], summary: "Show or hide the status bar",
                requestBody: {required: true, content: {"application/json": {schema: {
                    type: "object", required: ["visible"],
                    properties: {visible: {type: "boolean"}},
                    example: {visible: true}
                }}}},
                responses: {"200": {description: "Updated"}}
            }
        },

        "/api/ui/toolbar": {
            post: {
                tags: ["ui"], summary: "Show or hide the toolbar",
                requestBody: {required: true, content: {"application/json": {schema: {
                    type: "object", required: ["visible"],
                    properties: {visible: {type: "boolean"}},
                    example: {visible: true}
                }}}},
                responses: {"200": {description: "Updated"}}
            }
        },

        "/api/ui/preview": {
            post: {
                tags: ["ui"], summary: "Show or hide the preview panel",
                requestBody: {required: true, content: {"application/json": {schema: {
                    type: "object", required: ["visible"],
                    properties: {visible: {type: "boolean"}},
                    example: {visible: true}
                }}}},
                responses: {"200": {description: "Updated"}}
            }
        },

        // ── SELECTION OPERATIONS ───────────────────────────────────────────────

        "/api/selection/all":      {post: {tags: ["selection"], summary: "Select entire canvas",          responses: {"200": {description: "Selected"}}}},
        "/api/selection/deselect": {post: {tags: ["selection"], summary: "Clear the current selection",   responses: {"200": {description: "Deselected"}}}},
        "/api/selection/cut":      {post: {tags: ["selection"], summary: "Cut selection to clipboard",    responses: {"200": {description: "Cut"}}}},
        "/api/selection/copy":     {post: {tags: ["selection"], summary: "Copy selection to clipboard",   responses: {"200": {description: "Copied"}}}},
        "/api/selection/paste":    {post: {tags: ["selection"], summary: "Paste clipboard into canvas",   responses: {"200": {description: "Pasted"}}}},
        "/api/selection/erase":    {post: {tags: ["selection"], summary: "Erase selected area",           responses: {"200": {description: "Erased"}}}},
        "/api/selection/fill":     {post: {tags: ["selection"], summary: "Fill selected area with current colors", responses: {"200": {description: "Filled"}}}},

        // ── API DOCUMENTATION ──────────────────────────────────────────────────

        "/api/openapi.json": {
            get: {
                tags: ["docs"], summary: "OpenAPI 3.0 specification (machine-readable)",
                responses: {"200": {description: "OpenAPI JSON spec"}}
            }
        },

        "/api/docs": {
            get: {
                tags: ["docs"], summary: "Interactive Swagger UI documentation",
                responses: {"200": {description: "Swagger UI HTML page"}}
            }
        }
    }
};

module.exports = {start, handle_result};
