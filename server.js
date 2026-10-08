import 'dotenv/config'
import crypto from 'node:crypto'
import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const app = express()
const directory = path.dirname(fileURLToPath(import.meta.url))
const port = process.env.PORT || 3000
const baseUrl = 'https://api-all.dreammaker.netease.com'

app.use(express.json({ limit: '12mb' }))
app.use(express.static(directory))

function base64Url(value) {
  return Buffer.from(value).toString('base64url')
}

function dreamMakerToken() {
  const accessKey = process.env.DM_ACCESS_KEY?.trim()
  const secretKey = process.env.DM_SECRET_KEY?.trim()
  if (!accessKey || !secretKey) return ''
  const now = Math.floor(Date.now() / 1000)
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = base64Url(JSON.stringify({ iss: accessKey, exp: now + 1800, nbf: now - 5 }))
  const signature = crypto.createHmac('sha256', secretKey).update(`${header}.${payload}`).digest('base64url')
  return `${header}.${payload}.${signature}`
}

function headers() {
  return { Authorization: `Bearer ${dreamMakerToken()}`, 'Content-Type': 'application/json' }
}

function videoHeaders() {
  return headers()
}

function extractImageUrl(data) {
  const output = data?.data?.output
  const candidates = [
    ...(Array.isArray(output?.output) ? output.output : []),
    ...(Array.isArray(output?.images) ? output.images : []),
    ...(Array.isArray(output?.data) ? output.data : []),
    ...(Array.isArray(output) ? output : []),
    ...(Array.isArray(data?.data?.images) ? data.data.images : [])
  ]
  for (const item of candidates) {
    if (typeof item === 'string' && item) return item
    if (item?.url || item?.image_url) return item.url || item.image_url
  }
  return ''
}

async function requestJson(url, options) {
  const result = await fetch(url, options)
  const data = await result.json().catch(() => ({}))
  if (!result.ok || data.code && data.code !== 0) {
    throw new Error(data.message || data.error?.message || `DreamMaker 请求失败（HTTP ${result.status}）`)
  }
  return data
}

app.get('/api/generated-image', async (request, response) => {
  const imageUrl = request.query.url
  if (typeof imageUrl !== 'string') return response.status(400).end()
  const url = imageUrl.startsWith('http') ? imageUrl : `${baseUrl}/${imageUrl.replace(/^\//, '')}`
  if (!url.startsWith('https://api-all.dreammaker.netease.com/')) return response.status(400).end()
  try {
    const image = await fetch(url, { headers: { Authorization: `Bearer ${dreamMakerToken()}` } })
    if (!image.ok) return response.status(image.status).end()
    response.setHeader('Content-Type', image.headers.get('content-type') || 'image/png')
    response.setHeader('Cache-Control', 'private, max-age=3600')
    response.send(Buffer.from(await image.arrayBuffer()))
  } catch {
    response.status(502).end()
  }
})

function dreamMakerAssetUrl(url) {
  if (url.startsWith('https://dreammaker.netease.com/static/image/')) return url
  if (url.startsWith(`${baseUrl}/static/image/`)) return url.replace(`${baseUrl}/`, 'https://dreammaker.netease.com/')
  if (url.startsWith('static/image/')) return `https://dreammaker.netease.com/${url}`
  return ''
}

function extractVideoUrl(data) {
  const output = data?.data?.output || data?.data || {}
  const candidates = [output.video_url, output.url, ...(output.videos || []), ...(output.output || []), ...(output.data || [])]
  for (const item of candidates) {
    if (typeof item === 'string' && item) return item
    if (item?.url || item?.video_url) return item.url || item.video_url
  }
  return ''
}

app.post('/api/generate-pet', async (request, response) => {
  const { image, name, breed, trait } = request.body
  if (!image?.startsWith('data:image/')) return response.status(400).json({ error: '请上传宠物图片。' })
  if (!dreamMakerToken()) return response.status(503).json({ error: '未配置 DreamMaker 密钥。请在 .env 填写 DM_ACCESS_KEY 和 DM_SECRET_KEY。' })

  const prompt = `参考输入照片生成同一只宠物的原创治愈系 2D 数字桌宠全身立绘。严格保留眼睛颜色、毛色分布、花纹、耳朵、脸型、长短毛、体态等可识别特征；宠物品种：${breed || '未知'}；名字：${name || '宠物'}；性格：${trait || '温柔'}。角色完整全身，四肢和尾巴完整，独立站立，透明背景 PNG，无场景、无道具、无文字、无水印、无人类。可爱泡泡玛特风格，适合网页桌宠动画。`

  try {
    const subApp = process.env.DM_SUB_APP || 'gpt-image-2.5-sunburst'
    const submission = await requestJson(`${baseUrl}/api/v1/apps/llm-image/run?sub_app_name=${encodeURIComponent(subApp)}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ params: {
        model: subApp,
        image,
        prompt,
        n: 1,
        quality: 'high',
        size: '1024x1024',
        background: 'transparent',
        output_format: 'png'
      } })
    })
    const taskId = submission.data?.task_id
    if (!taskId) {
      const imageUrl = extractImageUrl(submission)
      if (imageUrl) return response.json({ imageUrl })
      throw new Error('DreamMaker 未返回任务 ID。')
    }

    for (let attempt = 0; attempt < 120; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 3000))
      const status = await requestJson(`${baseUrl}/api/v1/apps/llm-image/status?sub_app_name=${encodeURIComponent(subApp)}&task_id=${encodeURIComponent(taskId)}`, { headers: headers() })
      const state = status.data?.status
      if (state === 'success') {
        const imageUrl = extractImageUrl(status)
        if (!imageUrl) throw new Error('DreamMaker 生成成功但未返回图片地址。')
        const dreamMakerImageUrl = imageUrl.startsWith('http') ? imageUrl : `${baseUrl}/${imageUrl.replace(/^\//, '')}`
        return response.json({ imageUrl: `/api/generated-image?url=${encodeURIComponent(dreamMakerImageUrl)}`, dreamMakerImageUrl })
      }
      if (['failed', 'fail', 'error'].includes(state)) throw new Error(status.data?.message || 'DreamMaker 图像生成失败。')
    }
    throw new Error('DreamMaker 生成超时，请重试。')
  } catch (error) {
    response.status(502).json({ error: error.message || 'DreamMaker 生成服务异常。' })
  }
})

app.post('/api/generate-action', async (request, response) => {
  const { dreamMakerImageUrl, action } = request.body
  if (typeof dreamMakerImageUrl !== 'string' || !dreamMakerImageUrl) return response.status(400).json({ error: '缺少宠物参考图。' })
  if (!dreamMakerToken()) return response.status(503).json({ error: '未配置 DreamMaker AccessKey/SecretKey。' })
  const actions = {
    idle: '宠物自然呼吸，眨眼，耳朵和尾巴轻轻摆动，镜头固定，全身保持完整可见。',
    pet: '宠物开心撒娇，向前蹭一蹭，尾巴大幅摇动，耳朵轻轻抖动，镜头固定，全身保持完整可见。',
    feed: '宠物低头开心吃饭，咀嚼后满足地抬头，尾巴轻轻摇动，镜头固定，全身保持完整可见。',
    play: '宠物兴奋追逐玩具，前爪扑动，尾巴摇摆，动作自然连贯，镜头固定，全身保持完整可见。',
    run: '宠物在原地向前小跑两步后停下，四肢自然奔跑，尾巴随动作摆动，镜头固定，全身保持完整可见。',
    jump: '宠物先压低身体蓄力，然后高高跳起，平稳落地，四肢和尾巴自然运动，镜头固定，全身保持完整可见。',
    sleep: '宠物蜷卧睡觉，胸口均匀呼吸，耳朵偶尔轻动，尾巴轻微摆动，镜头固定，全身保持完整可见。'
  }
  let stage = '提交 Seedance 任务'
  try {
    const imageUrl = dreamMakerAssetUrl(dreamMakerImageUrl)
    if (!imageUrl.startsWith(`${baseUrl}/static/image/`) || imageUrl.length > 4096) return response.status(400).json({ error: '宠物参考图链接无效，请重新生成宠物形象。' })
    const subApp = process.env.DM_VIDEO_SUB_APP || 'reference'
    const submission = await requestJson(`${baseUrl}/api/v1/apps/jimeng-video/run?sub_app_name=${encodeURIComponent(subApp)}`, {
      method: 'POST', headers: videoHeaders(), body: JSON.stringify({ params: {
        aspect_ratio: '1:1',
        duration: 5,
        generate_audio: false,
        model_name: 'doubao-seedance-2-0-fast',
        prompt: actions[action] || actions.idle,
        ratio: '1:1',
        reference_image: [imageUrl],
        resolution: '720p',
        seed: 1,
        task_mode: 'doubao-seedance-2-0-fast',
        watermark: false
      } })
    })
    const taskId = submission.data?.task_id
    if (!taskId) throw new Error('Seedance 未返回任务 ID。')
    stage = '查询 Seedance 任务'
    for (let attempt = 0; attempt < 180; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 3000))
      const status = await requestJson(`${baseUrl}/api/v1/apps/jimeng-video/status?sub_app_name=${encodeURIComponent(subApp)}&task_id=${encodeURIComponent(taskId)}`, { headers: headers() })
      if (status.code !== 0) throw new Error(`${status.message || '视频状态查询失败'}（code ${status.code}）`)
      if (status.data?.status === 'success') {
        const videoUrl = extractVideoUrl(status)
        if (!videoUrl) throw new Error(`视频任务成功但响应中没有视频地址：${JSON.stringify(status.data).slice(0, 700)}`)
        return response.json({ videoUrl })
      }
      if (['failed', 'fail', 'error'].includes(status.data?.status)) throw new Error(status.data?.message || `视频任务失败：${JSON.stringify(status.data).slice(0, 700)}`)
    }
    throw new Error('Seedance 生成超时。')
  } catch (error) { response.status(502).json({ error: `${stage}: ${error.message || 'Seedance 请求失败。'}` }) }
})

app.listen(port, () => console.log(`AI Pet app listening on ${port}`))
