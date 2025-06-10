document.getElementById('formulario').addEventListener('submit', (e) => {
    e.preventDefault();
    const url = document.getElementById('url').value;
    document.getElementById('estado').textContent = 'Scraping iniciado...';

    window.electronAPI.iniciarScraper(url);
    window.electronAPI.onScraperFin((msg) => alert(msg));

});