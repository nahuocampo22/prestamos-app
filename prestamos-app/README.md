# Sistema de Préstamos 💰 (versión compartida en internet)

Sistema para llevar el control de a quién le prestaste plata, cuánto, cuándo
te tiene que pagar, y mandarle recordatorios por WhatsApp con un click.

Esta versión guarda los datos en una base de datos **compartida en
internet**, para que se vean exactamente iguales desde tu computadora y la
de tu papá al mismo tiempo, estén o no en la misma WiFi. Todo con servicios
gratuitos.

---

## Cómo funciona (resumen)

En vez de instalar un programa en cada compu, esta vez el sistema queda
"alojado" en internet, como si fuera una página web propia. Cualquiera de
las dos compus (o el celular) simplemente entra a una dirección tipo
`https://prestamos-app.onrender.com` y ve siempre los mismos datos,
actualizados al instante.

Para lograr esto sin pagar nada, usamos tres servicios gratuitos:

1. **GitHub** → ahí sube el código del sistema (como una "caja" con todos
   los archivos).
2. **Neon** → la base de datos donde se guardan los clientes, préstamos y
   pagos.
3. **Render** → toma el código de GitHub y la base de Neon, y los pone
   funcionando en internet, con una dirección propia.

Los tres tienen plan gratis para siempre y no piden tarjeta de crédito.

> Único detalle del plan gratis: si nadie entra al sistema durante 15
> minutos, se "duerme", y la próxima vez que alguien entra tarda unos 30-60
> segundos en despertarse. Después funciona normal y rápido. Para el uso de
> este sistema (consultar unas pocas veces al día) no es un problema.

---

## Paso 1: Crear cuenta en GitHub y subir el código

1. Andá a **https://github.com** y creá una cuenta gratis (con tu email).
2. Una vez adentro, arriba a la derecha apretá el **+** y elegí **"New
   repository"**.
3. Ponele de nombre `prestamos-app`, dejalo en **Public**, y apretá **"Create
   repository"**.
4. En la pantalla que aparece, buscá el link que dice **"uploading an
   existing file"** (o andá a la pestaña de arriba y buscá "Add file" →
   "Upload files").
5. Arrastrá **todos los archivos y carpetas** que están dentro de la carpeta
   `prestamos-app` que te mandé (incluida la carpeta `public`) a esa
   pantalla.
6. Abajo, en "Commit changes", apretá el botón verde **"Commit changes"**.

Listo, el código ya está en internet, en tu cuenta de GitHub.

---

## Paso 2: Crear la base de datos en Neon

1. Andá a **https://neon.tech** y creá una cuenta gratis (podés usar la
   cuenta de GitHub que recién creaste para entrar más rápido).
2. Te va a pedir crear un proyecto: ponele de nombre `prestamos` y dejá el
   resto de las opciones como vienen.
3. Cuando se crea el proyecto, buscá el botón o cartel que dice **"Connection
   string"** (cadena de conexión). Vas a ver algo como:

   ```
   postgresql://usuario:contraseña@ep-algo-123456.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

4. **Copiá esa dirección completa** y guardala en un Bloc de notas por un
   momento — la vamos a necesitar en el paso siguiente.

---

## Paso 3: Publicar el sistema en Render

1. Andá a **https://render.com** y creá una cuenta gratis (podés entrar
   directo con la cuenta de GitHub, es lo más rápido).
2. Apretá **"New +"** → **"Web Service"**.
3. Elegí conectar tu cuenta de GitHub y seleccioná el repositorio
   `prestamos-app` que creaste antes.
4. Te va a pedir algunos datos, completá así:
   - **Name**: `prestamos-app` (o el nombre que quieras)
   - **Region**: la más cercana (Ohio o Virginia están bien para
     Argentina)
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: **Free**
5. Bajá hasta donde dice **"Environment Variables"** y agregá una:
   - **Key**: `DATABASE_URL`
   - **Value**: pegá ahí la dirección que copiaste de Neon en el paso 2.
6. Apretá **"Create Web Service"**.

Render va a tardar unos minutos instalando y arrancando el sistema. Cuando
termine (vas a ver "Live" en verde arriba), te va a mostrar una dirección
propia, algo como:

```
https://prestamos-app.onrender.com
```

**Esa es la dirección definitiva del sistema.** Es la misma para vos, para
tu papá, y para entrar desde cualquier celular, estén donde estén.

---

## Paso 4: Usarlo desde las dos computadoras (y celulares)

1. Abrí esa dirección en el navegador de tu compu y de la de tu papá.
2. En ambas, guardala como favorito/marcador para no tener que escribirla
   cada vez ("Agregar a favoritos" en el navegador).
3. En el celular, se puede "Agregar a pantalla de inicio" para que quede
   como un ícono.
4. No hace falta instalar Node.js en ninguna de las dos computadoras para
   esta versión — todo corre en internet, el navegador alcanza.

Cualquier cambio que haga uno (cargar un cliente, marcar un pago) se ve
inmediatamente en la otra compu con solo actualizar la página (F5).

---

## Recibir pedidos de préstamo sin responder mensajes

En la pestaña **"Solicitudes"** de la app hay un link público (algo como
`https://prestamos-app-b67q.onrender.com/solicitud`) que podés compartir con
cualquiera que te pida un préstamo. Esa persona completa ahí su nombre,
teléfono, cuánto necesita, cómo prefiere devolverlo, y de parte de quién
viene — sin que tengas que responderle nada vos.

Esa solicitud aparece automáticamente en la pestaña "Solicitudes" (con un
numerito rojo avisando cuántas hay pendientes). Desde ahí podés:

- **Aceptar**: elegís el interés y confirmás las condiciones finales — el
  sistema crea el cliente (si no existía) y el préstamo solo.
- **Rechazar**: la descarta.

En los dos casos hay un botón para avisarle a esa persona por WhatsApp con
un mensaje ya armado (aprobado o no).

Ese link es de acceso libre a propósito (para que cualquiera pueda pedir un
préstamo sin necesitar usuario y contraseña), pero solo sirve para *enviar*
una solicitud — no muestra ningún dato de tus clientes ni préstamos
existentes.

---

## Cómo funcionan los recordatorios de WhatsApp

Igual que antes: el sistema arma el mensaje automáticamente y con un click
abre WhatsApp con todo listo para enviar — vos apretás "Enviar" desde tu
celular o desde WhatsApp Web en la compu.

---

## Cómo se calcula la ganancia

- **Total a cobrar** = Capital + (Capital × Interés / 100)
- **Ganancia** = Total a cobrar − Capital

Si el préstamo es en cuotas, ese total se reparte en partes iguales entre la
cantidad de cuotas, armando automáticamente las fechas según la frecuencia
elegida (semanal, quincenal o mensual).

---

## Backups

Los datos viven en Neon. Neon guarda automáticamente un historial reciente
de la base (podés restaurar a un punto anterior desde su panel, sección
"Restore", dentro de los últimos días). Igualmente, cada tanto podés
exportar los datos manualmente desde el panel de Neon ("SQL Editor" →
consultar y descargar) como respaldo extra.

---

## Preguntas frecuentes

**"Tarda en cargar la primera vez que entro en el día"**
Es normal, el plan gratis de Render "duerme" el sistema después de 15
minutos sin uso. Tarda unos 30-60 segundos en la primera carga del día, después
anda rápido.

**"Quiero cambiar el nombre del sistema o algo del diseño"**
Los archivos están en la carpeta `public/` (para el diseño) y `server.js`
(para el funcionamiento). Cualquier cambio que subas a GitHub, Render lo
publica solo, automáticamente, en un par de minutos.

**"Marqué un pago por error"**
Entrá al préstamo correspondiente (pestaña "Préstamos") y en esa cuota vas
a ver un botón "Deshacer".

**"¿Esto tiene algún costo?"**
No, mientras te mantengas dentro de los límites gratis de Render y Neon
(de sobra para el uso de una sola familia). Si en algún momento querés más
velocidad o que nunca se "duerma", existen planes pagos de unos pocos
dólares por mes en Render.
