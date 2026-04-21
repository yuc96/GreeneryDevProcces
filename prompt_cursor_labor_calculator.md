# Prompt para Cursor — Motor de Estimación de Labor, Delivery & Installation (Capa 1)

## Contexto

Necesito implementar la **lógica de cálculo** del motor que sugiere automáticamente los valores de **# personas** y **# horas** para los 6 parámetros del **Labor, Delivery & Installation Calculator** del Módulo 1 (Proposals/GUTS).

Este motor forma parte de un sistema más grande que calcula proposals para una empresa de mantenimiento de plantas (Greenery). El Labor Calculator es una de varias calculadoras dentro del Módulo 1.

**Aclaración importante:** NO necesito que generes componentes, endpoints, controladores ni estructura de carpetas. Ya tengo toda la infraestructura implementada (arquitectura hexagonal con Bun + Elysia + TypeScript). **Solo necesito que implementes la lógica pura del cálculo** — funciones, reglas, value objects de dominio, y el servicio que orquesta las estimaciones.

---

## Regla universal del Labor Calculator

Cada uno de los 6 parámetros se calcula con la misma fórmula:

```
costo_parametro = cantidad_personas × cantidad_horas × $35
```

El costo total de Labor, Delivery & Installation es la suma de los 6:

```
labor_total = load + drive_to_job + unload + install + clean_up + drive_from_job
```

Los 6 parámetros son:

1. **Load** — Carga del pedido en el camión
2. **Drive time to job** — Viaje a la locación del trabajo
3. **Unload** — Descarga del pedido en la locación del cliente
4. **Install** — Instalación del pedido en la ubicación del cliente
5. **Clean up** — Limpieza post-instalación
6. **Drive time from job** — Viaje de regreso a la empresa

---

## Qué necesita decidir el motor

Para cada parámetro, el motor debe sugerir:

- **Cantidad de personas** (número entero, mínimo 1, máximo 4)
- **Cantidad de horas** (decimal, redondeado a intervalos de 0.25 horas, mínimo 0.25)

El usuario (Cindy u Olga) siempre puede hacer override manual de ambos valores después de la sugerencia.

---

## Inputs del motor

El motor recibe una estructura con los datos del proposal ya calculados por otros motores:

```typescript
type LaborEstimationInput = {
  plants: Array<{
    size: "4\"" | "6\"" | "8\"" | "10\"" | "14\"" | "17\"" | "20\"" | "24\"";
    quantity: number;
  }>;
  pots: Array<{
    size: "4\"" | "6\"" | "8\"" | "10\"" | "14\"" | "17\"" | "20\"" | "24\"";
    quantity: number;
  }>;
  materials: Array<{
    type: "hard_foam" | "soft_foam" | "moss" | "dirt" | "mulch" | "gravel" | "decorative_stone";
    estimatedBulks: number; // bultos / unidades estimadas
  }>;
  jobLocation: {
    originAddress: string;      // dirección de la empresa Greenery
    destinationAddress: string; // dirección del cliente
  };
};
```

---

## LÓGICA DE CÁLCULO — PASO A PASO

### Paso 1: Calcular Plant Work Units (PWU)

El PWU es una unidad abstracta que mide el esfuerzo físico requerido para manipular una planta o elemento. Es la **base de todos los cálculos de tiempo** excepto los drive times.

#### 1.1. PWU para plantas

Hay **dos factores PWU distintos** por tamaño: uno para Load/Unload (esfuerzo de transporte) y otro para Install (esfuerzo de colocación).

**Tabla de PWU por tamaño de planta:**

| Tamaño | PWU_Load_Unload | PWU_Install |
|--------|-----------------|-------------|
| 4"     | 0.8             | 0.8         |
| 6"     | 1.0             | 1.0         |
| 8"     | 1.2             | 1.3         |
| 10"    | 1.5             | 1.8         |
| 14"    | 2.5             | 3.0         |
| 17"    | 4.0             | 5.0         |
| 20"    | 6.0             | 7.0         |
| 24"    | 8.0             | 9.0         |

**Fórmula:**

```
pwu_plants_load_unload = Σ (plant.quantity × PWU_Load_Unload[plant.size])
pwu_plants_install     = Σ (plant.quantity × PWU_Install[plant.size])
```

#### 1.2. PWU para pots (macetas)

Los pots también pesan y requieren manipulación. Usan la misma tabla de PWU pero solo aportan al Load/Unload, NO al Install (porque la planta va dentro del pot y ya se cuenta como parte del install de la planta).

**Tabla de PWU para pots:**

| Tamaño | PWU_Load_Unload |
|--------|-----------------|
| 4"     | 0.5             |
| 6"     | 0.7             |
| 8"     | 1.0             |
| 10"    | 1.5             |
| 14"    | 3.0             |
| 17"    | 5.0             |
| 20"    | 7.0             |
| 24"    | 10.0            |

**Fórmula:**

```
pwu_pots_load_unload = Σ (pot.quantity × PWU_Pot_Load_Unload[pot.size])
```

#### 1.3. PWU para materiales

Cada tipo de material tiene un PWU fijo por bulto/unidad estimada:

| Material            | PWU por bulto |
|---------------------|---------------|
| hard_foam           | 0.3           |
| soft_foam           | 0.2           |
| moss                | 0.4           |
| dirt                | 0.8           |
| mulch               | 0.8           |
| gravel              | 1.2           |
| decorative_stone    | 1.5           |

**Fórmula:**

```
pwu_materials_load_unload = Σ (material.estimatedBulks × PWU_Material[material.type])
```

> Los materiales solo cuentan para Load/Unload, no para Install directamente (se usan durante la instalación pero no añaden tiempo separado al install).

#### 1.4. PWU totales consolidados

```
PWU_TOTAL_LOAD_UNLOAD = pwu_plants_load_unload + pwu_pots_load_unload + pwu_materials_load_unload
PWU_TOTAL_INSTALL     = pwu_plants_install
```

---

### Paso 2: Determinar cantidad de personas para Install

Esta es la regla **maestra** — la cantidad de personas decidida aquí se propaga a los demás parámetros según reglas del Paso 3.

**Reglas (se evalúan en este orden, el primer match aplica):**

```
SI existe al menos 1 planta de tamaño 17" O mayor (20", 24") EN EL PROPOSAL:
    personas_install = 2

SINO SI total_plantas_14" > 20:
    personas_install = 2

SINO SI total_plantas_10" > 30:
    personas_install = 2

SINO SI (total_plantas_6" + total_plantas_8") > 50:
    personas_install = 2

SINO:
    personas_install = 1
```

**Pseudocódigo:**

```typescript
function determinePeopleForInstall(plants: Plant[]): number {
  const hasLargePlants = plants.some(p =>
    ["17\"", "20\"", "24\""].includes(p.size) && p.quantity > 0
  );
  if (hasLargePlants) return 2;

  const qty14 = sumQuantityBySize(plants, "14\"");
  if (qty14 > 20) return 2;

  const qty10 = sumQuantityBySize(plants, "10\"");
  if (qty10 > 30) return 2;

  const qtySmall = sumQuantityBySize(plants, "6\"") + sumQuantityBySize(plants, "8\"");
  if (qtySmall > 50) return 2;

  return 1;
}
```

---

### Paso 3: Propagación de personas a los demás parámetros

Una vez determinadas las personas para Install, se aplican las siguientes reglas:

| Parámetro        | Cantidad de personas                               |
|------------------|----------------------------------------------------|
| Load             | = personas_install                                 |
| Drive time to job| = personas_install (todos viajan juntos)           |
| Unload           | = personas_install                                 |
| Install          | = personas_install (calculado en Paso 2)           |
| Clean up         | = personas_install                                 |
| Drive time from job | = personas_install                              |

**Regla simple:** Todos los parámetros usan el mismo número de personas que Install. El equipo va, trabaja y regresa junto.

---

### Paso 4: Calcular horas de INSTALL

El Install usa tiempos fijos por tamaño de planta (ya definidos en la Time Calculator existente del sistema), ajustados por un factor PWU.

**Tiempos base por tamaño (en minutos por planta, para 1 persona trabajando):**

| Tamaño | Minutos por planta |
|--------|---------------------|
| 4"     | 1                   |
| 6"     | 1                   |
| 8"     | 1                   |
| 10"    | 2                   |
| 14"    | 2                   |
| 17"    | 4                   |
| 20"    | 6                   |
| 24"    | 8                   |

**Fórmula:**

```
total_minutos_install = Σ (plant.quantity × minutos_por_tamaño[plant.size])
horas_install_base = total_minutos_install / 60
horas_install = horas_install_base / personas_install
horas_install = redondear_a_cuarto(horas_install)
horas_install = max(0.25, horas_install)
```

**Nota clave:** El tiempo SE DIVIDE por la cantidad de personas (2 personas instalan en la mitad del tiempo). El redondeo final es a intervalos de 0.25h (15 min).

---

### Paso 5: Calcular horas de LOAD

**Productividad base:** 25 PWU por persona por hora (valor real del cliente — "25 plantas por hora" traducido a PWU).

**Fórmula:**

```
horas_load = PWU_TOTAL_LOAD_UNLOAD / (25 × personas_load)
horas_load = redondear_a_cuarto(horas_load)
horas_load = max(0.25, horas_load)
```

---

### Paso 6: Calcular horas de UNLOAD

**Productividad base:** 30 PWU por persona por hora (descarga es ~20% más rápida que la carga porque no hay que organizar el camión).

**Fórmula:**

```
horas_unload = PWU_TOTAL_LOAD_UNLOAD / (30 × personas_unload)
horas_unload = redondear_a_cuarto(horas_unload)
horas_unload = max(0.25, horas_unload)
```

---

### Paso 7: Calcular horas de CLEAN UP

Clean up tiene un tiempo base fijo (limpieza general del sitio) + un tiempo variable según la cantidad de trabajo instalado.

**Fórmula:**

```
minutos_cleanup = 15 + (0.3 × PWU_TOTAL_INSTALL)
horas_cleanup_base = minutos_cleanup / 60
horas_cleanup = horas_cleanup_base / personas_cleanup
horas_cleanup = redondear_a_cuarto(horas_cleanup)
horas_cleanup = max(0.25, horas_cleanup)
```

**Interpretación:** 15 minutos base + 0.3 minutos por cada PWU de install. Un proposal con 50 PWU de install tendría 15 + (0.3 × 50) = 30 min de clean up con 1 persona, o 15 min con 2 personas.

---

### Paso 8: Calcular horas de DRIVE TIME TO JOB y DRIVE TIME FROM JOB

Estos dos parámetros se calculan consultando la **Google Maps Directions API**.

**Flujo:**

1. Llamar a Google Maps Directions API con:
   - `origin`: `input.jobLocation.originAddress` (dirección Greenery)
   - `destination`: `input.jobLocation.destinationAddress` (dirección cliente)
   - `mode`: `driving`
   - `departure_time`: `now` (para obtener tiempo con tráfico estimado)
   - `traffic_model`: `best_guess`

2. Extraer `duration_in_traffic` (en segundos) de la primera ruta del response.

3. Convertir a horas y redondear:

```
duration_seconds = response.routes[0].legs[0].duration_in_traffic.value
horas_drive_to_job = duration_seconds / 3600
horas_drive_to_job = redondear_a_cuarto(horas_drive_to_job)
horas_drive_to_job = max(0.25, horas_drive_to_job)
```

4. Para el regreso (drive time from job), hacer una segunda llamada invirtiendo origin y destination. NO asumas que el tiempo de regreso es igual que el de ida (el tráfico es asimétrico).

```
origin      = input.jobLocation.destinationAddress
destination = input.jobLocation.originAddress
(misma lógica de extracción y redondeo)
```

**Manejo de errores de Google Maps:**

- Si la API falla, timeout, o retorna error → usar un valor por defecto de **0.75 horas** (45 minutos) para cada drive time, y retornar un flag `mapsApiFallbackUsed: true` en el resultado para que el frontend pueda mostrar un aviso.
- Cachear respuestas por par (origin, destination) durante 6 horas para evitar llamadas redundantes si se recalcula el proposal varias veces.

---

### Paso 9: Utilidades auxiliares

#### Redondeo a intervalos de 0.25 horas

```typescript
function roundToQuarter(hours: number): number {
  return Math.round(hours * 4) / 4;
}
```

#### Cálculo de costo por parámetro

```
costo_parametro = personas × horas × 35
```

---

### Paso 10: Output final del motor

El motor debe retornar una estructura con los valores sugeridos, los desgloses usados para llegar a esos valores, y cualquier flag de diagnóstico:

```typescript
type LaborEstimationResult = {
  suggestions: {
    load: {
      people: number;
      hours: number;
      cost: number;
      reasoning: string; // ej: "42 PWU / (25 × 1 persona) = 1.68h → redondeado 1.75h"
    };
    driveToJob: {
      people: number;
      hours: number;
      cost: number;
      reasoning: string;
    };
    unload: {
      people: number;
      hours: number;
      cost: number;
      reasoning: string;
    };
    install: {
      people: number;
      hours: number;
      cost: number;
      reasoning: string;
    };
    cleanUp: {
      people: number;
      hours: number;
      cost: number;
      reasoning: string;
    };
    driveFromJob: {
      people: number;
      hours: number;
      cost: number;
      reasoning: string;
    };
  };
  totals: {
    totalPeopleHours: number; // suma de (personas × horas) de los 6 parámetros
    totalCost: number;         // suma de todos los costos
  };
  debug: {
    pwuTotalLoadUnload: number;
    pwuTotalInstall: number;
    peopleAssignmentRuleMatched: string; // ej: "plants_17_or_larger", "default_1_person"
    mapsApiFallbackUsed: boolean;
  };
};
```

---

## Constantes y parámetros configurables

Todas estas constantes deben vivir en un archivo de configuración **editable sin recompilar** (archivo JSON en disco, variable de entorno, o tabla en base de datos — tú decides según la convención del proyecto):

```typescript
const LABOR_CONFIG = {
  HOURLY_RATE: 35,

  PWU_PLANTS_LOAD_UNLOAD: {
    "4\"": 0.8, "6\"": 1.0, "8\"": 1.2, "10\"": 1.5,
    "14\"": 2.5, "17\"": 4.0, "20\"": 6.0, "24\"": 8.0,
  },

  PWU_PLANTS_INSTALL: {
    "4\"": 0.8, "6\"": 1.0, "8\"": 1.3, "10\"": 1.8,
    "14\"": 3.0, "17\"": 5.0, "20\"": 7.0, "24\"": 9.0,
  },

  PWU_POTS_LOAD_UNLOAD: {
    "4\"": 0.5, "6\"": 0.7, "8\"": 1.0, "10\"": 1.5,
    "14\"": 3.0, "17\"": 5.0, "20\"": 7.0, "24\"": 10.0,
  },

  PWU_MATERIALS_PER_BULK: {
    hard_foam: 0.3, soft_foam: 0.2, moss: 0.4,
    dirt: 0.8, mulch: 0.8, gravel: 1.2, decorative_stone: 1.5,
  },

  INSTALL_MINUTES_PER_PLANT: {
    "4\"": 1, "6\"": 1, "8\"": 1, "10\"": 2,
    "14\"": 2, "17\"": 4, "20\"": 6, "24\"": 8,
  },

  PRODUCTIVITY_LOAD_PWU_PER_PERSON_HOUR: 25,
  PRODUCTIVITY_UNLOAD_PWU_PER_PERSON_HOUR: 30,

  CLEANUP_BASE_MINUTES: 15,
  CLEANUP_MINUTES_PER_PWU: 0.3,

  PEOPLE_RULES: {
    largeSizesRequireTwo: ["17\"", "20\"", "24\""],
    threshold14Inch: 20,
    threshold10Inch: 30,
    thresholdSmallPlants: 50, // suma de 6" + 8"
  },

  MIN_HOURS: 0.25,
  MAX_PEOPLE: 4,

  DRIVE_TIME_FALLBACK_HOURS: 0.75,
  MAPS_CACHE_TTL_HOURS: 6,
};
```

> Esto es **crítico**: el cliente debe poder calibrar estos valores sin que intervenga el equipo de desarrollo. Los PWU, productividades, y tiempos por planta son valores que se ajustarán con el uso real.

---

## Ejemplo completo de cálculo (para que valides tu implementación)

**Input:**
```typescript
{
  plants: [
    { size: "6\"", quantity: 20 },
    { size: "10\"", quantity: 15 },
    { size: "14\"", quantity: 3 }
  ],
  pots: [
    { size: "6\"", quantity: 20 },
    { size: "10\"", quantity: 15 },
    { size: "14\"", quantity: 3 }
  ],
  materials: [
    { type: "dirt", estimatedBulks: 3 },
    { type: "moss", estimatedBulks: 2 }
  ],
  jobLocation: {
    originAddress: "123 Greenery Rd, Columbus, OH",
    destinationAddress: "456 Client Ave, Columbus, OH"
  }
}
```

**Cálculos esperados:**

```
PWU plantas load/unload = (20×1.0) + (15×1.5) + (3×2.5)   = 20 + 22.5 + 7.5 = 50
PWU plantas install     = (20×1.0) + (15×1.8) + (3×3.0)   = 20 + 27 + 9    = 56
PWU pots load/unload    = (20×0.7) + (15×1.5) + (3×3.0)   = 14 + 22.5 + 9  = 45.5
PWU materiales          = (3×0.8) + (2×0.4)               = 2.4 + 0.8      = 3.2

PWU_TOTAL_LOAD_UNLOAD = 50 + 45.5 + 3.2 = 98.7
PWU_TOTAL_INSTALL     = 56

Regla de personas:
  - ¿Plantas 17"+? No
  - ¿14" > 20? No (es 3)
  - ¿10" > 30? No (es 15)
  - ¿6"+8" > 50? No (es 20)
  → personas_install = 1

Propagación: todos los parámetros usan 1 persona.

Install:
  total_min = (20×1) + (15×2) + (3×2) = 20 + 30 + 6 = 56 min
  horas_install_base = 56 / 60 = 0.933h
  horas_install = 0.933 / 1 = 0.933h → redondeado a 1.0h

Load:
  horas = 98.7 / (25 × 1) = 3.948h → redondeado a 4.0h

Unload:
  horas = 98.7 / (30 × 1) = 3.29h → redondeado a 3.25h

Clean up:
  minutos = 15 + (0.3 × 56) = 15 + 16.8 = 31.8 min
  horas_base = 31.8 / 60 = 0.53h
  horas = 0.53 / 1 = 0.53h → redondeado a 0.5h

Drive to job:   Google Maps → supongamos 0.75h
Drive from job: Google Maps → supongamos 0.75h

Costos:
  Load       = 1 × 4.0  × 35 = $140.00
  Drive to   = 1 × 0.75 × 35 = $26.25
  Unload     = 1 × 3.25 × 35 = $113.75
  Install    = 1 × 1.0  × 35 = $35.00
  Clean up   = 1 × 0.5  × 35 = $17.50
  Drive from = 1 × 0.75 × 35 = $26.25

  TOTAL LABOR = $358.75
```

---

## Lo que NO necesito que hagas

- ❌ No crees controladores HTTP ni plugins de Elysia.
- ❌ No crees entidades de base de datos ni migraciones.
- ❌ No implementes UI ni componentes React.
- ❌ No implementes la lógica de override manual (eso es frontend).
- ❌ No implementes Capas 2 ni 3 del motor (solo Capa 1 — la determinística).

---

## Lo que SÍ necesito que hagas

- ✅ Implementa el servicio de dominio `LaborEstimationService` (o el nombre que uses en tu arquitectura) con un método `estimate(input: LaborEstimationInput): Promise<LaborEstimationResult>`.
- ✅ Implementa los value objects y funciones puras auxiliares (cálculo de PWU, redondeo, determinación de personas).
- ✅ Implementa el puerto `GoogleMapsDirectionsPort` con su adaptador concreto que llama a la API de Google Maps.
- ✅ Implementa el sistema de caché simple para las respuestas de Google Maps (en memoria está bien, TTL 6 horas).
- ✅ Carga las constantes `LABOR_CONFIG` desde archivo JSON o variable de entorno, no hardcodeadas en el código de lógica.
- ✅ Incluye tests unitarios para los cálculos críticos: PWU, regla de personas, redondeo, y el ejemplo completo de arriba.

---

## Convenciones del proyecto (asumidas)

- **Runtime:** Bun
- **Lenguaje:** TypeScript estricto
- **Arquitectura:** Hexagonal — la lógica va en `domain/` y `application/`, los adaptadores en `infrastructure/`
- **Testing:** Bun test runner (`bun test`)
- **Estilo:** Funciones puras cuando sea posible, inmutabilidad en value objects, errores tipados

Respeta las convenciones de nombrado y estructura que ya existen en el proyecto. Si ves un módulo similar implementado (por ejemplo otro motor de cálculo), imita ese patrón.

---

## Criterio de aceptación

La implementación es correcta cuando:

1. El ejemplo de arriba produce los valores exactos indicados (margen de 0.01 en costos).
2. Cambiar una constante en `LABOR_CONFIG` afecta los cálculos sin requerir cambios en la lógica.
3. Los tests unitarios pasan al 100%.
4. Un fallo de Google Maps no rompe el cálculo (usa fallback de 0.75h y flag `mapsApiFallbackUsed: true`).
5. El redondeo de horas siempre respeta intervalos de 0.25 (nunca aparece 0.33, 0.67, etc.).
6. Ningún parámetro puede tener menos de 0.25 horas.

Empieza por la implementación del dominio (cálculo PWU, regla de personas, redondeo) y termina con el adaptador de Google Maps. Entrégame los archivos creados/modificados cuando termines.
