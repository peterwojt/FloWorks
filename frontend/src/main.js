
import * as THREE from '../node_modules/three/build/three.module.js';

const canvas = document.getElementById('glcanvas');
const gl = canvas.getContext('webgl', { antialias: false });
if (!gl) { alert('WebGL not supported'); throw new Error('no webgl'); }

const gridCanvas = document.getElementById('gridcanvas');
const gctx = gridCanvas.getContext('2d');

const clock = new THREE.Clock();

const extFloat = gl.getExtension('OES_texture_float');
if (!extFloat) console.warn('OES_texture_float not available – using UNSIGNED_BYTE fallback');

const SIM_SCALE = 0.4;
let simW, simH;

const CELL_SIZE = 16;
let gridCols = 0, gridRows = 0;
let grid = null;

const REMOTE_TRAIL_TTL = 2.5;
const localClientId = (crypto && crypto.randomUUID) ? crypto.randomUUID() : `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
let trailVisibility = localStorage.getItem('trailVisibility') || 'all';
const remoteCursors = new Map();

const FREQ = 3.0;
const PERIOD = 1.0 / FREQ;
const WAVELENGTH = 120;
let waveMode = 'inward';
let dampingB = 1.0;
let phaseM = 1.0;
let decayRate = 1.0;

function makeGrid(w, h) {
    gridCols = Math.max(1, Math.ceil(w / CELL_SIZE));
    gridRows = Math.max(1, Math.ceil(h / CELL_SIZE));
    grid = new Array(gridCols);
    for (let i = 0; i < gridCols; ++i) {
        grid[i] = new Array(gridRows);
        for (let j = 0; j < gridRows; ++j) {
            grid[i][j] = { triggeredAt: null, phase: 0 };
        }
    }
}

function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    gridCanvas.width = window.innerWidth;
    gridCanvas.height = window.innerHeight;
    const oldSimW = simW, oldSimH = simH;
    simW = Math.max(1, Math.floor(canvas.width  * SIM_SCALE));
    simH = Math.max(1, Math.floor(canvas.height * SIM_SCALE));
    gl.viewport(0, 0, canvas.width, canvas.height);
    if (!fbos || oldSimW !== simW || oldSimH !== simH) initFBOs();

    makeGrid(gridCanvas.width, gridCanvas.height);
}
window.addEventListener('resize', resize);

const modeSelect = document.getElementById('waveMode');
const dampingInput = document.getElementById('dampingB');
const phaseInput = document.getElementById('phaseM');
const decayInput = document.getElementById('decayRate');
const dampingValue = document.getElementById('b-value');
const phaseValue = document.getElementById('m-value');
const decayValue = document.getElementById('decay-value');
const trailSelect = document.getElementById('trailVisibility');
const statusDiv = document.getElementById('status');

modeSelect.addEventListener('change', () => {
    waveMode = modeSelect.value;
});
dampingInput.addEventListener('input', () => {
    dampingB = parseFloat(dampingInput.value);
    dampingValue.textContent = dampingB.toFixed(1);
});
phaseInput.addEventListener('input', () => {
    phaseM = parseFloat(phaseInput.value);
    phaseValue.textContent = phaseM.toFixed(1);
});
decayInput.addEventListener('input', () => {
    decayRate = parseFloat(decayInput.value);
    decayValue.textContent = decayRate.toFixed(1);
});

trailSelect.addEventListener('change', () => {
    trailVisibility = trailSelect.value;
    localStorage.setItem('trailVisibility', trailVisibility);
});

trailSelect.value = trailVisibility;

function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        throw new Error(gl.getShaderInfoLog(s));
    return s;
}

function link(vertSrc, fragSrc) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER,   vertSrc));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fragSrc));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS))
        throw new Error(gl.getProgramInfoLog(p));
    return p;
}

function src(id) { return document.getElementById(id).textContent; }

const quadBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
gl.bufferData(gl.ARRAY_BUFFER,
    new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);

function bindQuad(program) {
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    const loc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
}

const paintProg   = link(src('vert-shader'), src('paint-frag'));
const waveProg    = link(src('vert-shader'), src('wave-frag'));
const displayProg = link(src('vert-shader'), src('display-frag'));

const U = {
    paint: {
        resolution : gl.getUniformLocation(paintProg,   'u_resolution'),
        mouse      : gl.getUniformLocation(paintProg,   'u_mouse'),
        velocity   : gl.getUniformLocation(paintProg,   'u_velocity'),
        velocity_dir : gl.getUniformLocation(paintProg,   'u_velocity_dir'),
        prev       : gl.getUniformLocation(paintProg,   'u_prev'),
    },
    wave: {
        prev       : gl.getUniformLocation(waveProg,    'u_prev'),
        curr       : gl.getUniformLocation(waveProg,    'u_curr'),
        resolution : gl.getUniformLocation(waveProg,    'u_resolution'),
        dt         : gl.getUniformLocation(waveProg,    'u_dt'),
    },
    display: {
        wave       : gl.getUniformLocation(displayProg, 'u_wave'),
        resolution : gl.getUniformLocation(displayProg, 'u_resolution'),
        time       : gl.getUniformLocation(displayProg, 'u_time'),
        mouse      : gl.getUniformLocation(displayProg, 'u_mouse'),
        velocity   : gl.getUniformLocation(displayProg, 'u_velocity'),
    },
};

function makeTexture(w, h) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const type = extFloat ? gl.FLOAT : gl.UNSIGNED_BYTE;
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, type, null);
    return tex;
}

function makeFBO(w, h) {
    const tex = makeTexture(w, h);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
                            gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fbo, tex, w, h };
}

let fbos = null;
function initFBOs() {
    fbos = [makeFBO(simW, simH), makeFBO(simW, simH), makeFBO(simW, simH)];
}

let mouseNDC  = { x: 0.0, y: 0.0 };
let prevMouse = { x: 0.0, y: 0.0 };
let velocity  = 0.0;
let velocityDir = { x: 1.0, y: 0.0 };
window.mouseNDC = mouseNDC;
window.frameVelocity = 0;

const wsUrl = `ws://${window.location.hostname}:8080/update_cursor_position`;
const socket = new WebSocket(wsUrl);
let socketReady = false;

socket.addEventListener('open', () => {
    console.log('WebSocket connected to', wsUrl);
    socketReady = true;
    if (statusDiv) {
        statusDiv.textContent = 'Connected to server';
        statusDiv.style.color = '#82ffa1';
    }
});

socket.addEventListener('message', event => {
    try {
        const data = JSON.parse(event.data);
        if (data.clientId === localClientId) return;
        if (typeof data.x_pos !== 'number' || typeof data.y_pos !== 'number') return;

        const now = performance.now() / 1000;
        const entry = remoteCursors.get(data.clientId) || {};
        entry.x = data.x_pos;
        entry.y = data.y_pos;
        entry.updatedAt = now;
        entry.vx = typeof data.x_vector === 'number' ? data.x_vector : 0;
        entry.vy = typeof data.y_vector === 'number' ? data.y_vector : 0;
        remoteCursors.set(data.clientId, entry);

        if (trailVisibility === 'all') {
            stampVelocityToGrid(data.x_pos, data.y_pos, entry.vx, entry.vy);
        }
    } catch (err) {
        console.error('Invalid websocket payload', err);
    }
});

socket.addEventListener('close', () => {
    console.warn('WebSocket disconnected');
    socketReady = false;
    if (statusDiv) {
        statusDiv.textContent = 'Disconnected from server';
        statusDiv.style.color = '#ff8b8b';
    }
});

socket.addEventListener('error', () => {
    if (statusDiv) {
        statusDiv.textContent = 'WebSocket error';
        statusDiv.style.color = '#ff8b8b';
    }
});

function sendCursorUpdate(clientX, clientY, vx, vy) {
    if (socketReady && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            clientId: localClientId,
            x_pos: clientX,
            y_pos: clientY,
            x_vector: vx,
            y_vector: vy
        }));
    }
}

let prevMousePixel = { x: 0, y: 0 };
let prevMouseTime = performance.now() / 1000.0;
let hasPrevMousePixel = false;

function updateMouse(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const nx =  ((clientX - rect.left) / canvas.width)  * 2 - 1;
    const ny = -((clientY - rect.top)  / canvas.height) * 2 + 1;
    const dx = nx - mouseNDC.x;
    const dy = ny - mouseNDC.y;
    velocity   = Math.hypot(dx, dy);
    if (velocity > 0.0001) {
        velocityDir.x = dx / velocity;
        velocityDir.y = dy / velocity;
    }
    const px = ((clientX - rect.left));
    const py = ((clientY - rect.top));
    const now = performance.now() / 1000.0;
    const dtMouse = Math.max(1e-3, now - prevMouseTime);

    const vx = (px - prevMousePixel.x) / dtMouse;
    const vy = (py - prevMousePixel.y) / dtMouse;

    if (hasPrevMousePixel) {
        stampVelocityToGrid(prevMousePixel.x, prevMousePixel.y, vx, vy);
    }

    sendCursorUpdate(px, py, vx, vy);

    prevMousePixel = { x: px, y: py };
    prevMouseTime = now;
    hasPrevMousePixel = true;

    prevMouse  = { ...mouseNDC };
    mouseNDC   = { x: nx, y: ny };
    window.mouseNDC = mouseNDC;
}

canvas.addEventListener('mousemove', e => updateMouse(e.clientX, e.clientY));
canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    updateMouse(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: false });

let frameVelocity = 0;

resize();

function render() {
    frameVelocity = frameVelocity * 0.7 + velocity * 0.3;
    velocity = 0;

    window.frameVelocity = frameVelocity;

    const dt = Math.min(clock.getDelta(), 1.5);
    const time = performance.now() / 1000.0;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.02, 0.02, 0.04, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    drawGrid(time);
    drawCursorMirrors(time);

    requestAnimationFrame(render);
}

render();

function drawCursorMirrors(time) {
    return;
}


function stampVelocityToGrid(px, py, vx, vy) {
    const now = performance.now() / 1000.0;
    const mag = Math.hypot(vx, vy);
    if (mag < 1e-2) return;

    function normalizeSpeed(magPxPerSec) {
        const min = 50;
        const max = 2000;
        const t = Math.min(1, Math.max(0, (magPxPerSec - min) / (max - min)));
        return 0.01 + t * 0.02;
    }
    const normSpeed = normalizeSpeed(mag);

    const ci = Math.floor(px / CELL_SIZE);
    const cj = Math.floor(py / CELL_SIZE);
    if (ci < 0 || cj < 0 || ci >= gridCols || cj >= gridRows) return;

    const centerCell = grid[ci][cj];
    centerCell.triggeredAt = now;
    centerCell.phase = 0;

    const ndx = vx / mag;
    const ndy = vy / mag;
    const perp1 = { x: -ndy, y: ndx };
    const perp2 = { x: ndy, y: -ndx };

    const lengthPx = 50 + ((normSpeed - 0.01) / 0.02) * (400 - 50);

    const cx = ci * CELL_SIZE + CELL_SIZE * 0.5;
    const cy = cj * CELL_SIZE + CELL_SIZE * 0.5;

    [perp1, perp2].forEach(perp => {
        const ex = cx + perp.x * lengthPx;
        const ey = cy + perp.y * lengthPx;
        const ei = Math.floor(ex / CELL_SIZE);
        const ej = Math.floor(ey / CELL_SIZE);
        const line = bresenham(ci, cj, ei, ej);
        for (let k = 0; k < line.length; ++k) {
            const [xi, yj] = line[k];
            if (xi < 0 || yj < 0 || xi >= gridCols || yj >= gridRows) continue;
            const cell = grid[xi][yj];
            const cellCx = xi * CELL_SIZE + CELL_SIZE * 0.5;
            const cellCy = yj * CELL_SIZE + CELL_SIZE * 0.5;
            const dist = Math.hypot(cellCx - cx, cellCy - cy);
            cell.triggeredAt = now;
            cell.phase = 2 * Math.PI * phaseM * (dist / WAVELENGTH);
        }
    });
}


function bresenham(x0, y0, x1, y1) {
    const pts = [];
    let dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    let dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let x = x0, y = y0;
    while (true) {
        pts.push([x, y]);
        if (x === x1 && y === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x += sx; }
        if (e2 <= dx) { err += dx; y += sy; }
    }
    return pts;
}

function drawGrid(time) {
    gctx.clearRect(0, 0, gridCanvas.width, gridCanvas.height);

    for (let i = 0; i < gridCols; ++i) {
        for (let j = 0; j < gridRows; ++j) {
            const cell = grid[i][j];
            let alpha = 0;
            if (cell.triggeredAt !== null) {
                const elapsed = time - cell.triggeredAt;
                const activeDuration = PERIOD * 3.0;
                if (elapsed >= 0 && elapsed <= activeDuration) {
                    // spatial x: distance normalized by wavelength
                    const x = (cell.phase) / (2 * Math.PI); // dist / WAVELENGTH scaled by m
                    // damping: (1 - abs(tanh(b * x)))
                    const damping = 1.0 - Math.abs(Math.tanh(dampingB * x));
                    const phaseSign = waveMode === 'outward' ? 1.0 : -1.0;
                    const sinv = Math.sin(2 * Math.PI * FREQ * elapsed + phaseSign * cell.phase);
                    // decay over time, normalized by the wave period for visible control
                    const timeDecay = Math.exp(-decayRate * 2 * elapsed / PERIOD);
                    // y = sin(2pi f x) * damping * decay * {y>=0}
                    const val = sinv * damping * timeDecay;
                    alpha = Math.max(0, val);
                } else {
                    cell.triggeredAt = null;
                    alpha = 0;
                }
            }
            if (alpha > 0.001) {
                const x = i * CELL_SIZE;
                const y = j * CELL_SIZE;
                // White cells; only opacity changes
                gctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
                gctx.fillRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2);
            }
        }
    }

    // Draw grid lines
    gctx.strokeStyle = 'rgba(80,100,140,0.06)';
    gctx.lineWidth = 1;
    for (let i = 0; i <= gridCols; ++i) {
        const x = i * CELL_SIZE + 0.5;
        gctx.beginPath(); gctx.moveTo(x, 0); gctx.lineTo(x, gridRows * CELL_SIZE); gctx.stroke();
    }
    for (let j = 0; j <= gridRows; ++j) {
        const y = j * CELL_SIZE + 0.5;
        gctx.beginPath(); gctx.moveTo(0, y); gctx.lineTo(gridCols * CELL_SIZE, y); gctx.stroke();
    }
}