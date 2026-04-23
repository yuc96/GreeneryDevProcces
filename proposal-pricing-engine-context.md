# Contexto del documento: Proposal Pricing Engine (GUTS)

Este archivo describe el contenido lógico y de negocio de **`proposal-pricing-engine.html`**: el **motor de generación de propuestas (GUTS)** para **Greenery Productions**, documentado para aprobación del cliente antes del desarrollo.

**Uso para una IA:** servir como especificación de negocio y fórmulas; el HTML es la presentación imprimible (A4), no un motor de ejecución.

---

## 1. Propósito y alcance

- **Qué es:** documentación de fórmulas y reglas del “Proposal Pricing Engine”.
- **Stakeholders:** Greenery Productions (cliente) × Snappiffy (desarrollo).
- **Estado:** documento sujeto a aprobación del cliente para proceder al desarrollo.
- **Qué NO es:** no implementa cálculos en tiempo real; es documentación estructurada en secciones numeradas.

---

## 2. Formato del archivo fuente (HTML)

| Aspecto | Detalle |
|--------|---------|
| Idioma por defecto | `lang-es` (español) en `<body>`. |
| Bilingüe | Bloques con `data-lang="es"` y `data-lang="en"`. |
| Conmutación de idioma | `setLang('es' | 'en')` cambia clase del body: `lang-es` / `lang-en`. |
| Impresión | `window.print()`; estilos `@media print` (toolbar oculta, A4). |
| Marca | Logo `assets/fulllogo_transparent_nobuffer.png`. |
| Estructura | `.page` → cabecera, índice, `.content` (secciones 1–10), firmas, pie. |

**Anchor IDs de secciones:** `#s1` … `#s10`.

---

## 3. Índice lógico (secciones)

1. **Motor de plantas** — Plantas (Qty, Wholesale, Markup, freight 25%, retail, totales de línea).
2. **Motor de contenedores (pots)** — Misma lógica que plantas; freight **25%** (el texto de la sección 1 también fija 25% para plantas; coherente entre motores 1 y 2).
3. **Materiales (staging)** — Idéntico al motor de contenedores en fórmulas; solo cambia la clasificación en el resumen.
4. **Calculadora de tiempo de instalación** — Minutos por tamaño de planta → horas; alimenta la sección 5.
5. **Mantenimiento mensual** — MMG y MM; overhead por tiers; horas a $35 y factor 4.33.
6. **Labor, Delivery & Installation** — Solo fórmula base documentada; detalle en pausa.
7. **Freight general** — Suma de freights de plantas, contenedores y materiales.
8. **Rotaciones** — Catálogo fijo, 3 frecuencias, P1/P2/P3; capacidad P2 15 o 20 plantas/hora.
9. **Parámetros opcionales** — Sub-irrigación (precios fijos) y comisiones.
10. **Composición final del proposal** — 11 rubros de totalización + fórmula de total.

---

## 4. Constantes y parámetros globales (por sección)

### Plantas, contenedores, materiales (1–3)

- **Markup:** 1.5 a 3.0 en pasos de 0.5; **default 2.5** (mismo para plantas, contenedores, staging).
- **Freight (unitario):** `Wholesale × 25%` (plantas, contenedores, staging según se documenta en 1–3).
- **Total línea planta/contenedor:** `(Qty × Retail) + (Qty × Freight unitario)`.
- **Retail (unitario):** `Wholesale × Markup`.

### Tiempo de instalación (4)

- Plantas **10"–14":** **2** minutos por planta.
- Plantas **6"–8":** **1** minuto por planta.
- **Horas de instalación** = `Total minutos ÷ 60`.
- Uso: alimenta **On Site Hours Per Week** o equivalente en la sección 5 (documento: resultado de sección 4).

### Mantenimiento (5)

- **Cost per Month (Horas):** `On Site Hours Per Week × $35 × 4.33`  
  (4.33 = semanas/mes, 52/12, fijo).
- **Cost per Month (Plantas):** `(Wholesale Cost of Plants × 0.65) ÷ 12`  
  con `Wholesale Cost of Plants = Σ (Wholesale × Qty)` sobre líneas de plantas.
- **Tier para overhead:** se evalúa `Cost per Month (Horas) + Cost per Month (Plantas)` (no el wholesale bruto de plantas solo).
- **Tiers (factor de overhead):**

  | Suma (Horas + Plantas) | Factor |
  |------------------------|--------|
  | < $500 | 0.80 |
  | ≥ $500 y < $1,000 | 0.65 |
  | ≥ $1,000 y < $3,000 | 0.50 |
  | ≥ $3,000 | 0.45 |

- **Overhead:** `(Cost per Month Horas + Cost per Month Plantas) × factor del tier`.

**Dos resultados mensuales:**

- **MMG (Guaranteed Monthly Maintenance):**  
  `Cost per Month (Horas) + Cost per Month (Plantas) + Overhead`.
- **MM (Monthly Maintenance):**  
  `Cost per Month (Horas) + Overhead`  
  (sin el componente “plantas” del mes).

**Reglas de negocio documentadas:**

- Por defecto: **indoor** → enfoque **MMG**; **outdoor** → enfoque **MM**.
- **Configurable:** si el cliente no quiere garantía en indoor, no se suma MMG y esas plantas van al esquema **MM**.

### Labor, Delivery & Installation (6)

- **En pausa** respecto a reglas detalladas (sugerencias, PWU, mapas, etc.).
- **Fórmula base por ítem/parámetro:** `# Personas × # Horas × Precio por Hora` (el documento no fija un valor de tarifa en esta sección; es genérico).

### Freight general (7)

- **Freight General** = `Freight Plantas + Freight Contenedores + Freight Materiales`  
  cada término como suma de `Qty × Wholesale × 25%` por todas las líneas del motor correspondiente.

### Rotaciones (8)

- **4 familias de catálogo:** Bromeliads, Orchids, **Color Succulents**, Color rotation.
- **3 frecuencias (input por línea):** cada 4 / 6 / 8 semanas → **Frecuencia = 4, 6 u 8** (tal como está en el HTML).

**P1 — costo de plantas (mensual prorrateado):**

\[
P1 = (Qty \times \text{Precio de venta} \times \text{Frecuencia}) / 12
\]

**P2 — labor de rotación (misma estructura, con tarifa y capacidad):**

- Tarifa labor: **$35/hora** (fijo en el documento).
- **Capacidad plantas/hora (divisor de cantidades):**
  - **15** plantas/hora: Bromeliads, Color rotation, Color Succulents.
  - **20** plantas/hora: **solo Orchids**.

\[
P2 = \left(\left(\frac{\sum Qty\ \text{per size}}{\text{Capacidad plantas/hora}}\right) \times 35 \times \text{Frecuencia}\right) / 12
\]

**P3 — freight de rotación:**

- **25%** sobre `Σ (Qty × Precio de venta por tamaño/línea de catálogo)`; luego × Frecuencia y ÷ 12.

\[
P3 = \left(\left(\sum (Qty \times \text{Precio de venta}) \times 25\%\right) \times \text{Frecuencia}\right) / 12
\]

- **Costo de línea de rotación:** `P1 + P2 + P3`.

**Catálogo de precios (venta) en el HTML:**

- **Bromeliad:** 4" 11.50, 6" 17.50, 8" 37.50, 14" 200.00.
- **Orchid:** 4" Single 24, 6" Single 32, 6" Double 38.75.
- **Succulent (Color Succulents):** 2" 4, 3" 5, 4" 8.50, 6" 24.
- **Color rotation:** Annual 4" 2.50, 6" 13.75, 8" 18.75; Mum 6" 18.75.

### Parámetros opcionales (9)

**9A — Sub-irrigación (precio fijo por tamaño de maceta):** 17" $48, 14" $26, 10" $16, 8" $9.

**9B — Comisiones:**

- `Commission %` configurable, **default 5%**.
- `Beneficiary %` configurable, **default 100% (1.0)**.
- **Total Plants** = `Σ (Qty × Retail)` plantas. Igual contenedores y materiales (con sus Qty/Retail).
- **Comisión bruta** = `Total Plantas×5% + Total Contenedores×5% + Total Materiales×5%` (el texto fija 5% en la fórmula mostrada).
- **Comisión del beneficiario** = `Comisión bruta × % Beneficiario`.
- Se **incrusta** en el total del proposal **sin** línea separada visible al cliente; distribución proporcional entre plantas, contenedores y materiales en resumen.

---

## 5. Composición final del total (sección 10)

El **TOTAL PROPOSAL** es la **suma de 11 conceptos** (no 10):

1. Compra de plantas (+ comisión)
2. Compra de contenedores (+ comisión)
3. Compra de materiales (+ comisión)
4. Labor, Delivery & Installation (sección 6)
5. Freight general (sección 7)
6. Rotación Bromeliads (si aplica) — sección 8
7. Rotación Orchids (si aplica) — sección 8
8. Rotación Color Succulents (si aplica) — sección 8
9. Color rotation (si aplica) — sección 8
10. **MMG** (sección 5, si aplica a plantas garantizadas)
11. **MM** (sección 5, si aplica a no garantizadas / outdoor)

**Fórmula resumida en el HTML:**

> `Plantas + Contenedores + Materiales + Labor + Freight + Rot. Bromeliads + Rot. Orchids + Rot. Color Succulents + Rot. Color rotation + MMG + MM`

(En inglés: mismos términos con nombres en inglés.)

---

## 6. Dependencias entre secciones

| De | A | Relación |
|----|---|----------|
| Sección 4 (tiempo instalación) | Sección 5 | Entrada de horas para cost per month (horas). |
| Sección 1 (plantas) | Sección 5 | Wholesale cost of plants, tiers, MMG. |
| Secciones 1–3 | Sección 7 | Freight por motor sumado. |
| Sección 5 | Sección 10 | MMG y/o MM en el total. |
| Sección 6 | Sección 10 | Labor, delivery, installation. |
| Sección 8 | Sección 10 | Cuatro posibles subtotales de rotación. |
| Sección 9 | Secciones 1–3 y total | Comisión sobre retails de plantas, contenedores, materiales. |

---

## 7. Firmas y pie de página

- **Cliente:** Matt Grier, Greenery Productions Inc.
- **Snappiffy:** Manuel Ferrer.
- **Pie:** Greenery Productions · Orlando, Florida; texto de que el documento está sujeto a aprobación.

---

## 8. Inconsistencias o puntos a vigilar (para implementación)

1. **Título de la sección 5 vs contenido:** el título sigue diciendo “Mantenimiento Mensual Garantizado” / “Guaranteed Monthly Maintenance Calculator”, pero el cuerpo define **también MM** no garantizado. Una IA o un UI debería tratar la sección como “mantenimiento mensual (MMG + MM)”.
2. **Labor sección 6:** sin tarifa fija; la rotación  sí usa **$35/h** explícitamente.
3. **Comisiones:** la variable es “configurable 5%” pero la fórmula escrita usa literalmente 5% en los tres términos; si se cambia el %, la fórmula del documento habría que alinearla.

---

## 9. Cómo mantener este contexto

- Tras editar `proposal-pricing-engine.html`, actualizar este `.md` si cambian fórmulas, tiers, catálogos, número de ítems del total o reglas MMG/MM.
- Fecha de referencia del análisis: coherente con el repo en el que vive el HTML.

---

*Generado a partir de `proposal-pricing-engine.html` para consumo de sistemas o asistentes de IA.*
