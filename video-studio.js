const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function splitLongText(text, maxChars) {
  const result = [];
  let part = '';
  let count = 0;
  for (const char of Array.from(text)) {
    part += char;
    count++;
    if (count >= maxChars && (/[，,、：:]/.test(char) || count >= maxChars + 8)) {
      result.push(part.trim());
      part = '';
      count = 0;
    }
  }
  if (part.trim()) result.push(part.trim());
  return result;
}

export function splitScriptIntoShots(script, { maxChars = 48 } = {}) {
  const paragraphs = String(script || '')
    .replace(/\r/g, '')
    .split(/\n+/)
    .map(line => line.replace(/^\s*(?:[-*•]|\d+[.、)]?)\s*/, '').trim())
    .filter(Boolean);
  const pieces = paragraphs.flatMap(line => {
    const sentences = line.match(/[^。！？!?；;，,]+[。！？!?；;，,]?/g) || [line];
    return sentences.flatMap(sentence => {
      const clean = sentence.trim();
      return Array.from(clean).length > maxChars ? splitLongText(clean, maxChars) : [clean];
    });
  });

  const groups = [];
  let current = '';
  for (const piece of pieces) {
    if (current && Array.from(current + piece).length > maxChars) {
      groups.push(current);
      current = '';
    }
    current += piece;
  }
  if (current) groups.push(current);

  return groups.map((text, index) => ({
    title: `镜头 ${index + 1}`,
    visual: '',
    voiceover: text,
    caption: text,
    duration: clamp(Math.ceil(Array.from(text).length / 4.5), 3, 12),
    assetId: ''
  }));
}

export function parseAiStoryboard(response) {
  const text = String(response || '').replace(/```(?:json)?/gi, '').trim();
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end < start) throw new Error('本机模型没有返回有效的分镜 JSON，请改用离线拆分。');
  let parsed;
  try { parsed = JSON.parse(text.slice(start, end + 1)); }
  catch { throw new Error('本机模型返回的分镜格式无法读取，请改用离线拆分。'); }
  if (!Array.isArray(parsed) || !parsed.length || parsed.length > 30) throw new Error('本机模型返回的镜头数量无效，请改用离线拆分。');
  const motions = new Set(['none', 'zoom-in', 'zoom-out', 'pan-left', 'pan-right']);
  const transitions = new Set(['cut', 'fade']);
  const clean = (value, limit) => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, limit);
  return parsed.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`第 ${index + 1} 个镜头格式无效，请改用离线拆分。`);
    const voiceover = clean(item.voiceover || item.dialogue || item.caption, 800);
    if (!voiceover) throw new Error(`第 ${index + 1} 个镜头缺少口播内容，请改用离线拆分。`);
    return {
      title: clean(item.title, 50) || `镜头 ${index + 1}`,
      visual: clean(item.visual, 400),
      voiceover,
      caption: clean(item.caption || voiceover, 200),
      duration: clamp(Number(item.duration) || Math.ceil(Array.from(voiceover).length / 4.5), 1, 60),
      motion: motions.has(item.motion) ? item.motion : 'none',
      transition: transitions.has(item.transition) ? item.transition : 'cut',
      assetId: ''
    };
  });
}

export function isTerminalLocalTextTaskError(error) {
  return Boolean(error?.terminal) || error?.status === 410;
}

export function projectDuration(project) {
  return (project?.shots || []).reduce((sum, shot) => sum + clamp(Number(shot.duration) || 0, 1, 60), 0);
}

export function shotMotionAt(motion, progress) {
  const t = clamp(Number(progress) || 0, 0, 1);
  if (motion === 'zoom-in') return { zoom: 1 + .1 * t, panX: 0 };
  if (motion === 'zoom-out') return { zoom: 1.1 - .1 * t, panX: 0 };
  if (motion === 'pan-left') return { zoom: 1.12, panX: .08 - .16 * t };
  if (motion === 'pan-right') return { zoom: 1.12, panX: -.08 + .16 * t };
  return { zoom: 1, panX: 0 };
}

const srtTime = seconds => {
  const millis = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(millis / 3600000);
  const minutes = Math.floor((millis % 3600000) / 60000);
  const secs = Math.floor((millis % 60000) / 1000);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis % 1000).padStart(3, '0')}`;
};

export function storyboardToSrt(project) {
  let offset = 0;
  return (project?.shots || []).map((shot, index) => {
    const start = offset;
    offset += clamp(Number(shot.duration) || 0, 1, 60);
    const caption = String(shot.caption || shot.voiceover || '').trim();
    return caption ? `${index + 1}\n${srtTime(start)} --> ${srtTime(offset)}\n${caption}` : '';
  }).filter(Boolean).join('\n\n') + '\n';
}

function wrapText(ctx, text, maxWidth, maxLines = 3) {
  const lines = [];
  let line = '';
  for (const char of Array.from(text || '')) {
    if (line && ctx.measureText(line + char).width > maxWidth) {
      lines.push(line);
      line = char;
    } else line += char;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = `${Array.from(lines[maxLines - 1]).slice(0, -1).join('')}…`;
  }
  return lines;
}

function coverDraw(ctx, source, width, height, motion) {
  const sourceWidth = source.videoWidth || source.naturalWidth || source.width;
  const sourceHeight = source.videoHeight || source.naturalHeight || source.height;
  if (!sourceWidth || !sourceHeight) return;
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const cropWidth = width / scale / motion.zoom;
  const cropHeight = height / scale / motion.zoom;
  const cropX = (sourceWidth - cropWidth) * clamp(.5 + motion.panX, 0, 1);
  const cropY = (sourceHeight - cropHeight) / 2;
  ctx.drawImage(source, cropX, cropY, cropWidth, cropHeight, 0, 0, width, height);
}

function drawFrame(ctx, project, shot, index, source, width, height, progress) {
  ctx.clearRect(0, 0, width, height);
  const motion = shotMotionAt(shot.motion, progress);
  if (source) coverDraw(ctx, source, width, height, motion);
  else {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#30245d');
    gradient.addColorStop(.55, '#101a37');
    gradient.addColorStop(1, '#080c1c');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#a58cff';
    ctx.globalAlpha = .23;
    ctx.beginPath();
    ctx.arc(width * .78, height * .27, Math.min(width, height) * .3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#f4f1ff';
    ctx.font = `700 ${Math.round(width * .065)}px system-ui, sans-serif`;
    wrapText(ctx, shot.visual || project.title || '创作分镜', width * .78, 3).forEach((line, lineIndex) => ctx.fillText(line, width * .1, height * .31 + lineIndex * width * .09, width * .8));
  }

  const top = ctx.createLinearGradient(0, 0, 0, height * .27);
  top.addColorStop(0, 'rgba(0,0,0,.58)');
  top.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, width, height * .28);

  const bottom = ctx.createLinearGradient(0, height * .65, 0, height);
  bottom.addColorStop(0, 'rgba(0,0,0,0)');
  bottom.addColorStop(.4, 'rgba(0,0,0,.38)');
  bottom.addColorStop(1, 'rgba(0,0,0,.82)');
  ctx.fillStyle = bottom;
  ctx.fillRect(0, height * .64, width, height * .36);

  ctx.fillStyle = 'rgba(255,255,255,.88)';
  ctx.font = `600 ${Math.round(width * .025)}px system-ui, sans-serif`;
  ctx.fillText(`${project.title || '离线视频作品'}  ·  ${String(index + 1).padStart(2, '0')}/${String(project.shots.length).padStart(2, '0')}`, width * .07, height * .075, width * .86);

  const caption = String(shot.caption || shot.voiceover || '').trim();
  if (caption) {
    const captionScale = { small: .036, medium: .045, large: .056 }[project.captionSize] || .045;
    const captionPosition = { upper: .29, middle: .56, bottom: .85 }[project.captionPosition] || .85;
    const captionColor = /^#[\da-f]{6}$/i.test(project.captionColor || '') ? project.captionColor : '#fff';
    ctx.font = `700 ${Math.round(width * captionScale)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lines = wrapText(ctx, caption, width * .84, 3);
    const lineHeight = Math.round(width * captionScale * 1.38);
    const baseY = height * captionPosition - (lines.length - 1) * lineHeight / 2;
    lines.forEach((line, lineIndex) => {
      ctx.lineWidth = Math.max(2, width * .007);
      ctx.strokeStyle = 'rgba(0,0,0,.82)';
      ctx.strokeText(line, width / 2, baseY + lineIndex * lineHeight, width * .87);
      ctx.fillStyle = captionColor;
      ctx.fillText(line, width / 2, baseY + lineIndex * lineHeight, width * .87);
    });
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  }

  if (shot.transition === 'fade') {
    const edge = Math.min(progress, 1 - progress);
    const opacity = clamp(1 - edge / .18, 0, 1);
    if (opacity > 0) {
      ctx.fillStyle = `rgba(0,0,0,${opacity})`;
      ctx.fillRect(0, 0, width, height);
    }
  }
}

function waitForMedia(element, event, errorMessage) {
  return new Promise((resolve, reject) => {
    const done = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(new Error(errorMessage)); };
    const cleanup = () => {
      element.removeEventListener(event, done);
      element.removeEventListener('error', failed);
    };
    element.addEventListener(event, done, { once: true });
    element.addEventListener('error', failed, { once: true });
  });
}

function isVideoElement(source) {
  return typeof HTMLVideoElement !== 'undefined' && source instanceof HTMLVideoElement;
}

async function loadShotSource(shot, getAsset) {
  if (!shot.assetId) return { source: null, dispose() {} };
  const blob = await getAsset(shot.assetId);
  if (!blob) throw new Error(`镜头素材不存在：${shot.title || '未命名镜头'}`);
  const url = URL.createObjectURL(blob);
  if (blob.type.startsWith('image/')) {
    try {
      const bitmap = await createImageBitmap(blob);
      return { source: bitmap, dispose: () => { bitmap.close(); URL.revokeObjectURL(url); } };
    } catch {
      URL.revokeObjectURL(url);
      throw new Error(`无法解码图片素材：${shot.title || ''}`);
    }
  }
  if (blob.type.startsWith('video/')) {
    const video = document.createElement('video');
    video.src = url;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'auto';
    const ready = waitForMedia(video, 'loadeddata', `无法解码视频素材：${shot.title || ''}`);
    video.load();
    await ready;
    return { source: video, dispose: () => { video.pause(); video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); } };
  }
  URL.revokeObjectURL(url);
  throw new Error(`镜头只能选择图片或视频素材：${shot.title || ''}`);
}

function recorderMimeType() {
  const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  return candidates.find(type => MediaRecorder.isTypeSupported(type)) || '';
}

function canvasSize(project) {
  const base = Number(project.resolution) === 1080 ? 1080 : 720;
  if (project.aspectRatio === '16:9') return [Math.round(base * 16 / 9), base];
  if (project.aspectRatio === '1:1') return [base, base];
  return [base, Math.round(base * 16 / 9)];
}

export async function renderLocalVideo(project, { getAsset, onProgress = () => {}, signal } = {}) {
  if (!globalThis.MediaRecorder || typeof HTMLCanvasElement === 'undefined' || !HTMLCanvasElement.prototype.captureStream) throw new Error('当前浏览器不支持离线视频录制，请使用新版 Chrome、Edge 或 Safari。');
  const shots = (project?.shots || []).filter(shot => Number(shot.duration) > 0);
  if (!shots.length) throw new Error('请先生成或添加至少一个分镜。');
  const totalSeconds = shots.reduce((sum, shot) => sum + clamp(Number(shot.duration) || 0, 1, 60), 0);
  if (totalSeconds > 300) throw new Error('单次离线导出最多 5 分钟，请拆成多个项目导出。');
  const mimeType = recorderMimeType();
  if (!mimeType) throw new Error('此浏览器没有可用的视频编码器。');

  const [width, height] = canvasSize(project);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('无法创建离线渲染画布，请检查浏览器图形设置。');
  const stream = canvas.captureStream(30);
  let audio;
  let audioUrl;
  const chunks = [];
  let recorder;
  let completed;
  let recordingStarted = false;
  const loadedSources = [];
  const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
  const checkAbort = () => { if (signal?.aborted) throw new DOMException('导出已取消。', 'AbortError'); };

  try {
    if (project.audioAssetId) {
      const blob = await getAsset(project.audioAssetId);
      if (!blob) throw new Error('配乐素材不存在，请重新选择。');
      audioUrl = URL.createObjectURL(blob);
      audio = new Audio();
      audio.src = audioUrl;
      audio.loop = true;
      const requestedVolume = Number(project.audioVolume);
      audio.volume = clamp(Number.isFinite(requestedVolume) ? requestedVolume : 35, 0, 100) / 100;
      const capture = audio.captureStream?.() || audio.mozCaptureStream?.();
      if (!capture?.getAudioTracks().length) throw new Error('当前浏览器不支持把本地音频混入录制；请在不加配乐的情况下导出，再使用系统剪辑工具加音轨。');
      capture.getAudioTracks().forEach(track => stream.addTrack(track));
    }
    const sources = [];
    for (const shot of shots) {
      checkAbort();
      const loaded = await loadShotSource(shot, getAsset);
      sources.push(loaded);
      loadedSources.push(loaded);
    }
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: Number(project.resolution) === 1080 ? 8_000_000 : 4_000_000 });
    completed = new Promise((resolve, reject) => {
      recorder.ondataavailable = event => { if (event.data?.size) chunks.push(event.data); };
      recorder.onerror = event => reject(event.error || new Error('录制失败。'));
      recorder.onstop = () => signal?.aborted ? reject(new DOMException('导出已取消。', 'AbortError')) : resolve(new Blob(chunks, { type: recorder.mimeType || mimeType }));
    });
    recorder.start(1000);
    recordingStarted = true;
    if (audio) await audio.play();

    for (let index = 0; index < shots.length; index++) {
      checkAbort();
      const shot = shots[index];
      const source = sources[index].source;
      if (isVideoElement(source)) {
        source.currentTime = 0;
        await source.play();
      }
      const seconds = clamp(Number(shot.duration) || 0, 1, 60);
      const started = performance.now();
      while ((performance.now() - started) / 1000 < seconds) {
        checkAbort();
        if (isVideoElement(source) && source.ended) {
          source.currentTime = 0;
          await source.play();
        }
        const elapsed = (performance.now() - started) / 1000;
        drawFrame(ctx, project, shot, index, source, width, height, Math.min(elapsed / seconds, 1));
        onProgress({ shot: index + 1, totalShots: shots.length, elapsed: Math.min(elapsed, seconds), duration: seconds, totalSeconds, completedSeconds: shots.slice(0, index).reduce((sum, item) => sum + Number(item.duration), 0) + Math.min(elapsed, seconds) });
        await frame();
      }
      if (isVideoElement(source)) source.pause();
    }
    recorder.stop();
    return await completed;
  } catch (error) {
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    if (recordingStarted) await completed?.catch(() => {});
    throw error;
  } finally {
    audio?.pause();
    audio?.removeAttribute('src');
    if (audio) audio.load();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    loadedSources.forEach(entry => entry.dispose());
    stream.getTracks().forEach(track => track.stop());
  }
}

export function outputExtension(blob) {
  return blob.type.includes('mp4') ? 'mp4' : 'webm';
}
