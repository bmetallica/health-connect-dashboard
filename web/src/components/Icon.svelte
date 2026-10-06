<script>
  // simple stroke icons (24x24 grid)
  let { name, size = 20, stroke = 2 } = $props();
  const P = {
    today: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
    heart: 'M19.5 12.6 12 20l-7.5-7.4A5 5 0 1 1 12 6a5 5 0 1 1 7.5 6.6z',
    pulse: 'M3 12h4l2-5 4 10 2-5h6',
    moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
    activity: 'M13 4a1.5 1.5 0 1 0 0 .01M9 21l2-6 3 3v3M7 12l3-3 4 1 2 3 3 1M10 9l-1 5',
    vitals: 'M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z',
    body: 'M12 3a2 2 0 1 0 0 .01M5 21h14l-2-9H7zM9 12V9h6v3',
    flask: 'M9 3h6M10 3v6L5 18a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3L14 9V3M7.5 15h9',
    book: 'M4 4.5A1.5 1.5 0 0 1 5.5 3H20v15H5.5A1.5 1.5 0 0 0 4 19.5zM4 19.5A1.5 1.5 0 0 0 5.5 21H20M9 7h7',
    chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
    data: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6',
    user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
    trends: 'M3 17l6-6 4 4 8-8M15 7h6v6',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
    plus: 'M12 5v14M5 12h14',
    edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
    trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
    undo: 'M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
    download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
    calendar: 'M4 6h16v15H4zM4 10h16M9 3v4M15 3v4',
    close: 'M6 6l12 12M18 6 6 18',
    check: 'M5 12l5 5 9-10',
    search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5',
    refresh: 'M20 11a8 8 0 0 0-14.6-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.6 4.5L20 16M20 20v-4h-4',
    file: 'M14 3H6v18h12V7zM14 3v4h4',
    sync: 'M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4',
    phone: 'M7 3h10v18H7zM11 18h2',
    log: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
    archive: 'M3 4h18v4H3zM5 8v12h14V8M10 12h4',
    sources: 'M6 18a3 3 0 1 0 0-.01M18 6a3 3 0 1 0 0-.01M18 18a3 3 0 1 0 0-.01M8.5 16.5l7-9M9 18h6',
    tag: 'M3 12V4h8l10 10-8 8zM7.5 7.5h.01',
    info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-5M12 8h.01',
    arrowUp: 'M12 19V5M6 11l6-6 6 6',
    arrowDown: 'M12 5v14M6 13l6 6 6-6',
    chevron: 'M9 6l6 6-6 6',
    zap: 'M13 3 4 14h7l-1 7 9-11h-7z',
    drop: 'M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z',
    menu: 'M4 7h16M4 12h16M4 17h16',
    sidebar: 'M4 4h16v16H4zM9 4v16',
  };
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={stroke} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="icon">
  <path d={P[name] || P.info} />
</svg>

<style>
  .icon { flex: none; display: block; }
</style>
