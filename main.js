const puppeteer = require('puppeteer');
const fs = require('fs');
const {
  parse
} = require('json2csv');


const startTime = Date.now();
const resultados = [];
const nombresRegistrados = new Set();
let idCounter = 1;
let listaLugares = [];
let ultimoIndiceProcesado = 0;


// Coordenadas del centro de Madrid
const centroMadrid = {
  lat: 40.4168,
  lon: -3.7038
};
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
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--window-size=1440,1080']
  }); // Usar headless: false para ver qué pasa
  const page = await browser.newPage();

  await page.setViewport({
    width: 1440,
    height: 1080
  });
  await page.goto('https://maps.app.goo.gl/WqdHnKgD1t2tAsYd9', {
    waitUntil: 'networkidle2'
  });
  try {
    try {
      // Esperar que aparezca el contenedor del consentimiento (puede cambiar el selector con el tiempo)
      await page.waitForSelector('form[action^="https://consent.google.com/s"] button', {
        timeout: 7000
      });

      // Hacer clic en el botón de aceptar
      await page.click('form[action^="https://consent.google.com/s"] button');

      console.log('Consentimiento aceptado.');
      await page.waitForTimeout(3000);
    } catch (e) {
      console.log('No apareció el consentimiento, o ya está aceptado.');
    }

    // Ahora puedes esperar que cargue el contenido principal
    await page.waitForSelector('div.m6QErb.DxyBCb.kA9KIf.dS8AEf.XiKgde.ussYcc', {
      timeout: 100000
    });
    console.log('Contenido de la lista listo para scrapear.');

    await page.waitForSelector('div.m6QErb.XiKgde');

    console.log('Encontrados elementos de la lista')

    try {
      await page.waitForSelector('#widget-zoom-in', {
        timeout: 7000
      });
      for (let i = 0; i < 7; i++) {
        await page.click('#widget-zoom-in');
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      console.log('Zoom aplicado.');
    } catch (err) {
      console.warn('No se pudo hacer zoom:', err.message);
    }

    const candidatos = await page.$$('div.m6QErb.XiKgde');
    while (true) {
      const nuevosCandidatos = await page.$$('div.m6QErb.XiKgde');
      let nuevosEncontrados = 0;

      for (const candidato of nuevosCandidatos) {
        const nombre = await candidato.evaluate(el =>
          el.querySelector('div.fontHeadlineSmall.rZF81c')?.textContent?.trim()
        );

        const className = await candidato.evaluate(el => el.className);

        // Saltar si contiene clases sospechosas
        if (className.includes('vRIAEd') || className.includes('tLjsW') || className.includes('Etkrnc')) {
          console.log('Descartado: clase sospechosa', className);
          continue;
        }

        if (!nombre) {
          console.log('Descartado: sin nombre');
          continue;
        }

        if (nombresRegistrados.has(nombre)) {
          console.log(`Lugar repetido: ${nombre}`);
          continue;
        }

        listaLugares.push({
          id: idCounter++,
          nombre
        });
        nuevosEncontrados++;
      }

      console.log(`Detectados ${nuevosEncontrados} elementos.`);


      for (; ultimoIndiceProcesado < listaLugares.length; ultimoIndiceProcesado++) {
        const {
          nombre
        } = listaLugares[ultimoIndiceProcesado];

        try {
          const candidatosActuales = await page.$$('div.m6QErb.XiKgde');
          let candidato = null;

          for (const cand of candidatosActuales) {
            const nombreCand = await cand.evaluate(el =>
              el.querySelector('div.fontHeadlineSmall.rZF81c')?.textContent?.trim()
            );
            if (nombreCand === nombre) {
              candidato = cand;
              break;
            } else {

              await cand.dispose(); // liberar los que no se usan

            }
          }

          if (!candidato) {
            console.log(`No se encontró candidato para "${nombre}"`);
            continue;
          }

          const clickable = await candidato.$('div.fontHeadlineSmall.rZF81c');

          if (clickable) {
            console.log(`Clicando en el elemento correcto para "${nombre}"`);
            await clickable.click();
          } else {
            console.warn(`No se encontró el clicable para "${nombre}"`);
          }
          await new Promise(resolve => setTimeout(resolve, 1500));



          // Extraer coordenadas de la URL
          const currentUrl = page.url();
          const coordMatch = currentUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
          let lat = null,
            lon = null,
            distanciaKm = null;
          if (coordMatch) {
            lat = parseFloat(coordMatch[1]);
            lon = parseFloat(coordMatch[2]);
            distanciaKm = calcularDistancia(centroMadrid.lat, centroMadrid.lon, lat, lon);
          }

          const data = await page.evaluate(() => {
            const nombre = document.querySelector('h1.DUwDvf.lfPIob')?.textContent?.trim();
            if (!nombre) return null;
            const direccion = document.querySelector('[data-item-id="address"]')?.textContent?.trim();
            const telefono = document.querySelector('[data-tooltip="Copiar el número de teléfono"]')?.textContent?.trim();
            const web = document.querySelector('[data-tooltip="Abrir el sitio web"] div.rogA2c')?.textContent?.trim();
            return {
              nombre,
              direccion,
              telefono,
              web
            };
          });

          if (!data || !data.nombre) {
            console.log('Descartado: sin nombre');
            continue;
          }

          const yaExiste = resultados.some(
            r => r.nombre === data.nombre && r.direccion === data.direccion
          );
          if (yaExiste) {
            console.log(`Duplicado detectado: ${data.nombre} - ${data.direccion}`);
            continue;
          }

          resultados.push({
            ...data,
            distanciaKm
          });

          nombresRegistrados.add(data.nombre);

          console.log({
            ...data,
            distanciaKm
          });
          await candidato.dispose(); // 🔥 liberar el handle
        } catch (err) {
          console.warn(`Error procesando ${nombre}:`, err.message);
        }
      }

      // Si no se encontró nada nuevo, se asume que no hay más resultados nuevos
      if (nuevosEncontrados === 0 && ultimoIndiceProcesado >= listaLugares.length) {
        console.log('No se encontraron nuevos lugares, fin del scraping.');
        break;
      }

      // Esperar que se cargue nuevo contenido
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  } catch (error) {
    console.error('Error durante el scraping:', error);
  } finally {
    console.log(`Se han registrado ${resultados.length} lugares.`);

    const duration = (Date.now() - startTime) / 1000;
    console.log(`Tiempo total: ${duration} segundos.`);

    const csv = parse(resultados);

    const fecha = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
    fs.writeFileSync(`resultados_${fecha}.csv`, csv);

    console.log('CSV guardado');

    await browser.close();
  }
})();