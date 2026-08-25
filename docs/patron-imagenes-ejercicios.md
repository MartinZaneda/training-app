# Patrón de imágenes de ejercicios

Este documento define el contrato visual y el control de calidad de cualquier imagen incorporada a la biblioteca de ejercicios.

## Formato visual

- Lienzo cuadrado de 720 × 720 píxeles en WebP.
- Dos paneles iguales, separados por una línea vertical blanca fina.
- Panel izquierdo: posición inicial. Panel derecho: posición final.
- Misma persona, ropa, equipo, cámara e iluminación en ambos paneles.
- Fotografía de estudio fotorrealista con fondo continuo crema cálido y luz suave.
- Ropa lisa en tonos burdeos y coral; calzado neutro; sin logos.
- Cuerpo completo y todo el equipo dentro del encuadre, con margen visible.
- Vista lateral o en tres cuartos que haga inequívoca la trayectoria.
- Sin texto, números, flechas, marcas de agua ni decoración.

## Información obligatoria del prompt

Cada generación debe indicar explícitamente:

1. Nombre y variante exacta del ejercicio.
2. Equipo, agarre, ángulo del banco y punto de anclaje que correspondan.
3. Posición inicial y final, incluidos pies, pelvis, columna, escápulas, codos y muñecas cuando sean relevantes.
4. Trayectoria de la carga y dirección de la resistencia.
5. Apoyos que deben permanecer estables.
6. Restricciones de seguridad presentes en la biblioteca canónica.

## Restricciones anatómicas y mecánicas

- Una sola persona por panel, con exactamente dos brazos, dos manos, dos piernas y dos pies.
- Proporciones humanas naturales, articulaciones posibles y manos cerradas correctamente sobre los agarres.
- Sin miembros duplicados, fusionados, cortados o deformados.
- Sin hiperextensión lumbar o cervical, balanceos o torsiones ajenas al ejercicio.
- Misma cantidad y modelo de cargas en ambos paneles.
- Pesos, bancos y máquinas completamente apoyados; ningún objeto puede flotar.
- Las bandas deben mostrar un anclaje estable, una trayectoria continua y una tensión coherente.
- La posición final no puede contradecir la trayectoria ni cambiar de lado, agarre o equipamiento.

## Validación antes de publicar

Una imagen solo se incorpora cuando supera estas comprobaciones:

- **Identidad:** representa el ejercicio y la variante documentados.
- **Secuencia:** inicio y final son coherentes entre sí.
- **Anatomía:** no hay extremidades, manos o articulaciones imposibles.
- **Técnica:** postura y rango son compatibles con las indicaciones de seguridad.
- **Equipo:** cantidad, montaje, apoyo, agarre y dirección de carga son plausibles.
- **Encuadre:** persona y equipo aparecen completos en ambos paneles.
- **Interfaz:** no contiene texto, códigos, marcas ni elementos que compitan con la ficha.

Si falla una comprobación, se regenera o se corrige antes de asignar el archivo al ejercicio.
