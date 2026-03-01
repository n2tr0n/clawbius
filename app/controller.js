const electron = require("electron");
const {on, send, send_sync, msg_box, save_box} = require("./senders");
const doc = require("./document/doc");
const {tools} = require("./document/ui/ui");
const {HourlySaver} = require("./hourly_saver");
const {remove_ice_colors} = require("./libtextmode/libtextmode");
let hourly_saver, backup_folder;
require("./document/ui/canvas");
require("./document/tools/select");
require("./document/tools/brush");
require("./document/tools/shifter");
require("./document/tools/line");
require("./document/tools/rectangle_filled");
require("./document/tools/rectangle_outline");
require("./document/tools/ellipse_filled");
require("./document/tools/ellipse_outline");
require("./document/tools/fill");
require("./document/tools/sample");

doc.on("start_rendering", () => send_sync("show_rendering_modal"));
doc.on("end_rendering", () => send("close_modal"));
doc.on("connecting", () => send_sync("show_connecting_modal"));
doc.on("connected", () => send("close_modal"));
doc.on("unable_to_connect", () => {
    const choice = msg_box("Connect to Server", "Cannot connect to Server", {buttons: ["Retry", "Cancel"], defaultId: 0, cancelId: 1});
    if (choice == 1) send("destroy");
    doc.connect_to_server(doc.connection.server, doc.connection.pass);
});
doc.on("refused", () => {
    msg_box("Connect to Server", "Incorrect password!");
    send("destroy");
});
doc.on("disconnected", () => {
    const choice = msg_box("Disconnected", "You were disconnected from the server.", {buttons: ["Retry", "Cancel"], defaultId: 0, cancelId: 1});
    if (choice == 1) send("destroy");
    doc.connect_to_server(doc.connection.server, doc.connection.pass);
});
doc.on("ready", () => {
    send("ready");
    tools.start(tools.modes.SELECT);
});

async function process_save(method = 'save', destroy_when_done = false, ignore_controlcharacters = false) {
    var ctrl = false;
    doc.data.forEach((block, index) => {
        if (block.code == 9 || block.code == 10 || block.code == 13 || block.code == 26) ctrl = true;
    });
    if (ctrl && ignore_controlcharacters == false) {
        send("show_controlcharacters", {method, destroy_when_done});
    } else {
        switch (method) {
            case "save_as":
                save_as(destroy_when_done);
                break;
            case "save_without_sauce":
                save_without_sauce();
                break;
            default:
                save(destroy_when_done);
                break;
        }
    }
}

function save(destroy_when_done = false, save_without_sauce = false) {
    if (doc.file) {
        doc.edited = false;
        doc.save(save_without_sauce);
        if (destroy_when_done) send("destroy");
    } else {
        save_as(destroy_when_done);
    }
}

function save_as(destroy_when_done = false) {
    const file = save_box(doc.file, "ans", {filters: [{name: "ANSI Art", extensions: ["ans", "asc", "diz", "nfo", "txt"]}, {name: "XBin", extensions: ["xb"]}, {name: "Binary Text", extensions: ["bin"]}]});
    if (file) {
        doc.file = file;
        doc.edited = false;
        save(destroy_when_done);
    }
}

function save_without_sauce() {
    const file = save_box(doc.file, "ans", {filters: [{name: "ANSI Art", extensions: ["ans", "asc", "diz", "nfo", "txt"]}, {name: "XBin", extensions: ["xb"]}, {name: "Binary Text", extensions: ["bin"]}]});
    if (file) {
        doc.file = file;
        doc.edited = false;
        save(false, true);
    }
}

async function share_online() {
    const url = await doc.share_online();
    if (url) electron.shell.openExternal(url);
}

function check_before_closing() {
    const choice = msg_box("Save this document?", "This document contains unsaved changes.", {buttons: ["Save", "Cancel", "Don't Save"], defaultId: 0, cancelId: 1});
    if (choice == 0) {
        save(true);
    } else if (choice == 2) {
        send("destroy");
    }
}

function export_as_utf8() {
    const file = save_box(doc.file, "utf8ans", {filters: [{name: "ANSI Art ", extensions: ["utf8ans"]}]});
    if (file) doc.export_as_utf8(file);
}

function export_as_png() {
    const file = save_box(doc.file, "png", {filters: [{name: "Portable Network Graphics ", extensions: ["png"]}]});
    if (file) doc.export_as_png(file);
}

function export_as_apng() {
    const file = save_box(doc.file, "png", {filters: [{name: "Animated Portable Network Graphics ", extensions: ["png"]}]});
    if (file) doc.export_as_apng(file);
}

function hourly_save() {
    if (doc.connection && !doc.connection.connected) return;
    const file = (doc.connection) ? `${doc.connection.server}.ans` : (doc.file ? doc.file : "Untitled.ans");
    const timestamped_file = hourly_saver.filename(backup_folder, file);
    doc.save_backup(timestamped_file);
    hourly_saver.keep_if_changes(timestamped_file);
}

function use_backup(value) {
    if (value) {
        hourly_saver = new HourlySaver();
        hourly_saver.start();
        hourly_saver.on("save", hourly_save);
    } else if (hourly_saver) {
        hourly_saver.stop();
    }
}

on("new_document", (event, opts) => doc.new_document(opts));
on("revert_to_last_save", (event, opts) => doc.open(doc.file));
on("show_file_in_folder", (event, opts) => electron.shell.showItemInFolder(doc.file));
on("duplicate", (event, opts) => send("new_document", {columns: doc.columns, rows: doc.rows, data: doc.data, palette: doc.palette, font_name: doc.font_name, use_9px_font: doc.use_9px_font, ice_colors: doc.ice_colors}));
on("process_save", (event, {method, destroy_when_done, ignore_controlcharacters}) => process_save(method, destroy_when_done, ignore_controlcharacters));
on("save", (event, opts) => {
    if (doc.connection) {
        process_save('save_as');
    } else {
        process_save('save');
    }
});
on("save_as", (event, opts) => process_save('save_as'));
on("save_without_sauce", (event, opts) => process_save('save_without_sauce'));
on("share_online", (event, opts) => share_online());
on("open_file", (event, file) => doc.open(file));
on("check_before_closing", (event) => check_before_closing());
on("export_as_utf8", (event) => export_as_utf8());
on("export_as_png", (event) => export_as_png());
on("export_as_apng", (event) => export_as_apng());
on("remove_ice_colors", (event) => send("new_document", remove_ice_colors(doc)));
on("connect_to_server", (event, {server, pass}) => doc.connect_to_server(server, pass));
on("backup_folder", (event, folder) => backup_folder = folder);
on("use_backup", (event, value) => use_backup(value));

// ─── LOCAL API BRIDGE ─────────────────────────────────────────────────────────
// Handles api:execute messages from the HTTP API server (main process).
// Methods directly call into the document model and tool system, bypassing UI dialogs.
{
    const {ipcRenderer} = electron;
    const brushes_api = require("./document/tools/brushes");
    const palette_api = require("./document/palette");
    const {toolbar: toolbar_api} = require("./document/ui/ui");

    // Bresenham ellipse outline — returns array of {x, y} points
    function ellipse_outline_coords(cx, cy, rx, ry) {
        const coords = [];
        if (rx <= 0 || ry <= 0) return coords;
        const a2 = rx * rx, b2 = ry * ry;
        const fa2 = 4 * a2, fb2 = 4 * b2;
        let x = 0, y = ry, sigma = 2 * b2 + a2 * (1 - 2 * ry);
        while (b2 * x <= a2 * y) {
            coords.push({x: cx + x, y: cy + y}, {x: cx - x, y: cy + y},
                        {x: cx + x, y: cy - y}, {x: cx - x, y: cy - y});
            if (sigma >= 0) { sigma += fa2 * (1 - y); y--; }
            sigma += b2 * (4 * x + 6);
            x++;
        }
        x = rx; y = 0; sigma = 2 * a2 + b2 * (1 - 2 * rx);
        while (a2 * y <= b2 * x) {
            coords.push({x: cx + x, y: cy + y}, {x: cx - x, y: cy + y},
                        {x: cx + x, y: cy - y}, {x: cx - x, y: cy - y});
            if (sigma >= 0) { sigma += fb2 * (1 - x); x--; }
            sigma += a2 * (4 * y + 6);
            y++;
        }
        return coords;
    }

    const API_METHODS = {

        // ── DRAWING ────────────────────────────────────────────────────────────

        draw_at: ({x, y, code = 219, fg, bg}) => {
            doc.start_undo();
            doc.change_data(x, y, code, fg ?? palette_api.fg, bg ?? palette_api.bg);
            return {x, y};
        },

        draw_line: ({x1, y1, x2, y2, code = 219, fg, bg}) => {
            const f = fg ?? palette_api.fg, b = bg ?? palette_api.bg;
            doc.start_undo();
            const coords = brushes_api.line(x1, y1, x2, y2);
            for (const c of coords) doc.change_data(c.x, c.y, code, f, b);
            return {points: coords.length};
        },

        draw_rect_filled: ({x, y, width, height, code = 219, fg, bg}) => {
            const f = fg ?? palette_api.fg, b = bg ?? palette_api.bg;
            doc.start_undo();
            for (let dy = y; dy < y + height; dy++)
                for (let dx = x; dx < x + width; dx++)
                    doc.change_data(dx, dy, code, f, b);
            return {cells: width * height};
        },

        draw_rect_outline: ({x, y, width, height, code = 219, fg, bg}) => {
            const f = fg ?? palette_api.fg, b = bg ?? palette_api.bg;
            doc.start_undo();
            const edges = [
                ...brushes_api.line(x, y, x + width - 1, y),
                ...brushes_api.line(x, y + height - 1, x + width - 1, y + height - 1),
                ...brushes_api.line(x, y, x, y + height - 1),
                ...brushes_api.line(x + width - 1, y, x + width - 1, y + height - 1)
            ];
            for (const c of edges) doc.change_data(c.x, c.y, code, f, b);
            return {ok: true};
        },

        draw_ellipse_filled: ({cx, cy, rx, ry, fg, bg}) => {
            const f = fg ?? palette_api.fg, b = bg ?? palette_api.bg;
            doc.start_undo();
            // Filled: for each unique y, draw horizontal span from min-x to max-x
            const outline = ellipse_outline_coords(cx, cy, rx, ry);
            const spans = new Map();
            for (const p of outline) {
                if (!spans.has(p.y)) spans.set(p.y, {min: p.x, max: p.x});
                else {
                    const s = spans.get(p.y);
                    if (p.x < s.min) s.min = p.x;
                    if (p.x > s.max) s.max = p.x;
                }
            }
            for (const [row, {min, max}] of spans) {
                for (let dx = min; dx <= max; dx++) doc.change_data(dx, row, 219, f, b);
            }
            return {ok: true};
        },

        draw_ellipse_outline: ({cx, cy, rx, ry, fg, bg}) => {
            const f = fg ?? palette_api.fg, b = bg ?? palette_api.bg;
            doc.start_undo();
            const coords = ellipse_outline_coords(cx, cy, rx, ry);
            for (const c of coords) doc.change_data(c.x, c.y, 219, f, b);
            return {ok: true};
        },

        draw_fill: ({x, y, fg}) => {
            const col = fg ?? palette_api.fg;
            const half_y = y * 2;
            const block = doc.get_half_block(x, half_y);
            if (!block || !block.is_blocky) return {ok: false, reason: "position is not a blocky half-block"};
            const target = block.is_top ? block.upper_block_color : block.lower_block_color;
            if (target === col) return {ok: true, reason: "already same color"};
            doc.start_undo();
            const queue = [{x, y: half_y}];
            const seen = new Set();
            while (queue.length) {
                const coord = queue.pop();
                const key = `${coord.x},${coord.y}`;
                if (seen.has(key)) continue;
                seen.add(key);
                const b = doc.get_half_block(coord.x, coord.y);
                if (!b || !b.is_blocky) continue;
                if ((b.is_top ? b.upper_block_color : b.lower_block_color) !== target) continue;
                doc.set_half_block(coord.x, coord.y, col);
                if (coord.x > 0) queue.push({x: coord.x - 1, y: coord.y});
                if (coord.y > 0) queue.push({x: coord.x, y: coord.y - 1});
                if (coord.x < doc.columns - 1) queue.push({x: coord.x + 1, y: coord.y});
                if (coord.y < doc.rows * 2 - 1) queue.push({x: coord.x, y: coord.y + 1});
            }
            return {ok: true};
        },

        write_text: ({x, y, text, fg, bg}) => {
            const f = fg ?? palette_api.fg, b = bg ?? palette_api.bg;
            doc.start_undo();
            let written = 0;
            for (let i = 0; i < text.length && x + i < doc.columns; i++) {
                doc.change_data(x + i, y, text.charCodeAt(i), f, b);
                written++;
            }
            return {chars_written: written};
        },

        // ── CANVAS QUERIES ─────────────────────────────────────────────────────

        get_info: () => ({
            columns: doc.columns, rows: doc.rows,
            title: doc.title, author: doc.author, group: doc.group,
            font_name: doc.font_name, use_9px_font: doc.use_9px_font,
            ice_colors: doc.ice_colors, file: doc.file ?? null,
            fg: palette_api.fg, bg: palette_api.bg
        }),

        get_data: () => doc.data.map(b => ({code: b.code, fg: b.fg, bg: b.bg})),

        get_block: ({x, y}) => {
            const b = doc.at(x, y);
            return b ? {code: b.code, fg: b.fg, bg: b.bg} : null;
        },

        // ── FILE OPERATIONS ────────────────────────────────────────────────────

        open_file: async ({path: file_path}) => {
            await doc.open(file_path);
            return {ok: true};
        },

        save: async () => {
            await doc.save();
            return {ok: true};
        },

        save_as: async ({path: file_path}) => {
            doc.file = file_path;
            await doc.save();
            return {ok: true, path: file_path};
        },

        new_document: async (opts) => {
            await doc.new_document(opts);
            return {ok: true};
        },

        export_png: ({path: file_path}) => {
            doc.export_as_png(file_path);
            return {ok: true};
        },

        export_utf8: async ({path: file_path}) => {
            await doc.export_as_utf8(file_path);
            return {ok: true};
        },

        export_apng: ({path: file_path}) => {
            doc.export_as_apng(file_path);
            return {ok: true};
        },

        // ── CANVAS OPERATIONS ──────────────────────────────────────────────────

        resize: ({columns, rows}) => {
            doc.resize(columns, rows);
            return {ok: true};
        },

        insert_row: ({y}) => {
            doc.insert_row(y);
            return {ok: true};
        },

        delete_row: ({y}) => {
            doc.delete_row(y);
            return {ok: true};
        },

        insert_column: ({x}) => {
            doc.insert_column(x);
            return {ok: true};
        },

        delete_column: ({x}) => {
            doc.delete_column(x);
            return {ok: true};
        },

        // ── TOOL AND UI ────────────────────────────────────────────────────────

        set_tool: ({tool}) => {
            const map = {
                select: tools.modes.SELECT, brush: tools.modes.BRUSH,
                shifter: tools.modes.SHIFTER, line: tools.modes.LINE,
                rect_outline: tools.modes.RECTANGLE_OUTLINE, rect_filled: tools.modes.RECTANGLE_FILLED,
                ellipse_outline: tools.modes.ELLIPSE_OUTLINE, ellipse_filled: tools.modes.ELLIPSE_FILLED,
                fill: tools.modes.FILL, sample: tools.modes.SAMPLE
            };
            if (!(tool in map)) throw new Error(`Unknown tool: ${tool}. Valid: ${Object.keys(map).join(", ")}`);
            tools.start(map[tool]);
            return {ok: true, tool};
        },

        get_colors: () => ({fg: palette_api.fg, bg: palette_api.bg}),

        set_fg: ({color}) => {
            palette_api.fg = color;
            return {ok: true, fg: color};
        },

        set_bg: ({color}) => {
            palette_api.bg = color;
            return {ok: true, bg: color};
        },

        set_brush_size: ({size}) => {
            const clamped = Math.max(1, Math.min(9, Math.round(size)));
            toolbar_api.reset_brush_size();
            for (let i = 1; i < clamped; i++) toolbar_api.increase_brush_size();
            return {ok: true, size: clamped};
        }
    };

    ipcRenderer.on("api:execute", async (event, {id, method, params}) => {
        try {
            if (!API_METHODS[method]) {
                ipcRenderer.send("api:result", {id, error: {code: "UNKNOWN_METHOD", message: `No API method: ${method}`}});
                return;
            }
            const result = await API_METHODS[method](params ?? {});
            ipcRenderer.send("api:result", {id, result: result ?? null});
        } catch (err) {
            ipcRenderer.send("api:result", {id, error: {code: "ERROR", message: String(err.message ?? err)}});
        }
    });
}
