#!/usr/bin/env bash
set -euo pipefail

IMAGE_NAME="inditex-scoring-engine"
HOST_PORT=8088
CONTAINER_PORT=8080
MACHINE_NAME=$(podman machine list --format '{{.Name}}' | head -n 1)

echo "▶ Asegurando que la Podman Machine '${MACHINE_NAME}' está arrancada..."
if ! podman info &>/dev/null; then
  echo "  ↳ Podman Machine no disponible. Iniciando..."
  podman machine start "${MACHINE_NAME}"
else
  echo "  ↳ Podman Machine ya está corriendo"
fi

echo "▶ Verificando si el puerto ${HOST_PORT} está en uso..."
LISTEN_PID=$(lsof -tiTCP:${HOST_PORT} -sTCP:LISTEN || true)

if [[ -n "$LISTEN_PID" ]]; then
  echo "  ↳ Puerto ${HOST_PORT} en uso por PID ${LISTEN_PID}"

  # Buscar contenedor asociado al puerto
  echo "▶ Buscando contenedor que usa el puerto..."
  CONTAINER_ID=$(podman ps --format '{{.ID}} {{.Ports}}' \
    | grep "${HOST_PORT}" | awk '{print $1}' || true)

  if [[ -n "$CONTAINER_ID" ]]; then
    echo "  ↳ Contenedor ${CONTAINER_ID} usa el puerto. Eliminando..."
    podman rm -f "$CONTAINER_ID" || echo "  ⚠️ Falló al eliminar contenedor."
  else
    echo "  ⚠️ No se encontró contenedor en Podman, liberando PID directamente..."
    kill -9 "$LISTEN_PID" || echo "  ⚠️ No se pudo matar el proceso directamente."
  fi
else
  echo "  ↳ Puerto ${HOST_PORT} libre"
fi

echo "▶ Reconstruyendo imagen '${IMAGE_NAME}' sin caché..."
podman build --no-cache --arch linux/amd64 -t "${IMAGE_NAME}" .

echo "▶ Lanzando contenedor con puerto ${HOST_PORT}:${CONTAINER_PORT}..."
podman run --rm --platform linux/amd64 -p ${HOST_PORT}:${CONTAINER_PORT} "${IMAGE_NAME}"