const CACHE_ITEMS = [
	{
		id: 'sessionStorage',
		title: '浏览会话',
		subtitle: 'SessionStorage',
		desc: '清除当前会话的临时数据',
		icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/></svg>',
	},
	{
		id: 'localStorage',
		title: '本地存储',
		subtitle: 'LocalStorage',
		desc: '清除持久化的本地数据',
		icon: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></svg>',
	},
	{
		id: 'indexedDB',
		title: '索引数据库',
		subtitle: 'IndexedDB',
		desc: '清除结构化数据库缓存',
		icon: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
	},
	{
		id: 'cookie',
		title: '身份信息',
		subtitle: 'Cookie',
		desc: '清除身份信息(注意:可能需要重新登录)',
		icon: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-4-4 4 4 0 0 1 4-4 4 4 0 0 1-4-4 4 4 0 0 1 4-4z"/><circle cx="8.5" cy="11" r="1"/><circle cx="12" cy="15" r="1"/><circle cx="15.5" cy="10" r="1"/></svg>',
	},
	{
		id: 'fileDiskCache',
		title: '静态资源文件',
		subtitle: 'File Cache',
		desc: '清除资源缓存(注意:请先保存重要数据)',
		icon: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
	},
]

const ITEM_IDS = CACHE_ITEMS.map(item => item.id)
const GAUGE_CIRCUMFERENCE = 226.2

const cacheListEl = document.getElementById('cache-list')
const confirmBtn = document.getElementById('btn-confirm')
const statusEl = document.getElementById('status')
const totalSizeEl = document.getElementById('total-size')
const selectedCountEl = document.getElementById('selected-count')
const btnSizeEl = document.getElementById('btn-size')
const gaugeProgressEl = document.querySelector('.gauge-progress')
const closeBtn = document.getElementById('btn-close')

let currentTab = null
let pageSupported = true
let cacheStats = {}

function formatSize(bytes) {
	if (!bytes || bytes <= 0) return '0 B'
	const units = ['B', 'KB', 'MB', 'GB']
	let value = bytes
	let unitIndex = 0
	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024
		unitIndex += 1
	}
	return unitIndex === 0
		? `${Math.round(value)} ${units[unitIndex]}`
		: `${value.toFixed(1)} ${units[unitIndex]}`
}

function getItemCheckboxes() {
	return ITEM_IDS.map(id => document.getElementById(id))
}

function setStatus(text, isError = false) {
	statusEl.textContent = text
	statusEl.classList.toggle('error', isError)
}

function setLoading(loading) {
	confirmBtn.classList.toggle('loading', loading)
	confirmBtn.disabled = loading || !pageSupported
}

function getSelectedOptions() {
	const options = {}
	ITEM_IDS.forEach(id => {
		options[id] = document.getElementById(id).checked
	})
	return options
}

function updateSummary() {
	const checkboxes = getItemCheckboxes()
	const selected = checkboxes.filter(cb => cb.checked)
	const selectedBytes = selected.reduce((sum, cb) => sum + (cacheStats[cb.id] || 0), 0)
	const totalBytes = ITEM_IDS.reduce((sum, id) => sum + (cacheStats[id] || 0), 0)

	selectedCountEl.textContent = String(selected.length)
	totalSizeEl.textContent = formatSize(selectedBytes)
	btnSizeEl.textContent = formatSize(selectedBytes)

	const ratio = totalBytes > 0 ? selectedBytes / totalBytes : 0
	gaugeProgressEl.style.strokeDashoffset = String(GAUGE_CIRCUMFERENCE * (1 - ratio))
}

function renderCacheList() {
	cacheListEl.innerHTML = CACHE_ITEMS.map(
		item => `
    <li class="cache-item" data-id="${item.id}">
      <div class="item-icon">${item.icon}</div>
      <div class="item-body">
        <p class="item-title">${item.title} (${item.subtitle})</p>
        <p class="item-desc">${item.desc}</p>
      </div>
      <span class="item-size" id="size-${item.id}">--</span>
      <input id="${item.id}" type="checkbox" class="item"${item.id === 'fileDiskCache' ? ' checked' : ''} />
    </li>
  `,
	).join('')

	cacheListEl.querySelectorAll('.cache-item').forEach(row => {
		const checkbox = row.querySelector('input')
		row.addEventListener('click', event => {
			if (event.target === checkbox) return
			checkbox.checked = !checkbox.checked
			checkbox.dispatchEvent(new Event('change'))
		})
		checkbox.addEventListener('change', updateSummary)
	})
}

function updateStatsAfterClear(options) {
	ITEM_IDS.forEach(id => {
		if (options[id]) {
			cacheStats[id] = 0
			document.getElementById(`size-${id}`).textContent = formatSize(0)
		}
	})
	updateSummary()
}

async function fetchPageStorageStats(tabId) {
	const [{ result }] = await chrome.scripting.executeScript({
		target: { tabId },
		func: async () => {
			const calcStorageSize = storage => {
				let size = 0
				for (let i = 0; i < storage.length; i += 1) {
					const key = storage.key(i)
					const value = storage.getItem(key) || ''
					size += (key.length + value.length) * 2
				}
				return size
			}

			const estimateIndexedDBSize = async () => {
				if (!indexedDB.databases) return 0
				const dbs = await indexedDB.databases()
				let total = 0
				for (const dbInfo of dbs) {
					await new Promise(resolve => {
						const request = indexedDB.open(dbInfo.name, dbInfo.version)
						request.onerror = () => resolve()
						request.onsuccess = event => {
							const db = event.target.result
							const storeNames = Array.from(db.objectStoreNames)
							let pending = storeNames.length
							if (pending === 0) {
								db.close()
								resolve()
								return
							}
							storeNames.forEach(storeName => {
								const store = db.transaction(storeName, 'readonly').objectStore(storeName)
								const countReq = store.count()
								countReq.onerror = () => {
									pending -= 1
									if (pending === 0) {
										db.close()
										resolve()
									}
								}
								countReq.onsuccess = () => {
									total += countReq.result * 512
									pending -= 1
									if (pending === 0) {
										db.close()
										resolve()
									}
								}
							})
						}
					})
				}
				return total
			}

			let cacheEstimate = 0
			if (performance.getEntriesByType) {
				cacheEstimate = performance
					.getEntriesByType('resource')
					.reduce((sum, entry) => sum + (entry.transferSize || entry.encodedBodySize || 0), 0)
			}

			return {
				sessionStorage: calcStorageSize(sessionStorage),
				localStorage: calcStorageSize(localStorage),
				indexedDB: await estimateIndexedDBSize(),
				fileDiskCache: cacheEstimate,
			}
		},
	})
	return result
}

async function fetchCookieStats(url) {
	const cookies = await chrome.cookies.getAll({ url })
	return cookies.reduce((sum, cookie) => {
		return sum + (cookie.name.length + (cookie.value?.length || 0)) * 2
	}, 0)
}

async function loadStats() {
	if (!pageSupported || !currentTab?.id) return

	try {
		const pageStats = await fetchPageStorageStats(currentTab.id)
		const cookieSize = await fetchCookieStats(currentTab.url)

		cacheStats = {
			...pageStats,
			cookie: cookieSize,
		}

		CACHE_ITEMS.forEach(item => {
			document.getElementById(`size-${item.id}`).textContent = formatSize(cacheStats[item.id] || 0)
		})

		updateSummary()
		setStatus('')
	} catch {
		setStatus('部分数据无法读取', true)
	}
}

function disablePage() {
	pageSupported = false
	confirmBtn.disabled = true
	getItemCheckboxes().forEach(cb => {
		cb.disabled = true
	})
	setStatus('当前页面不支持清理', true)
}

async function init() {
	renderCacheList()

	const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
	currentTab = tab

	if (!tab?.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
		disablePage()
		return
	}

	await loadStats()
}

confirmBtn.addEventListener('click', async () => {
	if (!pageSupported || !currentTab?.id) {
		setStatus('无法操作当前页面', true)
		return
	}

	const options = getSelectedOptions()
	const hasSelection = Object.values(options).some(Boolean)
	if (!hasSelection) {
		setStatus('请至少勾选一个选项', true)
		return
	}

	setLoading(true)
	setStatus('清理中…')

	try {
		const response = await chrome.runtime.sendMessage({
			action: 'clearSelected',
			tabId: currentTab.id,
			url: currentTab.url,
			options,
		})

		if (!response?.ok) {
			throw new Error(response?.error || '清理失败')
		}

		setStatus('清理完成')
		updateStatsAfterClear(options)
	} catch (err) {
		setStatus(err.message || '清理失败', true)
	} finally {
		setLoading(false)
	}
})

closeBtn.addEventListener('click', () => window.close())

init()
