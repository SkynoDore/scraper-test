const puppeteer = require('puppeteer');

const fs = require('fs');
const { parse } = require('json2csv');

// Coordenadas del centro de Madrid
const centroMadrid = { lat: 40.4168, lon: -3.7038 };

 const resultados = [];

// Función para calcular distancia Haversine
function calcularDistancia(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radio de la Tierra en km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return (R * c).toFixed(2);
}

(async () => {
  const browser = await puppeteer.launch({ headless: false, args: ['--window-size=1440,1080']}); // Usar headless: false para ver qué pasa
  const page = await browser.newPage();

  await page.setViewport({
  width: 1440,
  height: 1080});
  await page.goto('https://maps.app.goo.gl/WqdHnKgD1t2tAsYd9', { waitUntil: 'networkidle2' });

  try {
    // Esperar que aparezca el contenedor del consentimiento (puede cambiar el selector con el tiempo)
    await page.waitForSelector('form[action^="https://consent.google.com/s"] button', { timeout: 7000 });

    // Hacer clic en el botón de aceptar
    await page.click('form[action^="https://consent.google.com/s"] button');

    console.log('Consentimiento aceptado.');
    await page.waitForTimeout(3000);
  } catch (e) {
    console.log('No apareció el consentimiento, o ya está aceptado.');
  }

  // Ahora puedes esperar que cargue el contenido principal
  await page.waitForSelector('div.m6QErb.DxyBCb.kA9KIf.dS8AEf.XiKgde.ussYcc', { timeout: 100000 });
  console.log('Contenido de la lista listo para scrapear.');

    await page.waitForSelector('div.m6QErb.XiKgde');

    console.log('Encontrados elementos de la lista')

    try {
  await page.waitForSelector('#widget-zoom-in', { timeout: 5000 });
  for (let i = 0; i < 7; i++) {
    await page.click('#widget-zoom-in');
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  console.log('Zoom aplicado.');
} catch (err) {
  console.warn('No se pudo hacer zoom:', err.message);
}


const candidatos = await page.$$('div.m6QErb.XiKgde');

const lugares = [];

for (const candidato of candidatos) {
  const className = await candidato.evaluate(el => el.className);

  // Saltar si contiene clases sospechosas
  if (className.includes('vRIAEd') || className.includes('tLjsW') || className.includes('Etkrnc')) {
    continue;
  }

  lugares.push(candidato);

    try {
    await candidato.evaluate(el => el.scrollIntoView({ behavior: 'instant', block: 'center' }));
    await candidato.click();
    await new Promise(resolve => setTimeout(resolve, 1000));


    // Obtener la URL con las coordenadas
    const currentUrl = page.url();
    const coordMatch = currentUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    let lat = null, lon = null, distanciaKm = null;

    if (coordMatch) {
      lat = parseFloat(coordMatch[1]);
      lon = parseFloat(coordMatch[2]);
      distanciaKm = calcularDistancia(centroMadrid.lat, centroMadrid.lon, lat, lon);
    }

   const data = await page.evaluate(() => {
      const nombre = document.querySelector('h1.DUwDvf.lfPIob')?.textContent?.trim();
      const direccion = document.querySelector('[data-item-id="address"]')?.textContent?.trim();
      const telefono = document.querySelector('[data-tooltip="Copiar el número de teléfono"]')?.textContent?.trim();
      const web = document.querySelector('[data-tooltip="Abrir el sitio web"] div.rogA2c')?.textContent?.trim();
      return { nombre, direccion, telefono, web };
    });

    if (!data.nombre) {
      console.log('Descartado: sin nombre');
      continue;
    }

    resultados.push({ ...data, distanciaKm });
    console.log({ ...data, distanciaKm });

  } catch (error) {
    console.error('Error al procesar candidato:', error);
    continue;
  }

}
console.log(`Se han registrado ${resultados.length} lugares.`);

const csv = parse(resultados);
fs.writeFileSync('resultados.csv', csv);
console.log('CSV guardado');

await browser.close();
})();

