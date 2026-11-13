(() => {
  "use strict";
  const DATA_URL = "https://raw.githubusercontent.com/johnnydelateling-bit/russia-watch-map/main/docs/data.json";
  const REGIONS_URL = "./regions.topojson";
  const REFRESH_MS = 5_000;
  const FRESH_HOURS = 6;
  const CATEGORY = {
    uav: { label: "БПЛА", color: "#f15d64" },
    rocket: { label: "Ракетная опасность", color: "#a78bfa" },
    aviation: { label: "Авиационная опасность", color: "#59a9ed" },
    other: { label: "Предупреждение", color: "#f2a94c" },
    clear: { label: "Отбой", color: "#57c69b" }
  };
  const state = { events: [], stats: null, category: "all", region: "", regionsLayer: null, map: null };
  const $ = id => document.getElementById(id);
  function shortRegion(name) {
    return String(name || "")
      .replace(/^Город Москва столица Российской Федерации город федерального значения$/i, "Москва")
      .replace(/^Город Санкт-Петербург город федерального значения$/i, "Санкт-Петербург")
      .replace(/^Город федерального значения Севастополь$/i, "Севастополь")
      .replace(/^Республика /i, "")
      .replace(/^Кабардино-Балкарская республика$/i, "Кабардино-Балкария")
      .replace(/^Карачаево-Черкесская республика$/i, "Карачаево-Черкесия")
      .replace(/^Удмуртская республика$/i, "Удмуртия")
      .replace(/^Чеченская республика$/i, "Чечня")
      .replace(/^Чувашская республика$/i, "Чувашия")
      .replace(/^Республика Тува$/i, "Тыва")
      .replace(/^Луганская Народная Республика$/i, "ЛНР")
      .replace(/^Донецкая Народная Республика$/i, "ДНР");
  }
  function eventAgeHours(event) {
    const t = Date.parse(event.posted_at || "");
    return Number.isFinite(t) ? Math.max(0, (Date.now() - t) / 3600000) : Infinity;
  }
  function latestByRegion() {
    const latest = new Map();
    for (const event of [...state.events].sort((a,b) => Date.parse(b.posted_at)-Date.parse(a.posted_at))) {
      if (!latest.has(event.region)) latest.set(event.region, event);
    }
    return latest;
  }
  function eventStyle(event) {
    if (!event) return { fillColor:"#25364b",fillOpacity:0.22,color:"#66809c",weight:0.7 };
    const age = eventAgeHours(event);
    if (event.state === "warning" && age <= FRESH_HOURS) {
      return { fillColor:CATEGORY[event.category]?.color || CATEGORY.other.color,fillOpacity:0.72,color:"#e8f1fc",weight:1.15 };
    }
    if (event.state === "clear" && age <= 24) return { fillColor:CATEGORY.clear.color,fillOpacity:0.52,color:"#c3efdd",weight:1 };
    return { fillColor:"#63758a",fillOpacity:0.22,color:"#71869f",weight:0.75,dashArray:"3 4" };
  }
  function initializeMap(geo) {
    if (!window.L) throw new Error("Не загрузилась библиотека карты");
    const map = L.map("map",{zoomControl:true,scrollWheelZoom:true,preferCanvas:true,minZoom:2,maxZoom:7});
    L.control.zoom({position:"topright"}).addTo(map);
    let layer;
    layer = L.geoJSON(geo,{
      style: feature => {
        const base = eventStyle(latestByRegion().get(feature.properties.name));
        return feature.properties.new2022 ? {...base, dashArray:"4 3", weight:Math.max(1.1, base.weight)} : base;
      },
      onEachFeature: (feature,featureLayer) => {
        const name = shortRegion(feature.properties.name);
        featureLayer.bindTooltip(name + (feature.properties.new2022 ? " †" : ""),{sticky:true,className:"region-tooltip"});
        featureLayer.on({
          mouseover: e => e.target.setStyle({weight:2,color:"#f2f7ff",fillOpacity:0.88}),
          mouseout: e => layer.resetStyle(e.target),
          click: () => selectRegion(name)
        });
      }
    }).addTo(map);
    state.map=map;state.regionsLayer=layer;
    map.fitBounds(layer.getBounds(),{padding:[18,18]});
    map.setMaxBounds(layer.getBounds().pad(0.15));
  }
  function selectRegion(name) {
    state.region=name;
    $("selected-region").hidden=!name;
    $("selected-region-name").textContent=name;
    $("map-subtitle").textContent=name ? "Выбран регион · фильтр ленты" : "Региональная карта";
    renderFeed();
  }
  function updateMapStyles() {
    if (state.regionsLayer) state.regionsLayer.setStyle(feature => eventStyle(latestByRegion().get(feature.properties.name)));
  }
  function formatDate(value) {
    const t=Date.parse(value||"");
    return Number.isFinite(t) ? new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}).format(new Date(t)) : "время неизвестно";
  }
  function relativeTime(value) {
    const age=eventAgeHours({posted_at:value});
    if (!Number.isFinite(age)) return "время неизвестно";
    if (age<1) return Math.max(1,Math.round(age*60))+" мин назад";
    if (age<24) return Math.floor(age)+" ч назад";
    return Math.floor(age/24)+" дн назад";
  }
  function safeSourceUrl(url) {
    try { const parsed=new URL(url);return parsed.protocol==="https:"&&parsed.hostname==="t.me"?parsed.href:""; }
    catch (_) { return ""; }
  }
  function makeEventCard(event) {
    const card=document.createElement("article");card.className="event-card";
    const top=document.createElement("div");top.className="event-top";
    const region=document.createElement("div");region.className="event-region";region.textContent=shortRegion(event.region);
    const time=document.createElement("time");time.className="event-time";time.dateTime=event.posted_at||"";time.textContent=relativeTime(event.posted_at);top.append(region,time);
    const meta=document.createElement("div");meta.className="event-meta";
    const tag=document.createElement("span");const category=CATEGORY[event.category]||CATEGORY.other;
    tag.className="tag "+(event.state==="clear"?"clear":event.category||"other");
    tag.textContent=event.state==="clear"?"Отбой · "+category.label:category.label;
    meta.append(tag);
    card.append(top,meta);
    const url=safeSourceUrl(event.url);
    if(url){const link=document.createElement("a");link.className="event-link";link.href=url;link.target="_blank";link.rel="noopener noreferrer";link.textContent="Открыть публикацию в нашем Telegram ↗";card.append(link);}
    return card;
  }
  function plural(n,forms){const n10=n%10,n100=n%100;if(n10===1&&n100!==11)return forms[0];if(n10>=2&&n10<=4&&(n100<12||n100>14))return forms[1];return forms[2];}
  function renderFeed() {
    const root=$("feed");root.replaceChildren();
    const query=$("region-search").value.trim().toLocaleLowerCase("ru");
    const filtered=state.events.filter(event=>{
      const matchCategory=state.category==="all"||event.category===state.category;
      const region=shortRegion(event.region).toLocaleLowerCase("ru");
      return matchCategory&&(!state.region||region===state.region.toLocaleLowerCase("ru"))&&(!query||region.includes(query));
    }).slice(0,80);
    $("feed-count").textContent=filtered.length+" "+plural(filtered.length,["запись","записи","записей"]);
    if(!filtered.length){const empty=document.createElement("div");empty.className="empty-state";empty.textContent=state.events.length?"По выбранным фильтрам сообщений нет.":"Пока нет опубликованных предупреждений с надёжно определённым регионом. Новые события появятся здесь после публикации в Telegram.";root.append(empty);return;}
    const fragment=document.createDocumentFragment();filtered.forEach(event=>fragment.append(makeEventCard(event)));root.append(fragment);
  }
  function renderStats() {
    const stats=state.stats||{};
    $("stat-24h").textContent=Number.isFinite(stats.messages_24h)?stats.messages_24h.toLocaleString("ru-RU"):"—";
    $("stat-regions").textContent=Number.isFinite(stats.regions_6h)?stats.regions_6h.toLocaleString("ru-RU"):"—";
    $("stat-sources").textContent=Number.isFinite(stats.sources)?stats.sources:"1";
  }
  async function loadFeed(manual=false) {
    const label=$("feed-state");
    try {
      const response=await fetch(DATA_URL+"?v="+Date.now(),{cache:"no-store"});if(!response.ok)throw new Error("HTTP "+response.status);
      const data=await response.json();const events=Array.isArray(data.events)?data.events:[];
      state.stats=data.stats&&typeof data.stats==="object"?data.stats:null;
      state.events=events.filter(e=>e&&typeof e.region==="string"&&typeof e.source==="string"&&["uav","rocket","aviation","other"].includes(e.category)&&["warning","clear"].includes(e.state)&&safeSourceUrl(e.url)).sort((a,b)=>Date.parse(b.posted_at)-Date.parse(a.posted_at));
      label.textContent="Лента загружена";
      $("last-update").textContent=data.updated_at?"Данные: "+formatDate(data.updated_at):"Ожидание первой записи";
      renderStats();renderFeed();updateMapStyles();
    } catch(error) {
      label.textContent="Нет соединения с лентой";
      if(manual)$("last-update").textContent="Не удалось обновить данные";
      if(!state.events.length){const empty=document.createElement("div");empty.className="empty-state";empty.textContent="Не удалось загрузить файл данных. Карта доступна, когда появится первая выгрузка из бота.";$("feed").replaceChildren(empty);}
    }
  }
  async function start() {
    try {
      const response=await fetch(REGIONS_URL,{cache:"force-cache"});if(!response.ok)throw new Error("Не удалось загрузить границы регионов");
      const topology=await response.json();
      if(!window.topojson||!topology.objects||!topology.objects.ru89)throw new Error("Не удалось прочитать TopoJSON регионов");
      initializeMap(window.topojson.feature(topology,topology.objects.ru89));
      await loadFeed();$("feed-window").textContent="Последние 72 часа · до 80 записей";
    } catch(error) {$("map").textContent="Не удалось загрузить карту регионов. Перезагрузите страницу.";$("feed-state").textContent="Ошибка карты";}
    $("category-filters").addEventListener("click",event=>{const btn=event.target.closest("button[data-category]");if(!btn)return;state.category=btn.dataset.category;$("category-filters").querySelectorAll("button").forEach(x=>x.classList.toggle("active",x===btn));renderFeed();});
    $("region-search").addEventListener("input",renderFeed);
    $("clear-region").addEventListener("click",()=>selectRegion(""));
    $("reset-map").addEventListener("click",()=>{selectRegion("");$("region-search").value="";state.category="all";$("category-filters").querySelectorAll("button").forEach(x=>x.classList.toggle("active",x.dataset.category==="all"));renderFeed();if(state.map&&state.regionsLayer)state.map.fitBounds(state.regionsLayer.getBounds(),{padding:[18,18]});});
    $("refresh").addEventListener("click",()=>loadFeed(true));
    window.setInterval(()=>loadFeed(false),REFRESH_MS);
  }
  start();
})();