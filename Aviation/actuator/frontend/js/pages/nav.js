export function mountNav() {
  const el = document.getElementById('app-nav');
  if (!el) return;
  el.innerHTML = `
    <nav class="app-nav">
      <a href="index.html">Action Board</a>
      <a href="trips.html">Trips</a>
      <a href="reference-airports.html">Reference Data</a>
    </nav>
  `;
}
