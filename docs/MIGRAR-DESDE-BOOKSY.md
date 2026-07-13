# Migrar a AppCitas desde Booksy (u otra plataforma)

Guía para traerte tu cartera de clientes y tus servicios en 10 minutos con
el importador CSV del panel (`Clientes → Importar clientes desde CSV` y
`Servicios → Importar servicios desde CSV`).

## 1. Exportar tus clientes de Booksy

1. En Booksy Biz (web), ve a **Clients** → menú de opciones → **Export**.
   Booksy envía un CSV al email del dueño (si no ves la opción, pídelo al
   soporte de Booksy: están obligados a dártelo — son tus datos).
2. Abre el CSV. Suele traer columnas tipo `First name`, `Last name`,
   `E-mail`, `Phone`, `Birthday`.
3. Ajusta las cabeceras a las que entiende AppCitas (basta renombrar la
   primera fila; se aceptan español o inglés):

   | AppCitas acepta | Ejemplos que reconoce |
   |---|---|
   | `nombre` | name, cliente, client |
   | `email` | e-mail, correo, mail |
   | `telefono` | phone, móvil, mobile, tel |
   | `nacimiento` | birthday, birth date, cumpleaños |

   > Si Booksy separa nombre y apellidos, combínalos en una sola columna
   > (en Excel/Sheets: `=A2&" "&B2`).
4. Formato de fechas de nacimiento: `AAAA-MM-DD` o `DD/MM/AAAA`.
5. Separador `,` o `;` — ambos valen. Máximo 2 000 filas por archivo (si
   tienes más, divídelo).

## 2. Importar en AppCitas

1. Panel → **Clientes** → tarjeta **Importar clientes desde CSV** → elige el
   archivo.
2. Verás el resumen: cuántos se crearon, cuántos ya existían (mismo email) y
   qué filas se omitieron con su motivo y número de línea.
3. Los importados aparecen en tu cartera con 0 citas y una nota "Importado
   desde CSV"; entran en las campañas de marketing (segmento "Todos" y
   "Cumpleaños" si diste su fecha) desde el primer día.

**Qué NO se importa**: el historial de citas de la otra plataforma (Booksy no
lo exporta de forma utilizable) ni las reseñas. El historial se empieza a
construir con la primera reserva aquí.

## 3. Servicios

Mismo proceso en **Servicios** con un CSV de tres columnas:

```csv
nombre;duracion;precio
Corte de pelo;30;15
Tinte;90;45,50
```

`duracion` en minutos (5–480) y `precio` en euros (coma o punto decimal).
Los que ya existan con el mismo nombre se omiten (no se duplican).

## 4. Después de importar

- Avisa a tus clientes del cambio con una **campaña** (Marketing → segmento
  "Todos"): diles dónde reservar a partir de ahora y comparte tu enlace o QR.
- Los clientes importados reservan como siempre; si se registran con el
  mismo email, su ficha y su historial se unifican solos.

## Privacidad (RGPD)

Eres el responsable de esos datos: solo importa clientes REALES tuyos, con
los que tengas relación comercial. AppCitas los trata como encargado según
los términos; los clientes pueden ejercer sus derechos (acceso/supresión)
desde su cuenta o pidiéndotelo a ti (Clientes → ficha → Anonimizar).
