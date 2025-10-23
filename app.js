// ----- Config -----
const DEFAULT_SYMBOL = 'BINANCE:BTCUSDT';
const DEFAULT_INTERVAL = '15'; // tv.js interval (minutes)

// CoinGecko: mapeia ids -> rótulos a exibir (ordem da barra superior)
const COINS = [
  { id: 'bitcoin', label: 'BTC' },
  { id: 'ethereum', label: 'ETH' },
  { id: 'binancecoin', label: 'BNB' },
  { id: 'solana', label: 'SOL' },
  { id: 'ripple', label: 'XRP' },
  { id: 'dogecoin', label: 'DOGE' },
  { id: 'cardano', label: 'ADA' },
  { id: 'litecoin', label: 'LTC' },
  { id: 'avalanche-2', label: 'AVAX' }
];
const QUOTES_REFRESH_MS = 30000;

// cache das últimas cotações por id do CoinGecko
let lastMarketData = {}; // { id: { current_price, price_change_percentage_24h, image, ... } }

// mapear símbolo do TradingView (ex: BINANCE:BTCUSDT) -> id CoinGecko
function coingeckoIdFromTvSymbol(tvSymbol) {
  try {
    const base = tvSymbol.split(':')[1].replace('USDT','').replace('USD','');
    const b = base.toUpperCase();
    const map = {
      'BTC':'bitcoin',
      'ETH':'ethereum',
      'BNB':'binancecoin',
      'SOL':'solana',
      'XRP':'ripple',
      'DOGE':'dogecoin',
      'ADA':'cardano',
      'LTC':'litecoin',
      'AVAX':'avalanche-2'
    };
    return map[b];
  } catch { return undefined; }
}

function updateSelectedPriceBadge() {
  const el = document.getElementById('selectedPrice');
  if (!el) return;
  const sym = getCurrentSymbol();
  const id = coingeckoIdFromTvSymbol(sym);
  const row = id ? lastMarketData[id] : undefined;
  if (row) {
    const px = formatUSD(row.current_price);
    const chg = row.price_change_percentage_24h;
    el.textContent = `${px} ${chg != null ? `(${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%)` : ''}`;
    el.style.color = chg >= 0 ? 'var(--buy)' : 'var(--sell)';
  } else {
    el.textContent = '';
    el.style.color = 'var(--text)';
  }
}

// ----- Util -----
const $ = (sel) => document.querySelector(sel);

function formatUSD(n) {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 }).format(n);
  } catch {
    return `$${n}`;
  }
}

function mapIntervalForTA(interval) {
  // UI intervals: '1','3','5','15','30','60','240','D','W'
  const map = {
    '1': '1m',
    '3': '3m',
    '5': '5m',
    '15': '15m',
    '30': '30m',
    '60': '1h',
    '240': '4h',
    'D': '1D',
    'W': '1W'
  };
  return map[interval] || '1h';
}

// ----- Cotações (CoinGecko) -----
async function loadQuotes() {
  const ids = COINS.map(c => c.id).join(',');
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&price_change_percentage=24h`;
  try {
    const res = await fetch(url, { headers: { 'accept': 'application/json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json(); // array
    // atualizar cache
    lastMarketData = Object.fromEntries(data.map(x => [x.id, x]));
    renderQuotes(data);
    updateSelectedPriceBadge();
  } catch (e) {
    console.error('Erro ao buscar cotações:', e);
  }
}

function renderQuotes(dataArray) {
  const track = document.getElementById('quotesTrack');
  track.innerHTML = '';
  const byId = Object.fromEntries(dataArray.map(x => [x.id, x]));

  const build = () => {
    const frag = document.createDocumentFragment();
    COINS.forEach(c => {
      const row = byId[c.id];
      const price = row?.current_price;
      const chg = row?.price_change_percentage_24h;
      const logo = row?.image;
      const chgFmt = (chg > 0 ? '+' : '') + (chg?.toFixed ? chg.toFixed(2) : chg) + '%';
      const div = document.createElement('div');
      div.className = 'quote';
      div.innerHTML = `
        ${logo ? `<img src="${logo}" alt="${c.label} logo" loading="lazy">` : ''}
        <span class="sym">${c.label}</span>
        <span class="px">${price != null ? formatUSD(price) : '—'}</span>
        <span class="chg ${chg >= 0 ? 'up' : 'down'}">${chg != null ? chgFmt : ''}</span>
      `;
      frag.appendChild(div);
    });
    return frag;
  };

  // Duplicar conteúdo para looping contínuo (CSS move 50%)
  track.appendChild(build());
  track.appendChild(build());
}

// ----- TradingView Chart -----
let chartWidget = null;
function renderChart(symbol, interval) {
  const containerId = 'tv_chart';
  // limpa container antes de recriar
  const el = document.getElementById(containerId);
  el.innerHTML = '';
  chartWidget = new TradingView.widget({
    autosize: true,
    symbol,
    interval: interval,
    timezone: 'Etc/UTC',
    theme: 'dark',
    style: '1',
    locale: 'br',
    toolbar_bg: '#131722',
    enable_publishing: false,
    withdateranges: true,
    hide_side_toolbar: false,
    allow_symbol_change: true,
    container_id: containerId
  });
}

// ----- TradingView Technical Analysis (Signals) -----
let taScriptNode = null;
function renderTAWidget(symbol, interval) {
  const container = document.getElementById('tv_ta');
  container.innerHTML = '';
  // o widget de TA usa um <script> externo com JSON embutido
  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js';
  const config = {
    interval: mapIntervalForTA(interval),
    width: '100%',
    isTransparent: true,
    height: '100%',
    symbol,
    showIntervalTabs: true,
    displayMode: 'single',
    colorTheme: 'dark',
    locale: 'br'
  };
  script.innerHTML = JSON.stringify(config);
  taScriptNode = script;
  container.appendChild(script);
}

// ----- UI handlers -----
function applySymbol(sym) {
  const interval = $('#intervalSelect').value;
  $('#symbolSelect').value = sym; // se existir na lista mantém selecionado
  renderChart(sym, interval);
  renderTAWidget(sym, interval);
  updateSelectedPriceBadge();
}

function applyInterval(intv) {
  const sym = getCurrentSymbol();
  renderChart(sym, intv);
  renderTAWidget(sym, intv);
}

function getCurrentSymbol() {
  return $('#symbolSelect').value;
}

function initControls() {
  $('#symbolSelect').addEventListener('change', (e) => applySymbol(e.target.value));
  $('#intervalSelect').addEventListener('change', (e) => applyInterval(e.target.value));
}

// ----- Boot -----
window.addEventListener('DOMContentLoaded', () => {
  initControls();
  // inicialização
  $('#symbolSelect').value = DEFAULT_SYMBOL;
  $('#intervalSelect').value = DEFAULT_INTERVAL;
  applySymbol(DEFAULT_SYMBOL);

  loadQuotes();
  setInterval(loadQuotes, QUOTES_REFRESH_MS);
});
