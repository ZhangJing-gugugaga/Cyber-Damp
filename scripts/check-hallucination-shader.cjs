// Native WebGL link regression for the raw-sale blank-desktop failure.
// Separate integration check; this does not replace native sensory UAT.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const assert = require('node:assert/strict');
app.whenReady().then(async () => {
  const readTemplate = (file, name) => {
    const source = fs.readFileSync(file, 'utf8');
    const match = source.match(new RegExp(`(?:export )?const ${name} = ` + '`' + '([\\s\\S]*?)' + '`'));
    if (!match) throw new Error(`Missing shader ${name}`);
    return match[1];
  };
  const vertex = readTemplate('src/renderer/view/shaders/material-filter.ts', 'materialVertex');
  const fragment = readTemplate('src/renderer/view/hallucination.ts', 'fragment');
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html,<html><body></body></html>');
  const result = await win.webContents.executeJavaScript(`(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) throw new Error('Native WebGL2 unavailable');
    const compile = (type, source) => {
      const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    };
    const program = gl.createProgram();
    const vertex = compile(gl.VERTEX_SHADER, '#version 300 es\\nprecision highp float;\\n' + ${JSON.stringify(vertex)});
    const fragment = compile(gl.FRAGMENT_SHADER, '#version 300 es\\nprecision mediump float;\\nout vec4 finalColor;\\n#define gl_FragColor finalColor\\n' + ${JSON.stringify(fragment)});
    gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
    const result = { linked: gl.getProgramParameter(program, gl.LINK_STATUS), log: gl.getProgramInfoLog(program) };
    gl.deleteProgram(program); gl.deleteShader(vertex); gl.deleteShader(fragment);
    return result;
  })()`);
  fs.mkdirSync('logs/material-uat', { recursive: true });
  fs.writeFileSync('logs/material-uat/hallucination-shader-link.json', JSON.stringify(result, null, 2));
  assert.equal(result.linked, true, result.log);
  console.log(JSON.stringify(result));
  win.destroy(); app.quit();
}).catch(error => { console.error(error); app.exit(1); });
