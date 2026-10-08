const $ = id => document.getElementById(id)
const state = { sourceImage: '', generatedImage: '', dreamMakerImageUrl: '', name: '团团', breed: '金毛寻回犬', trait: '黏人', mood: 86, hunger: 72, energy: 68 }
function savePet() {
  sessionStorage.setItem('ai-pet-companion', JSON.stringify({ ...state, sourceImage: '' }))
}

function toast(message) {
  const el = $('toast')
  el.textContent = message
  el.classList.add('show')
  setTimeout(() => el.classList.remove('show'), 2600)
}
function setGeneratedPet(image, dreamMakerImageUrl = '') {
  state.generatedImage = image
  state.dreamMakerImageUrl = dreamMakerImageUrl
  savePet()
  ;['heroImage', 'resultImage', 'roomImage'].forEach(id => {
    const el = $(id)
    el.src = image
    el.hidden = false
    el.classList.add('generated')
  })
  ;['heroEmoji', 'resultEmoji', 'roomEmoji'].forEach(id => $(id).style.display = 'none')
}
function makeDemoPet(source) {
  return new Promise(resolve => {
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 1
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(image, 0, 0, 1, 1)
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
      const fur = `rgb(${r},${g},${b})`
      const dark = `rgb(${Math.max(30, r - 70)},${Math.max(25, g - 70)},${Math.max(20, b - 65)})`
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 700"><rect width="600" height="700" rx="80" fill="#fbf1df"/><circle cx="300" cy="325" r="225" fill="#f2c889" opacity=".35"/><ellipse cx="300" cy="522" rx="165" ry="130" fill="${fur}"/><path d="M170 295 145 105 270 202M430 295 455 105 330 202" fill="${fur}" stroke="${dark}" stroke-width="17" stroke-linejoin="round"/><circle cx="300" cy="330" r="195" fill="${fur}" stroke="${dark}" stroke-width="17"/><ellipse cx="235" cy="315" rx="31" ry="39" fill="#fffaf2"/><ellipse cx="365" cy="315" rx="31" ry="39" fill="#fffaf2"/><circle cx="238" cy="321" r="15" fill="${dark}"/><circle cx="362" cy="321" r="15" fill="${dark}"/><ellipse cx="300" cy="382" rx="29" ry="21" fill="${dark}"/><path d="M300 403q-36 35-72 0M300 403q36 35 72 0" fill="none" stroke="${dark}" stroke-width="12" stroke-linecap="round"/><path d="M214 372l-95-18M214 395l-95 20M386 372l95-18M386 395l95 20" stroke="${dark}" stroke-width="10" stroke-linecap="round"/><ellipse cx="235" cy="397" rx="37" ry="17" fill="#ec9a91" opacity=".65"/><ellipse cx="365" cy="397" rx="37" ry="17" fill="#ec9a91" opacity=".65"/><path d="M155 570q-100 20-88 115" fill="none" stroke="${fur}" stroke-width="46" stroke-linecap="round"/></svg>`
      resolve(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)
    }
    image.onerror = () => resolve('')
    image.src = source
  })
}
function finishGeneration(image, demo = false, dreamMakerImageUrl = '') {
  setGeneratedPet(image, dreamMakerImageUrl)
  $('aiStatus').textContent = demo ? '本地风格化完成' : 'AI 数字形象完成'
  $('generateBtn').textContent = '✓ 重新生成数字宠物'
  $('generateBtn').disabled = false
  $('resultName').textContent = state.name
  $('cardName').textContent = state.name
  $('roomName').textContent = state.name
  $('cardBreed').textContent = `${state.breed} · ${state.trait}`
  $('featureText').textContent = `${state.breed} · 保留照片毛色与轮廓特征`
  $('traitText').textContent = `${state.trait}、温柔、喜欢互动`
  $('result').classList.remove('hidden')
  enableDrag()
  roomPet().classList.add('pet-action-idle')
  $('result').scrollIntoView({ behavior: 'smooth', block: 'center' })
  toast(demo ? `${state.name} 的风格化演示形象已生成` : `${state.name} 的 AI 数字伙伴已创建`)
}
$('photoInput').addEventListener('change', event => {
  const file = event.target.files[0]
  if (!file) return
  if (file.size > 8 * 1024 * 1024) return toast('图片需小于 8MB')
  const reader = new FileReader()
  reader.onload = () => {
    state.sourceImage = reader.result
    $('preview').src = reader.result
    $('preview').hidden = false
    $('uploadEmpty').hidden = true
    $('aiStatus').textContent = '照片待生成'
    $('generateBtn').disabled = false
    toast('照片已读取，将用于生成新的数字形象')
  }
  reader.readAsDataURL(file)
})
$('traits').addEventListener('click', event => {
  if (event.target.tagName !== 'BUTTON') return
  document.querySelectorAll('#traits button').forEach(button => button.classList.remove('selected'))
  event.target.classList.add('selected')
  state.trait = event.target.textContent
})
$('generateBtn').addEventListener('click', async () => {
  state.name = $('petName').value.trim() || '团团'
  state.breed = $('petBreed').value.trim() || '未知品种'
  const btn = $('generateBtn')
  btn.disabled = true
  btn.textContent = 'AI 正在提取外貌特征…'
  $('aiStatus').textContent = '识别毛色、轮廓中'
  try {
    const response = await fetch('/api/generate-pet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: state.sourceImage, name: state.name, breed: state.breed, trait: state.trait }) })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error)
    finishGeneration(data.imageUrl, false, data.dreamMakerImageUrl)
  } catch (error) {
    btn.textContent = '正在生成可演示动作…'
    const demoImage = await makeDemoPet(state.sourceImage)
    if (!demoImage) { btn.disabled = false; btn.textContent = '✨ 生成专属数字宠物'; return toast(error.message || '生成失败，请重试') }
    finishGeneration(demoImage, true)
  }
})
const text = { pet: '被你轻轻摸过，它开心地靠近了你。', feed: '好香！它低下头，开心地吃了起来。', play: '它叼来玩具，兴奋地转起了圈。', chat: '我最喜欢和你聊天。今天也要记得喝水、早点休息哦！', run: '收到！它像一阵风一样在房间里跑了两圈。', jump: '看我的！它高高跳起，稳稳落在地毯上。', sleep: '它蜷成一团，发出轻轻的呼噜声。' }
function updateMeters() { $('moodBar').style.width = `${state.mood}%`; $('moodValue').textContent = state.mood; $('hungerBar').style.width = `${state.hunger}%`; $('hungerValue').textContent = state.hunger; $('energyBar').style.width = `${state.energy}%`; $('energyValue').textContent = state.energy }
function roomPet() { return state.generatedImage ? $('roomImage') : $('roomEmoji') }
function clearAction(pet) {
  pet.classList.remove('pet-action-idle', 'pet-action-jump', 'pet-action-run', 'pet-action-play', 'pet-action-eat', 'pet-action-sleep', 'pet-action-cuddle')
}
function burst(type) {
  const room = document.querySelector('.room')
  const symbols = { pet: ['♥', '✦', '♥'], feed: ['✦', '●', '✦'], play: ['✦', '●', '✦'], run: ['💨', '✦', '💨'], jump: ['★', '✦', '★'], sleep: ['z', 'Z', 'z'], chat: ['♥', '✦', '♥'] }[type] || []
  symbols.forEach((symbol, index) => {
    const particle = document.createElement('span')
    particle.className = `pet-particle particle-${type}`
    particle.textContent = symbol
    particle.style.setProperty('--particle-x', `${(index - 1) * 46}px`)
    particle.style.setProperty('--particle-delay', `${index * 110}ms`)
    room.appendChild(particle)
    setTimeout(() => particle.remove(), 1800)
  })
}
async function playAction(type) {
  const pet = roomPet()
  clearAction(pet)
  burst(type)
  if (!state.dreamMakerImageUrl) return pet.classList.add('pet-action-idle')
  const video = $('roomVideo')
  $('petBubble').textContent = '正在生成真实动作视频，请稍候…'
  try {
    const response = await fetch('/api/generate-action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dreamMakerImageUrl: state.dreamMakerImageUrl, action: type }) })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error)
    video.src = data.videoUrl
    video.hidden = false
    $('roomImage').hidden = true
    $('roomEmoji').style.display = 'none'
    await video.play()
    video.onended = () => { video.hidden = true; $('roomImage').hidden = false; $('roomImage').classList.add('pet-action-idle') }
  } catch (error) {
    $('petBubble').textContent = `动作视频生成失败：${error.message || '请重试'}`
    pet.classList.add('pet-action-idle')
  }
}
document.querySelector('.interactions').addEventListener('click', async event => { const type = event.target.closest('button')?.dataset.action; if (!type) return; state.mood = Math.min(100, state.mood + (type === 'sleep' ? 0 : 5)); if (type === 'feed') state.hunger = Math.min(100, state.hunger + 12); if (type === 'play' || type === 'run' || type === 'jump') state.energy = Math.max(0, state.energy - 9); $('petBubble').textContent = text[type]; $('chatText').textContent = `“ ${text[type]} ”`; await playAction(type); updateMeters() })
function enableDrag() {
  const room = document.querySelector('.room')
  const pet = roomPet()
  let dragging = false, startX, startY, left, bottom
  pet.onpointerdown = event => { dragging = true; startX = event.clientX; startY = event.clientY; left = parseFloat(getComputedStyle(pet).left); bottom = parseFloat(getComputedStyle(pet).bottom); pet.setPointerCapture(event.pointerId); pet.style.transition = 'none' }
  pet.onpointermove = event => { if (!dragging) return; const width = room.clientWidth; const height = room.clientHeight; const nextLeft = Math.max(0, Math.min(width - pet.clientWidth, left + event.clientX - startX)); const nextBottom = Math.max(0, Math.min(height - pet.clientHeight, bottom - (event.clientY - startY))); pet.style.left = `${nextLeft}px`; pet.style.bottom = `${nextBottom}px` }
  pet.onpointerup = () => { dragging = false; pet.style.transition = '' }
}
$('journalBtn').addEventListener('click', () => { $('memoryTitle').textContent = '今天的温柔陪伴'; $('memoryText').textContent = $('petBubble').textContent; toast('已写入时光相册') })
$('shareBtn').addEventListener('click', async () => { const shareText = `这是我的数字宠物 ${state.name}，来看看我们今天的陪伴时光。`; try { await navigator.clipboard.writeText(shareText); $('shareMessage').textContent = '分享文案已复制，可发送给好友。' } catch { $('shareMessage').textContent = shareText } })
$('demoBtn').addEventListener('click', () => toast('未配置 AIGW 时，自动使用本地风格化演示生成'))
